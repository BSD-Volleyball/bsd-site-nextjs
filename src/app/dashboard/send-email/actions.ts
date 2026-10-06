"use server"

import { logger } from "@/lib/logger"
import { db } from "@/database/db"
import {
    emailBroadcasts,
    teams,
    divisions,
    seasons,
    seasonEvents
} from "@/database/schema"
import { and, asc, eq } from "drizzle-orm"
import {
    ActionError,
    withAction,
    requireSession,
    ok,
    fail
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"
import { getSeasonConfig } from "@/lib/site-config"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession
} from "@/next/session"
import { commissionerCanWriteDivision } from "@/lib/rbac"
import { site } from "@/config/site"
import { logAuditEntry } from "@/lib/audit-log"
import {
    type LexicalEmailTemplateContent,
    convertEmailTemplateContentToHtml
} from "@/lib/email-template-content"
import {
    type TemplateVariableValues,
    buildEventVariableValues,
    findUnresolvedVariableKeys,
    resolveSubjectVariables,
    resolveTemplateVariablesInContent
} from "@/lib/email-template-variables"
import { formatSeasonLabel, formatSeasonRowLabel } from "@/lib/season-utils"
import type { SeasonConfig } from "@/lib/season-types"
import { STREAM_BROADCAST, STREAM_IN_SEASON_UPDATES } from "@/lib/postmark"

type BroadcastStream = typeof STREAM_BROADCAST | typeof STREAM_IN_SEASON_UPDATES
import {
    ensureRecipientGroup,
    getRecipientsForGroup
} from "@/lib/email-recipients"
import { applyPolicyFilters, sendMail } from "@/lib/email/send"
import {
    applyEmailSubjectPrefix,
    stripEmailSubjectPrefix
} from "@/lib/email-subject"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SendToType =
    | "just_me"
    | "everyone"
    | "season"
    | "division"
    | "team"
    | "season_captains"
    | "season_commissioners"
    | "all_refs"
    | "season_refs"
    | "season_ref_interest"
    | "season_tryout_help"
    | "season_tryout_volunteers"
    | "leadership_group"

/** Recipient selections that reach beyond a single division or team. */
const LEAGUE_WIDE_SEND_TYPES: SendToType[] = [
    "everyone",
    "season",
    "season_captains",
    "season_commissioners",
    "all_refs",
    "season_refs",
    "season_ref_interest",
    "season_tryout_help",
    "season_tryout_volunteers",
    "leadership_group"
]

// ---------------------------------------------------------------------------
// createAndSendBroadcast
// ---------------------------------------------------------------------------

export interface SendBroadcastInput {
    sendToType: SendToType
    divisionId?: number
    teamId?: number
    /** For season_tryout_volunteers: one tryout night, or omitted for all. */
    tryoutEventId?: number
    /** Also deliver to the directors group. Forced on for non-admins. */
    ccDirectors?: boolean
    subject: string
    lexicalContent: LexicalEmailTemplateContent
}

/**
 * Whether this send includes the directors group. Commissioners cannot turn
 * it off — the decision is made here, server-side, so a tampered client
 * payload cannot suppress director oversight. Test sends to yourself never
 * include it.
 */
function shouldCcDirectors(
    input: SendBroadcastInput,
    isAdmin: boolean
): boolean {
    if (input.sendToType === "just_me") return false
    return isAdmin ? input.ccDirectors === true : true
}

/**
 * A commissioner may only send to a division or team they oversee this
 * season. getEmailFormData filters the dropdowns the same way, but the
 * action is callable directly with any ids. Returns an error message, or
 * null when the target is allowed.
 */
async function commissionerTargetError(
    userId: string,
    seasonId: number | null,
    input: SendBroadcastInput
): Promise<string | null> {
    if (input.sendToType === "just_me") return null
    if (!seasonId) return "No active season."

    let divisionId: number | undefined
    if (input.sendToType === "division") {
        divisionId = input.divisionId
    } else if (input.sendToType === "team") {
        if (!input.teamId) return "Team is required."
        const [teamRow] = await db
            .select({ division: teams.division, season: teams.season })
            .from(teams)
            .where(eq(teams.id, input.teamId))
            .limit(1)
        if (!teamRow || teamRow.season !== seasonId) return "Team not found."
        divisionId = teamRow.division
    } else {
        return "Unauthorized."
    }

    if (!divisionId) return "Division is required."
    if (!(await commissionerCanWriteDivision(userId, seasonId, divisionId))) {
        return "Unauthorized: you can only email your own divisions."
    }
    return null
}

