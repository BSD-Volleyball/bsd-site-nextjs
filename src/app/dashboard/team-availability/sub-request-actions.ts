"use server"

/**
 * Captain-to-captain sub requests.
 *
 * A captain who is short players asks to borrow a rostered player from
 * another team for one match. The TARGET player's captain approves or
 * declines; approval creates the match_substitutions row in the same
 * transaction (via insertMatchSubstitution with "rostered" eligibility) and
 * auto-cancels sibling pending requests for the same slot. Pending requests
 * whose match date has passed are lazily expired. All transitions email the
 * affected captains/player through the notification dispatcher.
 */

import { and, eq, inArray, lt, ne, or, aliasedTable } from "drizzle-orm"
import { db } from "@/database/db"
import {
    matchSubstitutions,
    matches,
    subRequests,
    teams,
    users
} from "@/database/schema"
import {
    type ActionResult,
    ActionError,
    fail,
    ok,
    requirePositiveInt,
    requireSeasonConfig,
    requireSession,
    withAction
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
import {
    formatEventDate,
    formatMatchTime,
    getLeagueDateString
} from "@/lib/date-utils"
import { buildSubRequestEmailHtml } from "@/lib/email-html"
import { insertMatchSubstitution } from "@/lib/match-substitutions"
import {
    dispatchNotification,
    type NotificationRecipient
} from "@/lib/notifications/dispatch"
import type { NotificationType } from "@/lib/notifications/types"
import { findActiveTeamForUser, resolveActiveUserForSlot } from "@/lib/roster"
import { canAccessTeam } from "@/lib/team-access"
import { formatDisplayName } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

interface TeamMeta {
    id: number
    name: string | null
    number: number | null
    captain: string
    captain2: string | null
}

async function getTeamMeta(teamId: number): Promise<TeamMeta | null> {
    const [row] = await db
        .select({
            id: teams.id,
            name: teams.name,
            number: teams.number,
            captain: teams.captain,
            captain2: teams.captain2
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)
    return row ?? null
}

function teamLabel(team: TeamMeta): string {
    return team.name || `Team ${team.number ?? team.id}`
}

async function getUserRecipients(
    userIds: string[]
): Promise<NotificationRecipient[]> {
    if (userIds.length === 0) return []
    const rows = await db
        .select({
            id: users.id,
            email: users.email,
            firstName: users.first_name,
            preferredName: users.preferred_name
        })
        .from(users)
        .where(inArray(users.id, userIds))
    return rows.map((u) => ({
        userId: u.id,
        email: u.email,
        firstName: u.preferredName || u.firstName
    }))
}

function captainIdsOf(team: TeamMeta, exclude?: string): string[] {
    return [team.captain, team.captain2].filter(
        (id): id is string => !!id && id !== exclude
    )
}

async function getUserName(userId: string): Promise<string> {
    const [row] = await db
        .select({
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    return row
        ? formatDisplayName(row.firstName, row.lastName, row.preferredName)
        : userId
}

interface MatchMeta {
    id: number
    season: number
    date: string | null
    time: string | null
    court: number | null
    homeTeam: number | null
    awayTeam: number | null
}

async function getMatchMeta(matchId: number): Promise<MatchMeta | null> {
    const [row] = await db
        .select({
            id: matches.id,
            season: matches.season,
            date: matches.date,
            time: matches.time,
            court: matches.court,
            homeTeam: matches.home_team,
            awayTeam: matches.away_team
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)
    return row ?? null
}

function matchDetailRows(
    match: MatchMeta
): Array<{ label: string; value: string }> {
    return [
        {
            label: "Date:",
            value: match.date ? formatEventDate(match.date) : "TBD"
        },
        {
            label: "Time:",
            value: match.time ? formatMatchTime(match.time) : "TBD"
        },
        {
            label: "Court:",
            value: match.court != null ? `Court ${match.court}` : "TBD"
        }
    ]
}

async function notifySubRequestParties(opts: {
    type: NotificationType
    userIds: string[]
    heading: string
    intro: string
    details: Array<{ label: string; value: string }>
    note?: string | null
    subject: string
    tag: string
}): Promise<void> {
    const recipients = await getUserRecipients([...new Set(opts.userIds)])
    await dispatchNotification({
        type: opts.type,
        recipients,
        subject: opts.subject,
        htmlBody: (r) =>
            buildSubRequestEmailHtml({
                firstName: r.firstName ?? "Captain",
                heading: opts.heading,
                intro: opts.intro,
                details: opts.details,
                note: opts.note
            }),
        tag: opts.tag
    })
}

// ---------------------------------------------------------------------------
// createSubRequest
// ---------------------------------------------------------------------------

export const createSubRequest = withAction(
    async (input: {
        teamId: number
        matchId: number
        originalUserId: string
        targetUserId: string
        message?: string
    }): Promise<ActionResult<{ requestId: number }>> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        const seasonId = config.seasonId

        const teamId = requirePositiveInt(input.teamId, "team")
        const matchId = requirePositiveInt(input.matchId, "match")
        const { originalUserId, targetUserId } = input
        if (!originalUserId || typeof originalUserId !== "string") {
            return fail("Invalid player.")
        }
        if (!targetUserId || typeof targetUserId !== "string") {
            return fail("Invalid sub candidate.")
        }

        if (!(await canAccessTeam(session.user.id, teamId, seasonId))) {
            return fail("Not authorized.")
        }

        const match = await getMatchMeta(matchId)
        if (!match) return fail("Match not found.")
        if (match.season !== seasonId) {
            return fail("Match is not in the active season.")
        }
        if (match.homeTeam !== teamId && match.awayTeam !== teamId) {
            return fail("Match does not belong to this team.")
        }
        if (match.date && match.date < getLeagueDateString(0)) {
            return fail("This match has already been played.")
        }

        // Covered player must be active on the requesting roster.
        const slot = await resolveActiveUserForSlot(teamId, originalUserId)
        if (!slot || slot.activeUserId !== originalUserId) {
            const stillDrafted = await findActiveTeamForUser(
                originalUserId,
                seasonId
            )
            if (stillDrafted?.teamId !== teamId) {
                return fail(
                    "Player is not on this team's active roster for this match."
                )
            }
        }

        // Slot must not already be covered.
        const [existingSub] = await db
            .select({ id: matchSubstitutions.id })
            .from(matchSubstitutions)
            .where(
                and(
                    eq(matchSubstitutions.match, matchId),
                    eq(matchSubstitutions.original_user, originalUserId)
                )
            )
            .limit(1)
        if (existingSub) {
            return fail(
                "A sub is already recorded for this player on this match."
            )
        }

        // Candidate must be an active player on ANOTHER team — and not the
        // match opponent (their own game conflicts with yours).
        const targetTeamRef = await findActiveTeamForUser(
            targetUserId,
            seasonId
        )
        if (!targetTeamRef) {
            return fail(
                "That player isn't on a current-season roster, so their captain can't approve a sub request."
            )
        }
        if (targetTeamRef.teamId === teamId) {
            return fail("That player is already on your team.")
        }
        const opponentTeamId =
            match.homeTeam === teamId ? match.awayTeam : match.homeTeam
        if (targetTeamRef.teamId === opponentTeamId) {
            return fail(
                "That player is on the opposing team for this match and can't sub for you."
            )
        }

        const [duplicate] = await db
            .select({ id: subRequests.id })
            .from(subRequests)
            .where(
                and(
                    eq(subRequests.match, matchId),
                    eq(subRequests.original_user, originalUserId),
                    eq(subRequests.target_user, targetUserId),
                    eq(subRequests.status, "pending")
                )
            )
            .limit(1)
        if (duplicate) {
            return fail(
                "A pending request for this player and match already exists."
            )
        }

        const message = input.message?.trim() || null
        let requestId: number
        try {
            const [inserted] = await db
                .insert(subRequests)
                .values({
                    season: seasonId,
                    match: matchId,
                    requesting_team: teamId,
                    target_team: targetTeamRef.teamId,
                    original_user: originalUserId,
                    target_user: targetUserId,
                    message,
                    requested_by: session.user.id
                })
                .returning({ id: subRequests.id })
            requestId = inserted.id
        } catch {
            // Partial unique index race — someone submitted the same ask.
            return fail(
                "A pending request for this player and match already exists."
            )
        }

        const [requestingTeam, targetTeam] = await Promise.all([
            getTeamMeta(teamId),
            getTeamMeta(targetTeamRef.teamId)
        ])
        const [requesterName, coveredName, candidateName] = await Promise.all([
            getUserName(session.user.id),
            getUserName(originalUserId),
            getUserName(targetUserId)
        ])

        await logAuditEntry({
            userId: session.user.id,
            action: "create",
            entityType: "sub_requests",
            entityId: requestId,
            summary: `Requested sub: ${candidateName} (${targetTeam ? teamLabel(targetTeam) : targetTeamRef.teamId}) to cover ${coveredName} for match ${matchId}`
        })

        if (targetTeam && requestingTeam) {
            await notifySubRequestParties({
                type: "sub_request_received",
                userIds: captainIdsOf(targetTeam, session.user.id),
                subject: `BSD Volleyball: Sub request for ${candidateName}`,
                heading: "Sub Request Received",
                intro: `${requesterName} (captain of ${teamLabel(requestingTeam)}) is asking to borrow ${candidateName} to cover ${coveredName} for one match. Approve or decline from your Team Availability page.`,
                details: [
                    { label: "Player:", value: candidateName },
                    { label: "For team:", value: teamLabel(requestingTeam) },
                    { label: "Covering:", value: coveredName },
                    ...matchDetailRows(match)
                ],
                note: message,
                tag: "sub-request"
            })
        }

        return ok({ requestId }, "Sub request sent to the player's captain.")
    }
)

// ---------------------------------------------------------------------------
// respondToSubRequest
// ---------------------------------------------------------------------------

export const respondToSubRequest = withAction(
    async (input: {
        requestId: number
        decision: "approve" | "decline"
        responseNote?: string
    }): Promise<ActionResult> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        const requestId = requirePositiveInt(input.requestId, "request")
        if (input.decision !== "approve" && input.decision !== "decline") {
            return fail("Invalid decision.")
        }
        const responseNote = input.responseNote?.trim() || null

        const [request] = await db
            .select()
            .from(subRequests)
            .where(eq(subRequests.id, requestId))
            .limit(1)
        if (!request) return fail("Request not found.")

        if (
            !(await canAccessTeam(
                session.user.id,
                request.target_team,
                config.seasonId
            ))
        ) {
            return fail("Not authorized.")
        }
        if (request.status !== "pending") {
            return fail("This request has already been resolved.")
        }

        const match = await getMatchMeta(request.match)
        if (!match) return fail("Match not found.")
        if (match.date && match.date < getLeagueDateString(0)) {
            await db
                .update(subRequests)
                .set({ status: "expired", updated_at: new Date() })
                .where(
                    and(
                        eq(subRequests.id, requestId),
                        eq(subRequests.status, "pending")
                    )
                )
            return fail("This request's match has already been played.")
        }

        const requestingTeam = await getTeamMeta(request.requesting_team)
        const [coveredName, candidateName, responderName] = await Promise.all([
            getUserName(request.original_user),
            getUserName(request.target_user),
            getUserName(session.user.id)
        ])
        const requestingTeamName = requestingTeam
            ? teamLabel(requestingTeam)
            : `Team ${request.requesting_team}`

        if (input.decision === "decline") {
            const updated = await db
                .update(subRequests)
                .set({
                    status: "declined",
                    responded_by: session.user.id,
                    responded_at: new Date(),
                    response_note: responseNote,
                    updated_at: new Date()
                })
                .where(
                    and(
                        eq(subRequests.id, requestId),
                        eq(subRequests.status, "pending")
                    )
                )
                .returning({ id: subRequests.id })
            if (updated.length === 0) {
                return fail("This request has already been resolved.")
            }

            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "sub_requests",
                entityId: requestId,
                summary: `Declined sub request #${requestId} (${candidateName} for ${requestingTeamName})`
            })

            if (requestingTeam) {
                await notifySubRequestParties({
                    type: "sub_request_declined",
                    userIds: [
                        request.requested_by,
                        ...captainIdsOf(requestingTeam)
                    ],
                    subject: `BSD Volleyball: Sub request declined — ${candidateName}`,
                    heading: "Sub Request Declined",
                    intro: `${responderName} declined your request to borrow ${candidateName} to cover ${coveredName}.`,
                    details: matchDetailRows(match),
                    note: responseNote,
                    tag: "sub-request"
                })
            }
            return ok(undefined, "Request declined.")
        }

        // Approve: flip status, record the substitution, and cancel sibling
        // asks for the same slot — atomically.
        let siblings: Array<{
            id: number
            target_team: number
            target_user: string
        }> = []
        try {
            await db.transaction(async (tx) => {
                const updated = await tx
                    .update(subRequests)
                    .set({
                        status: "approved",
                        responded_by: session.user.id,
                        responded_at: new Date(),
                        response_note: responseNote,
                        updated_at: new Date()
                    })
                    .where(
                        and(
                            eq(subRequests.id, requestId),
                            eq(subRequests.status, "pending")
                        )
                    )
                    .returning({ id: subRequests.id })
                if (updated.length === 0) {
                    throw new ActionError(
                        "This request has already been resolved."
                    )
                }

                const subResult = await insertMatchSubstitution(
                    {
                        teamId: request.requesting_team,
                        matchId: request.match,
                        originalUserId: request.original_user,
                        subUserId: request.target_user,
                        performedBy: session.user.id,
                        seasonId: config.seasonId,
                        notes: `Approved sub request #${requestId}`,
                        subEligibility: "rostered"
                    },
                    tx
                )
                if (!subResult.ok) {
                    throw new ActionError(subResult.message)
                }

                siblings = await tx
                    .update(subRequests)
                    .set({
                        status: "cancelled",
                        response_note: "Superseded by an approved request.",
                        updated_at: new Date()
                    })
                    .where(
                        and(
                            eq(subRequests.match, request.match),
                            eq(
                                subRequests.original_user,
                                request.original_user
                            ),
                            eq(subRequests.status, "pending"),
                            ne(subRequests.id, requestId)
                        )
                    )
                    .returning({
                        id: subRequests.id,
                        target_team: subRequests.target_team,
                        target_user: subRequests.target_user
                    })
            })
        } catch (error) {
            if (error instanceof ActionError) return fail(error.message)
            throw error
        }

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "sub_requests",
            entityId: requestId,
            summary: `Approved sub request #${requestId}: ${candidateName} covers ${coveredName} for ${requestingTeamName} (match ${request.match})`
        })

        if (requestingTeam) {
            await notifySubRequestParties({
                type: "sub_request_approved",
                userIds: [
                    request.requested_by,
                    ...captainIdsOf(requestingTeam)
                ],
                subject: `BSD Volleyball: Sub request approved — ${candidateName}`,
                heading: "Sub Request Approved",
                intro: `${responderName} approved your request: ${candidateName} will cover ${coveredName}. The substitution is locked in.`,
                details: matchDetailRows(match),
                note: responseNote,
                tag: "sub-request"
            })
        }

        await notifySubRequestParties({
            type: "sub_locked_in",
            userIds: [request.target_user],
            subject: "BSD Volleyball: You're subbing in!",
            heading: "You're Locked In as a Sub",
            intro: `${responderName} approved a sub request: you'll play for ${requestingTeamName}, covering ${coveredName}.`,
            details: matchDetailRows(match),
            tag: "sub-locked-in"
        })

        for (const sibling of siblings) {
            const siblingTeam = await getTeamMeta(sibling.target_team)
            if (!siblingTeam) continue
            const siblingCandidate = await getUserName(sibling.target_user)
            await notifySubRequestParties({
                type: "sub_request_cancelled",
                userIds: captainIdsOf(siblingTeam),
                subject: `BSD Volleyball: Sub request withdrawn — ${siblingCandidate}`,
                heading: "Sub Request Withdrawn",
                intro: `${requestingTeamName}'s request to borrow ${siblingCandidate} was withdrawn — another player was approved for that slot. No action needed.`,
                details: matchDetailRows(match),
                tag: "sub-request"
            })
        }

        return ok(undefined, "Request approved — the sub is locked in.")
    }
)

