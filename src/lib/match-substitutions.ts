import "server-only"

import { and, eq } from "drizzle-orm"
import { db, type DbExecutor } from "@/database/db"
import {
    drafts,
    matchSubstitutions,
    matches,
    users,
    waitlist
} from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import { findActiveTeamForUser, resolveActiveUserForSlot } from "@/lib/roster"

export type InsertMatchSubstitutionResult =
    | { ok: true; id: number; activeOriginal: string }
    | { ok: false; message: string }

/**
 * Core insert for a regular (single-match) substitution, extracted from
 * lockInRegularSub so the sub-request approval flow can reuse it inside its
 * own transaction.
 *
 * `subEligibility` picks the rule for who may sub in:
 * - "waitlist": the manual lock-in flow — the sub must hold a season
 *   waitlist row (unchanged historical behavior).
 * - "rostered": the sub-request flow — the sub must be an active player on
 *   another current-season team.
 *
 * Authorization is the CALLER's job. Validations query the root db (already
 * committed data); the insert itself runs on `tx` so an enclosing transaction
 * can roll it back. The unique index on (match, original_user) is the final
 * race backstop.
 */
export async function insertMatchSubstitution(
    input: {
        teamId: number
        matchId: number
        originalUserId: string
        subUserId: string
        performedBy: string
        seasonId: number
        notes?: string | null
        subEligibility: "waitlist" | "rostered"
    },
    tx: DbExecutor = db
): Promise<InsertMatchSubstitutionResult> {
    const { teamId, matchId, originalUserId, subUserId, seasonId } = input

    if (originalUserId === subUserId) {
        return { ok: false, message: "Original and sub user must differ." }
    }

    const [matchRow] = await db
        .select({
            id: matches.id,
            season: matches.season,
            homeTeam: matches.home_team,
            awayTeam: matches.away_team,
            date: matches.date
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1)
    if (!matchRow) return { ok: false, message: "Match not found." }
    if (matchRow.season !== seasonId) {
        return { ok: false, message: "Match is not in the active season." }
    }
    if (matchRow.homeTeam !== teamId && matchRow.awayTeam !== teamId) {
        return { ok: false, message: "Match does not belong to this team." }
    }

    // Confirm originalUserId is currently active on the team (resolves the
    // permanent-sub chain). Reject if they've been permanently subbed out.
    const slot = await resolveActiveUserForSlot(teamId, originalUserId)
    let activeOriginal: string
    if (slot && slot.activeUserId === originalUserId) {
        activeOriginal = originalUserId
    } else {
        // Allow callers to pass the original draftee even if no chain exists.
        // Otherwise reject — the player isn't on this team's active roster.
        const [draftRow] = await db
            .select({ id: drafts.id })
            .from(drafts)
            .where(
                and(eq(drafts.team, teamId), eq(drafts.user, originalUserId))
            )
            .limit(1)
        if (!draftRow) {
            return {
                ok: false,
                message:
                    "Player is not on this team's active roster for this match."
            }
        }
        activeOriginal = originalUserId
    }

    if (input.subEligibility === "waitlist") {
        const [waitlistRow] = await db
            .select({ id: waitlist.id })
            .from(waitlist)
            .where(
                and(eq(waitlist.season, seasonId), eq(waitlist.user, subUserId))
            )
            .limit(1)
        if (!waitlistRow) {
            return {
                ok: false,
                message: "Sub user is not on the waitlist for this season."
            }
        }
    } else {
        const subTeam = await findActiveTeamForUser(subUserId, seasonId)
        if (!subTeam) {
            return {
                ok: false,
                message:
                    "Sub user is not an active player on a current-season team."
            }
        }
        if (subTeam.teamId === teamId) {
            return {
                ok: false,
                message: "Sub user is already on this team."
            }
        }
    }

    // Reject duplicate (match, original_user) — also enforced by unique index.
    const [existing] = await db
        .select({ id: matchSubstitutions.id })
        .from(matchSubstitutions)
        .where(
            and(
                eq(matchSubstitutions.match, matchId),
                eq(matchSubstitutions.original_user, activeOriginal)
            )
        )
        .limit(1)
    if (existing) {
        return {
            ok: false,
            message: "A sub is already recorded for this player on this match."
        }
    }

    const findUserName = async (id: string): Promise<string> => {
        const [row] = await db
            .select({
                firstName: users.first_name,
                lastName: users.last_name
            })
            .from(users)
            .where(eq(users.id, id))
            .limit(1)
        return row ? `${row.firstName} ${row.lastName}` : id
    }
    const [originalName, subName] = await Promise.all([
        findUserName(activeOriginal),
        findUserName(subUserId)
    ])

    let insertedId: number
    try {
        const inserted = await tx
            .insert(matchSubstitutions)
            .values({
                match: matchId,
                team: teamId,
                season: seasonId,
                original_user: activeOriginal,
                sub_user: subUserId,
                performed_by: input.performedBy,
                notes: input.notes?.trim() || null
            })
            .returning({ id: matchSubstitutions.id })
        insertedId = inserted[0].id
    } catch (err) {
        console.error("Failed to record match substitution:", err)
        return { ok: false, message: "Failed to record substitution." }
    }

    await logAuditEntry(
        {
            userId: input.performedBy,
            action: "create",
            entityType: "match_substitutions",
            entityId: insertedId,
            summary: `Locked in regular sub: ${subName} subs for ${originalName} on team ${teamId} for match ${matchId}${matchRow.date ? ` (${matchRow.date})` : ""}`
        },
        tx
    )

    return { ok: true, id: insertedId, activeOriginal }
}