/** Resolves/creates the recipient group and infers the stream from sendToType. */
async function resolveGroup(
    sendToType: SendToType,
    seasonId: number | null,
    divisionId?: number,
    teamId?: number,
    tryoutEventId?: number
): Promise<{ groupId: number; groupName: string; stream: BroadcastStream }> {
    // A shared bookkeeping group so test sends appear in broadcast history;
    // recipients for it come from the caller's session, never from the group.
    if (sendToType === "just_me") {
        const groupId = await ensureRecipientGroup("self", { name: "Just Me" })
        return { groupId, groupName: "Just Me", stream: STREAM_BROADCAST }
    }

    if (sendToType === "everyone") {
        const groupId = await ensureRecipientGroup("all_users", {
            name: "All Users"
        })
        return { groupId, groupName: "All Users", stream: STREAM_BROADCAST }
    }

    // Not season-bound: anyone who has ever reffed, in any season.
    if (sendToType === "all_refs") {
        const groupId = await ensureRecipientGroup("all_refs", {
            name: "All Refs (All Time)"
        })
        return {
            groupId,
            groupName: "All Refs (All Time)",
            stream: STREAM_BROADCAST
        }
    }

    // Not season-bound: the global leadership_group role plus all admins.
    if (sendToType === "leadership_group") {
        const groupId = await ensureRecipientGroup("leadership_group", {
            name: "Leadership Group"
        })
        return {
            groupId,
            groupName: "Leadership Group",
            stream: STREAM_BROADCAST
        }
    }

    if (!seasonId) throw new ActionError("No active season configured.")

    // Load season label once
    const [seasonRow] = await db
        .select({ year: seasons.year, season: seasons.season })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
    const seasonLabel = seasonRow
        ? formatSeasonRowLabel(seasonRow)
        : "Current Season"

    if (sendToType === "season") {
        const groupId = await ensureRecipientGroup("season_signups", {
            seasonId,
            name: `${seasonLabel} – All Season Players`
        })
        return {
            groupId,
            groupName: `${seasonLabel} – All Season Players`,
            stream: STREAM_IN_SEASON_UPDATES
        }
    }

    if (sendToType === "season_captains") {
        const groupId = await ensureRecipientGroup("season_captains", {
            seasonId,
            name: `${seasonLabel} – Captains`
        })
        return {
            groupId,
            groupName: `${seasonLabel} – Captains`,
            stream: STREAM_IN_SEASON_UPDATES
        }
    }

    if (sendToType === "season_commissioners") {
        const groupId = await ensureRecipientGroup("season_commissioners", {
            seasonId,
            name: `${seasonLabel} – Commissioners`
        })
        return {
            groupId,
            groupName: `${seasonLabel} – Commissioners`,
            stream: STREAM_IN_SEASON_UPDATES
        }
    }

    if (sendToType === "season_refs") {
        const groupId = await ensureRecipientGroup("season_refs", {
            seasonId,
            name: `${seasonLabel} – Refs`
        })
        return {
            groupId,
            groupName: `${seasonLabel} – Refs`,
            stream: STREAM_IN_SEASON_UPDATES
        }
    }

    // Self-reported on the season signup form, so scoped to that season.
    if (sendToType === "season_ref_interest") {
        const name = `${seasonLabel} – Interested in Reffing`
        const groupId = await ensureRecipientGroup("season_ref_interest", {
            seasonId,
            name
        })
        return { groupId, groupName: name, stream: STREAM_IN_SEASON_UPDATES }
    }

    if (sendToType === "season_tryout_help") {
        const name = `${seasonLabel} – Willing to Help with Tryouts`
        const groupId = await ensureRecipientGroup("season_tryout_help", {
            seasonId,
            name
        })
        return { groupId, groupName: name, stream: STREAM_IN_SEASON_UPDATES }
    }

    // People holding an actual job, not everyone who volunteered.
    if (sendToType === "season_tryout_volunteers") {
        if (!tryoutEventId) {
            const name = `${seasonLabel} – Tryout Volunteers (All Tryouts)`
            const groupId = await ensureRecipientGroup(
                "season_tryout_volunteers",
                { seasonId, name }
            )
            return {
                groupId,
                groupName: name,
                stream: STREAM_IN_SEASON_UPDATES
            }
        }

        const tryoutEvents = await db
            .select({ id: seasonEvents.id })
            .from(seasonEvents)
            .where(
                and(
                    eq(seasonEvents.season_id, seasonId),
                    eq(seasonEvents.event_type, "tryout")
                )
            )
            .orderBy(asc(seasonEvents.sort_order), asc(seasonEvents.id))

        const ordinal = tryoutEvents.findIndex((e) => e.id === tryoutEventId)
        if (ordinal < 0) {
            throw new ActionError(
                "Tryout date not found in the current season."
            )
        }

        const name = `${seasonLabel} – Tryout ${ordinal + 1} Volunteers`
        const groupId = await ensureRecipientGroup(
            "season_tryout_volunteers_event",
            { seasonId, eventId: tryoutEventId, name }
        )
        return { groupId, groupName: name, stream: STREAM_IN_SEASON_UPDATES }
    }

    if (sendToType === "division") {
        if (!divisionId) throw new ActionError("Division is required.")
        const [divRow] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, divisionId))
            .limit(1)
        if (!divRow) throw new ActionError("Division not found.")
        const groupId = await ensureRecipientGroup("season_division", {
            seasonId,
            divisionId,
            name: `${seasonLabel} – ${divRow.name}`
        })
        return {
            groupId,
            groupName: `${seasonLabel} – ${divRow.name}`,
            stream: STREAM_IN_SEASON_UPDATES
        }
    }

    // team
    if (!teamId) throw new ActionError("Team is required.")
    const [teamRow] = await db
        .select({ name: teams.name, season: teams.season })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)
    if (!teamRow || teamRow.season !== seasonId) {
        throw new ActionError("Team not found.")
    }
    const groupId = await ensureRecipientGroup("season_team", {
        seasonId,
        teamId,
        name: `${seasonLabel} – Team ${teamRow.name}`
    })
    return {
        groupId,
        groupName: `${seasonLabel} – Team ${teamRow.name}`,
        stream: STREAM_IN_SEASON_UPDATES
    }
}