// ---------------------------------------------------------------------------
// cancelSubRequest
// ---------------------------------------------------------------------------

export const cancelSubRequest = withAction(
    async (requestId: number): Promise<ActionResult> => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        requirePositiveInt(requestId, "request")

        const [request] = await db
            .select()
            .from(subRequests)
            .where(eq(subRequests.id, requestId))
            .limit(1)
        if (!request) return fail("Request not found.")

        if (
            !(await canAccessTeam(
                session.user.id,
                request.requesting_team,
                config.seasonId
            ))
        ) {
            return fail("Not authorized.")
        }
        if (request.status !== "pending") {
            return fail("Only pending requests can be cancelled.")
        }

        const updated = await db
            .update(subRequests)
            .set({
                status: "cancelled",
                responded_by: session.user.id,
                responded_at: new Date(),
                updated_at: new Date()
            })
            .where(
                and(
                    eq(subRequests.id, requestId),
                    eq(subRequests.status, "pending")
                )
            )
            .returning({ id: subRequests.id })
        if (updated.length === 0) {
            return fail("Only pending requests can be cancelled.")
        }

        const [targetTeam, match, candidateName, requestingTeam] =
            await Promise.all([
                getTeamMeta(request.target_team),
                getMatchMeta(request.match),
                getUserName(request.target_user),
                getTeamMeta(request.requesting_team)
            ])

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "sub_requests",
            entityId: requestId,
            summary: `Cancelled sub request #${requestId} (${candidateName})`
        })

        if (targetTeam && match && requestingTeam) {
            await notifySubRequestParties({
                type: "sub_request_cancelled",
                userIds: captainIdsOf(targetTeam),
                subject: `BSD Volleyball: Sub request withdrawn — ${candidateName}`,
                heading: "Sub Request Withdrawn",
                intro: `${teamLabel(requestingTeam)} withdrew their request to borrow ${candidateName}. No action needed.`,
                details: matchDetailRows(match),
                tag: "sub-request"
            })
        }

        return ok(undefined, "Request cancelled.")
    }
)

// ---------------------------------------------------------------------------
// getSubRequestsForTeam
// ---------------------------------------------------------------------------

export interface SubRequestView {
    id: number
    status: string
    matchId: number
    matchDate: string | null
    matchTime: string | null
    court: number | null
    requestingTeamId: number
    requestingTeamName: string
    targetTeamId: number
    targetTeamName: string
    coveredPlayerName: string
    candidateName: string
    requesterName: string
    message: string | null
    responseNote: string | null
    createdAt: Date
    respondedAt: Date | null
}

const requestingTeams = aliasedTable(teams, "sr_requesting_teams")
const targetTeams = aliasedTable(teams, "sr_target_teams")
const requesterUsers = aliasedTable(users, "sr_requesters")
const coveredUsers = aliasedTable(users, "sr_covered")
const candidateUsers = aliasedTable(users, "sr_candidates")

export const getSubRequestsForTeam = withAction(
    async (
        teamId: number
    ): Promise<
        ActionResult<{ incoming: SubRequestView[]; outgoing: SubRequestView[] }>
    > => {
        const session = await requireSession()
        const config = await requireSeasonConfig()
        requirePositiveInt(teamId, "team")

        if (!(await canAccessTeam(session.user.id, teamId, config.seasonId))) {
            return fail("Not authorized.")
        }

        // Lazy expiry: pending requests whose match date has passed.
        const pastMatchIds = db
            .select({ id: matches.id })
            .from(matches)
            .where(lt(matches.date, getLeagueDateString(0)))
        await db
            .update(subRequests)
            .set({ status: "expired", updated_at: new Date() })
            .where(
                and(
                    eq(subRequests.status, "pending"),
                    or(
                        eq(subRequests.requesting_team, teamId),
                        eq(subRequests.target_team, teamId)
                    ),
                    inArray(subRequests.match, pastMatchIds)
                )
            )

        const rows = await db
            .select({
                id: subRequests.id,
                status: subRequests.status,
                matchId: subRequests.match,
                matchDate: matches.date,
                matchTime: matches.time,
                court: matches.court,
                requestingTeamId: subRequests.requesting_team,
                requestingTeamName: requestingTeams.name,
                requestingTeamNumber: requestingTeams.number,
                targetTeamId: subRequests.target_team,
                targetTeamName: targetTeams.name,
                targetTeamNumber: targetTeams.number,
                requesterFirst: requesterUsers.first_name,
                requesterLast: requesterUsers.last_name,
                requesterPreferred: requesterUsers.preferred_name,
                coveredFirst: coveredUsers.first_name,
                coveredLast: coveredUsers.last_name,
                coveredPreferred: coveredUsers.preferred_name,
                candidateFirst: candidateUsers.first_name,
                candidateLast: candidateUsers.last_name,
                candidatePreferred: candidateUsers.preferred_name,
                message: subRequests.message,
                responseNote: subRequests.response_note,
                createdAt: subRequests.created_at,
                respondedAt: subRequests.responded_at
            })
            .from(subRequests)
            .innerJoin(matches, eq(subRequests.match, matches.id))
            .innerJoin(
                requestingTeams,
                eq(subRequests.requesting_team, requestingTeams.id)
            )
            .innerJoin(targetTeams, eq(subRequests.target_team, targetTeams.id))
            .innerJoin(
                requesterUsers,
                eq(subRequests.requested_by, requesterUsers.id)
            )
            .innerJoin(
                coveredUsers,
                eq(subRequests.original_user, coveredUsers.id)
            )
            .innerJoin(
                candidateUsers,
                eq(subRequests.target_user, candidateUsers.id)
            )
            .where(
                and(
                    eq(subRequests.season, config.seasonId),
                    or(
                        eq(subRequests.requesting_team, teamId),
                        eq(subRequests.target_team, teamId)
                    )
                )
            )
            .orderBy(subRequests.created_at)

        const toView = (row: (typeof rows)[number]): SubRequestView => ({
            id: row.id,
            status: row.status,
            matchId: row.matchId,
            matchDate: row.matchDate,
            matchTime: row.matchTime,
            court: row.court,
            requestingTeamId: row.requestingTeamId,
            requestingTeamName:
                row.requestingTeamName ||
                `Team ${row.requestingTeamNumber ?? row.requestingTeamId}`,
            targetTeamId: row.targetTeamId,
            targetTeamName:
                row.targetTeamName ||
                `Team ${row.targetTeamNumber ?? row.targetTeamId}`,
            coveredPlayerName: formatDisplayName(
                row.coveredFirst,
                row.coveredLast,
                row.coveredPreferred
            ),
            candidateName: formatDisplayName(
                row.candidateFirst,
                row.candidateLast,
                row.candidatePreferred
            ),
            requesterName: formatDisplayName(
                row.requesterFirst,
                row.requesterLast,
                row.requesterPreferred
            ),
            message: row.message,
            responseNote: row.responseNote,
            createdAt: row.createdAt,
            respondedAt: row.respondedAt
        })

        return ok({
            incoming: rows
                .filter((r) => r.targetTeamId === teamId)
                .map(toView)
                .reverse(),
            outgoing: rows
                .filter((r) => r.requestingTeamId === teamId)
                .map(toView)
                .reverse()
        })
    }
)