/**
 * Resolve template variables in the subject and body using the values a
 * broadcast context can supply: season name/year, event dates/times, and the
 * selected division or team. Variables needing per-person context (captain
 * lists, draft rounds, the composer's name, …) are not available here, so a
 * subject or body that references one refuses to resolve rather than sending
 * literal "[key]" text to the whole list.
 */
async function resolveBroadcastTemplate(
    config: SeasonConfig,
    input: SendBroadcastInput
): Promise<
    | { error: string }
    | { subject: string; html: string; content: LexicalEmailTemplateContent }
> {
    const values: TemplateVariableValues = {}
    let divisionLevel: number | null = null

    if (config.seasonId) {
        values.season_name = formatSeasonLabel(config)
        values.season_year = String(config.seasonYear)
    }

    if (input.sendToType === "division" && input.divisionId) {
        const [divRow] = await db
            .select({ name: divisions.name, level: divisions.level })
            .from(divisions)
            .where(eq(divisions.id, input.divisionId))
            .limit(1)
        if (divRow) {
            values.division_name = divRow.name
            divisionLevel = divRow.level
        }
    }

    if (input.sendToType === "team" && input.teamId) {
        const [teamRow] = await db
            .select({ name: teams.name })
            .from(teams)
            .where(eq(teams.id, input.teamId))
            .limit(1)
        if (teamRow?.name) values.team_name = teamRow.name
    }

    if (config.seasonId) {
        Object.assign(values, buildEventVariableValues(config, divisionLevel))
    }

    const unresolved = findUnresolvedVariableKeys(
        input.subject,
        input.lexicalContent,
        values,
        config
    )
    if (unresolved.length > 0) {
        return {
            error: `These template variables are not available for this recipient selection: ${unresolved
                .map((k) => `[${k}]`)
                .join(", ")}. Remove them or pick a different recipient group.`
        }
    }

    const content = resolveTemplateVariablesInContent(
        input.lexicalContent,
        values
    )
    // Prefix last, after variable resolution, so a subject whose "[BSD]" came
    // from a template variable is still de-duplicated rather than doubled.
    return {
        subject: applyEmailSubjectPrefix(
            resolveSubjectVariables(input.subject.trim(), values)
        ),
        html: convertEmailTemplateContentToHtml(content),
        content
    }
}

export const createAndSendBroadcast = withAction(
    async (
        input: SendBroadcastInput
    ): Promise<ActionResult<{ broadcastId: number }>> => {
        const session = await requireSession()
        const isAdmin = await isAdminOrDirectorBySession()
        const isCommissioner = await isCommissionerBySession()
        if (!isAdmin && !isCommissioner) return fail("Unauthorized.")

        const { sendToType, divisionId, teamId, tryoutEventId, subject } = input

        // Checked against the stripped subject so "[BSD]" alone is not a subject.
        if (!stripEmailSubjectPrefix(subject))
            return fail("Subject is required.")
        if (!sendToType) return fail("Recipient selection is required.")

        // Commissioners are scoped to their divisions/teams; every group that
        // spans the league (or the whole ref pool) is admin-only.
        if (!isAdmin && LEAGUE_WIDE_SEND_TYPES.includes(sendToType)) {
            return fail(
                "Unauthorized: only admins can send league-wide emails."
            )
        }

        const config = await getSeasonConfig()

        if (!isAdmin) {
            const targetError = await commissionerTargetError(
                session.user.id,
                config.seasonId ?? null,
                input
            )
            if (targetError) return fail(targetError)
        }

        const resolved = await resolveBroadcastTemplate(config, input)
        if ("error" in resolved) return fail(resolved.error)

        let group: {
            groupId: number
            groupName: string
            stream: BroadcastStream
        }
        try {
            group = await resolveGroup(
                sendToType,
                config.seasonId ?? null,
                divisionId,
                teamId,
                tryoutEventId
            )
        } catch (err) {
            return fail(
                err instanceof ActionError
                    ? err.message
                    : "Failed to resolve group."
            )
        }

        const { groupId, groupName, stream } = group

        // Render HTML
        const htmlWithFooter = `${resolved.html}<p style="margin-top:2rem;font-size:12px;color:#666;"><a href="{{{pm:unsubscribe}}}">Unsubscribe</a></p>`

        // Insert broadcast record (draft status). The resolved subject and
        // content are stored so the record reflects what recipients received.
        const [broadcast] = await db
            .insert(emailBroadcasts)
            .values({
                recipient_group_id: groupId,
                stream_id: stream,
                subject: resolved.subject,
                html_content: htmlWithFooter,
                lexical_content: resolved.content as unknown as Record<
                    string,
                    unknown
                >,
                sent_by: session.user.id,
                status: "draft"
            })
            .returning({ id: emailBroadcasts.id })

        try {
            // just_me is a test send to the composer only: it bypasses the
            // group query, and goes through alwaysInclude so no opt-out or
            // suppression can stop an admin previewing their own message.
            const isTestSend = sendToType === "just_me"

            const groupRecipients = isTestSend
                ? []
                : await getRecipientsForGroup(groupId)

            // The directors group is an alias, not a member, so it rides the
            // same always-include path rather than being filtered as a user.
            const ccDirectors = shouldCcDirectors(input, isAdmin)
            const alwaysInclude = [
                ...(isTestSend ? [session.user.email] : []),
                ...(ccDirectors ? [site.mailDirectors] : [])
            ]

            // Counted before filtering so the history view can show how many
            // of the intended audience were never attempted.
            const recipientTotal =
                (isTestSend ? 1 : groupRecipients.length) +
                (ccDirectors ? 1 : 0)

            const result = await sendMail({
                mode: {
                    kind: "broadcast",
                    stream,
                    broadcastId: broadcast.id
                },
                recipients: groupRecipients.map((r) => ({
                    userId: r.userId,
                    email: r.email,
                    firstName: r.firstName
                })),
                alwaysInclude,
                subject: resolved.subject,
                htmlBody: htmlWithFooter,
                tag: "broadcast"
            })

            await db
                .update(emailBroadcasts)
                .set({
                    status: "sent",
                    recipient_total: recipientTotal,
                    sent_count: result.sent,
                    failed_count: result.failed,
                    sent_at: new Date(),
                    updated_at: new Date()
                })
                .where(eq(emailBroadcasts.id, broadcast.id))

            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "email_broadcast",
                entityId: broadcast.id,
                summary: `Sent broadcast "${resolved.subject}" to "${groupName}"${ccDirectors ? " + directors" : ""} via ${stream} (${result.sent} sent of ${recipientTotal} intended, ${result.failed} failed)`
            })

            return ok({ broadcastId: broadcast.id })
        } catch (err) {
            await db
                .update(emailBroadcasts)
                .set({ status: "failed", updated_at: new Date() })
                .where(eq(emailBroadcasts.id, broadcast.id))
            logger.error("[send-email] broadcast failed", undefined, err)
            return fail("Failed to send emails. Please try again.")
        }
    }
)

// ---------------------------------------------------------------------------
// previewBroadcast
// ---------------------------------------------------------------------------

export interface BroadcastPreview {
    subject: string
    html: string
    groupName: string
    recipientCount: number
    /** True when the directors group is included in recipientCount. */
    ccDirectors: boolean
}

/**
 * Resolves the broadcast exactly as createAndSendBroadcast would — same
 * variable values, same guard — and returns the final subject/body plus the
 * recipient group summary, without sending or recording anything.
 */
export const previewBroadcast = withAction(
    async (
        input: SendBroadcastInput
    ): Promise<ActionResult<BroadcastPreview>> => {
        const session = await requireSession()
        const isAdmin = await isAdminOrDirectorBySession()
        const isCommissioner = await isCommissionerBySession()
        if (!isAdmin && !isCommissioner) return fail("Unauthorized.")

        const { sendToType, divisionId, teamId, tryoutEventId, subject } = input

        // Checked against the stripped subject so "[BSD]" alone is not a subject.
        if (!stripEmailSubjectPrefix(subject))
            return fail("Subject is required.")
        if (!sendToType) return fail("Recipient selection is required.")

        // Commissioners are scoped to their divisions/teams; every group that
        // spans the league (or the whole ref pool) is admin-only.
        if (!isAdmin && LEAGUE_WIDE_SEND_TYPES.includes(sendToType)) {
            return fail(
                "Unauthorized: only admins can send league-wide emails."
            )
        }

        const config = await getSeasonConfig()

        if (!isAdmin) {
            const targetError = await commissionerTargetError(
                session.user.id,
                config.seasonId ?? null,
                input
            )
            if (targetError) return fail(targetError)
        }

        const resolved = await resolveBroadcastTemplate(config, input)
        if ("error" in resolved) return fail(resolved.error)

        let group: {
            groupId: number
            groupName: string
            stream: BroadcastStream
        }
        try {
            group = await resolveGroup(
                sendToType,
                config.seasonId ?? null,
                divisionId,
                teamId,
                tryoutEventId
            )
        } catch (err) {
            return fail(
                err instanceof ActionError
                    ? err.message
                    : "Failed to resolve group."
            )
        }

        const ccDirectors = shouldCcDirectors(input, isAdmin)

        // Same filter the send runs, so the previewed count cannot drift
        // from what actually goes out.
        const audienceCount =
            sendToType === "just_me"
                ? 1
                : (
                      await applyPolicyFilters(
                          {
                              kind: "broadcast",
                              stream: group.stream,
                              broadcastId: 0
                          },
                          await getRecipientsForGroup(group.groupId)
                      )
                  ).length

        return ok({
            subject: resolved.subject,
            html: resolved.html,
            groupName: group.groupName,
            recipientCount: audienceCount + (ccDirectors ? 1 : 0),
            ccDirectors
        })
    }
)
