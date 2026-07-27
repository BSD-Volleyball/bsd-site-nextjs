"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail } from "@/lib/action-helpers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    signups,
    deletedSignups,
    teams,
    drafts,
    waitlist,
    discounts,
    evaluations,
    userRoles,
    playerRatings,
    auditLog,
    movingDay,
    draftHomework,
    draftCaptRounds,
    draftPairDiffs,
    scoreSheets,
    emailBroadcasts,
    emailSuppressions,
    concerns,
    concernComments,
    concernReplies,
    inboundEmails,
    inboundEmailComments,
    inboundEmailReplies,
    week1Rosters,
    week2Rosters,
    week3Rosters,
    waiverAcceptances,
    substitutions,
    matchSubstitutions,
    tournamentTeams,
    tournamentRoster,
    tournamentWaitlist
} from "@/database/schema"
import { eq, lt, gt, and, ne, or, inArray } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import { isAdminOrDirector } from "@/lib/rbac"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import { formatDisplayName } from "@/lib/utils"

const OLD_USER_CUTOFF = new Date("2026-02-01T00:00:01")
const NEW_USER_CUTOFF = new Date("2026-02-01T00:00:02")

export interface UserOption {
    id: string
    name: string
    email: string
    phone: string | null
    createdAt: Date
}

export async function getOldUsers(): Promise<UserOption[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return []
    }

    const hasAccess = await isAdminOrDirector(session.user.id)
    if (!hasAccess) {
        return []
    }

    const results = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email,
            phone: users.phone,
            createdAt: users.createdAt
        })
        .from(users)
        .where(
            and(
                lt(users.createdAt, OLD_USER_CUTOFF),
                ne(users.id, GHOST_CAPTAIN_ID)
            )
        )
        .orderBy(users.last_name, users.first_name)

    return results.map((u) => ({
        id: u.id,
        name: formatDisplayName(u.firstName, u.lastName, u.preferredName),
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt
    }))
}

export async function getNewUsers(): Promise<UserOption[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return []
    }

    const hasAccess = await isAdminOrDirector(session.user.id)
    if (!hasAccess) {
        return []
    }

    const results = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            email: users.email,
            phone: users.phone,
            createdAt: users.createdAt
        })
        .from(users)
        .where(
            and(
                gt(users.createdAt, NEW_USER_CUTOFF),
                ne(users.id, GHOST_CAPTAIN_ID)
            )
        )
        .orderBy(users.last_name, users.first_name)

    return results.map((u) => ({
        id: u.id,
        name: formatDisplayName(u.firstName, u.lastName, u.preferredName),
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt
    }))
}

export const mergeUsers = withAction(
    async (oldUserId: string, newUserId: string): Promise<ActionResult> => {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return fail("Not authenticated.")
        }

        const hasAccess = await isAdminOrDirector(session.user.id)
        if (!hasAccess) {
            return fail("Access denied.")
        }

        if (oldUserId === newUserId) {
            return fail("Cannot merge a user with themselves.")
        }

        try {
            // Fetch old user data
            const [oldUser] = await db
                .select({
                    old_id: users.old_id,
                    picture: users.picture
                })
                .from(users)
                .where(eq(users.id, oldUserId))
                .limit(1)

            if (!oldUser) {
                return fail("Old user not found.")
            }

            // Verify new user exists
            const [newUser] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, newUserId))
                .limit(1)

            if (!newUser) {
                return fail("New user not found.")
            }

            // Rekey every table that holds a FK to users.id, then delete the
            // old user. Wrapped in a transaction so a failure anywhere rolls back.
            // Tables with ON DELETE CASCADE (sessions, accounts, user_unavailability,
            // user_roles.user_id, season_refs, match_referees) are left to be
            // cleaned up automatically by the final delete. Non-cascading columns
            // must be repointed explicitly here or the final delete will raise a
            // FK violation.
            await db.transaction(async (tx) => {
                // Copy old_id and picture to new user
                await tx
                    .update(users)
                    .set({
                        old_id: oldUser.old_id,
                        picture: oldUser.picture,
                        updatedAt: new Date()
                    })
                    .where(eq(users.id, newUserId))

                // signups: (season, player) is unique — where both accounts
                // hold a signup for the same season (the typical duplicate-
                // account case), keep the new user's row and drop the old
                // duplicate (its user_unavailability children cascade away).
                await tx
                    .delete(signups)
                    .where(
                        and(
                            eq(signups.player, oldUserId),
                            inArray(
                                signups.season,
                                tx
                                    .select({ season: signups.season })
                                    .from(signups)
                                    .where(eq(signups.player, newUserId))
                            )
                        )
                    )
                await tx
                    .update(signups)
                    .set({ player: newUserId })
                    .where(eq(signups.player, oldUserId))
                await tx
                    .update(signups)
                    .set({ pair_pick: newUserId })
                    .where(eq(signups.pair_pick, oldUserId))

                // deleted_signups
                await tx
                    .update(deletedSignups)
                    .set({ player: newUserId })
                    .where(eq(deletedSignups.player, oldUserId))
                await tx
                    .update(deletedSignups)
                    .set({ deleted_by: newUserId })
                    .where(eq(deletedSignups.deleted_by, oldUserId))

                // teams
                await tx
                    .update(teams)
                    .set({ captain: newUserId })
                    .where(eq(teams.captain, oldUserId))
                await tx
                    .update(teams)
                    .set({ captain2: newUserId })
                    .where(eq(teams.captain2, oldUserId))

                // drafts / waitlist / discounts / evaluations / commissioners
                await tx
                    .update(drafts)
                    .set({ user: newUserId })
                    .where(eq(drafts.user, oldUserId))
                // waitlist: (season, user) is unique — same keep-new policy.
                await tx
                    .delete(waitlist)
                    .where(
                        and(
                            eq(waitlist.user, oldUserId),
                            inArray(
                                waitlist.season,
                                tx
                                    .select({ season: waitlist.season })
                                    .from(waitlist)
                                    .where(eq(waitlist.user, newUserId))
                            )
                        )
                    )
                await tx
                    .update(waitlist)
                    .set({ user: newUserId })
                    .where(eq(waitlist.user, oldUserId))
                await tx
                    .update(discounts)
                    .set({ user: newUserId })
                    .where(eq(discounts.user, oldUserId))
                // evaluations: (season, player, evaluator) is unique — drop old
                // rows that would collide after repointing either column.
                const [oldEvalRows, newEvalRows] = await Promise.all([
                    tx
                        .select({
                            id: evaluations.id,
                            season: evaluations.season,
                            player: evaluations.player,
                            evaluator: evaluations.evaluator
                        })
                        .from(evaluations)
                        .where(
                            or(
                                eq(evaluations.player, oldUserId),
                                eq(evaluations.evaluator, oldUserId)
                            )
                        ),
                    tx
                        .select({
                            season: evaluations.season,
                            player: evaluations.player,
                            evaluator: evaluations.evaluator
                        })
                        .from(evaluations)
                        .where(
                            or(
                                eq(evaluations.player, newUserId),
                                eq(evaluations.evaluator, newUserId)
                            )
                        )
                ])
                const evalKey = (r: {
                    season: number
                    player: string
                    evaluator: string
                }) => `${r.season}|${r.player}|${r.evaluator}`
                const newEvalKeys = new Set(newEvalRows.map(evalKey))
                const dupEvalIds = oldEvalRows
                    .filter((r) =>
                        newEvalKeys.has(
                            evalKey({
                                season: r.season,
                                player:
                                    r.player === oldUserId
                                        ? newUserId
                                        : r.player,
                                evaluator:
                                    r.evaluator === oldUserId
                                        ? newUserId
                                        : r.evaluator
                            })
                        )
                    )
                    .map((r) => r.id)
                if (dupEvalIds.length > 0) {
                    await tx
                        .delete(evaluations)
                        .where(inArray(evaluations.id, dupEvalIds))
                }
                await tx
                    .update(evaluations)
                    .set({ player: newUserId })
                    .where(eq(evaluations.player, oldUserId))
                await tx
                    .update(evaluations)
                    .set({ evaluator: newUserId })
                    .where(eq(evaluations.evaluator, oldUserId))
                // userRoles: identity is unique (NULLS NOT DISTINCT) — drop old
                // rows duplicating a role the new user already holds, then
                // repoint the rest. (user_id CASCADEs on delete, but granted_by
                // does not, so explicit handling stays.)
                const [oldRoleRows, newRoleRows] = await Promise.all([
                    tx
                        .select({
                            id: userRoles.id,
                            role: userRoles.role,
                            season_id: userRoles.season_id,
                            division_id: userRoles.division_id
                        })
                        .from(userRoles)
                        .where(eq(userRoles.user_id, oldUserId)),
                    tx
                        .select({
                            role: userRoles.role,
                            season_id: userRoles.season_id,
                            division_id: userRoles.division_id
                        })
                        .from(userRoles)
                        .where(eq(userRoles.user_id, newUserId))
                ])
                const roleKey = (r: {
                    role: string
                    season_id: number | null
                    division_id: number | null
                }) => `${r.role}|${r.season_id}|${r.division_id}`
                const newRoleKeys = new Set(newRoleRows.map(roleKey))
                const dupRoleIds = oldRoleRows
                    .filter((r) => newRoleKeys.has(roleKey(r)))
                    .map((r) => r.id)
                if (dupRoleIds.length > 0) {
                    await tx
                        .delete(userRoles)
                        .where(inArray(userRoles.id, dupRoleIds))
                }
                await tx
                    .update(userRoles)
                    .set({ user_id: newUserId })
                    .where(eq(userRoles.user_id, oldUserId))
                await tx
                    .update(userRoles)
                    .set({ granted_by: newUserId })
                    .where(eq(userRoles.granted_by, oldUserId))

                // player_ratings: (season, player, evaluator) unique — same
                // collision handling as evaluations.
                const [oldRatingRows, newRatingRows] = await Promise.all([
                    tx
                        .select({
                            id: playerRatings.id,
                            season: playerRatings.season,
                            player: playerRatings.player,
                            evaluator: playerRatings.evaluator
                        })
                        .from(playerRatings)
                        .where(
                            or(
                                eq(playerRatings.player, oldUserId),
                                eq(playerRatings.evaluator, oldUserId)
                            )
                        ),
                    tx
                        .select({
                            season: playerRatings.season,
                            player: playerRatings.player,
                            evaluator: playerRatings.evaluator
                        })
                        .from(playerRatings)
                        .where(
                            or(
                                eq(playerRatings.player, newUserId),
                                eq(playerRatings.evaluator, newUserId)
                            )
                        )
                ])
                const ratingKey = (r: {
                    season: number
                    player: string
                    evaluator: string
                }) => `${r.season}|${r.player}|${r.evaluator}`
                const newRatingKeys = new Set(newRatingRows.map(ratingKey))
                const dupRatingIds = oldRatingRows
                    .filter((r) =>
                        newRatingKeys.has(
                            ratingKey({
                                season: r.season,
                                player:
                                    r.player === oldUserId
                                        ? newUserId
                                        : r.player,
                                evaluator:
                                    r.evaluator === oldUserId
                                        ? newUserId
                                        : r.evaluator
                            })
                        )
                    )
                    .map((r) => r.id)
                if (dupRatingIds.length > 0) {
                    await tx
                        .delete(playerRatings)
                        .where(inArray(playerRatings.id, dupRatingIds))
                }
                await tx
                    .update(playerRatings)
                    .set({ player: newUserId })
                    .where(eq(playerRatings.player, oldUserId))
                await tx
                    .update(playerRatings)
                    .set({ evaluator: newUserId })
                    .where(eq(playerRatings.evaluator, oldUserId))

                // audit_log
                await tx
                    .update(auditLog)
                    .set({ user: newUserId })
                    .where(eq(auditLog.user, oldUserId))

                // moving_day
                await tx
                    .update(movingDay)
                    .set({ submitted_by: newUserId })
                    .where(eq(movingDay.submitted_by, oldUserId))
                await tx
                    .update(movingDay)
                    .set({ player: newUserId })
                    .where(eq(movingDay.player, oldUserId))

                // draft_homework
                await tx
                    .update(draftHomework)
                    .set({ captain: newUserId })
                    .where(eq(draftHomework.captain, oldUserId))
                await tx
                    .update(draftHomework)
                    .set({ player: newUserId })
                    .where(eq(draftHomework.player, oldUserId))

                // draft_capt_rounds
                await tx
                    .update(draftCaptRounds)
                    .set({ saved_by: newUserId })
                    .where(eq(draftCaptRounds.saved_by, oldUserId))
                await tx
                    .update(draftCaptRounds)
                    .set({ captain: newUserId })
                    .where(eq(draftCaptRounds.captain, oldUserId))

                // draft_pair_diffs
                await tx
                    .update(draftPairDiffs)
                    .set({ saved_by: newUserId })
                    .where(eq(draftPairDiffs.saved_by, oldUserId))
                await tx
                    .update(draftPairDiffs)
                    .set({ player1: newUserId })
                    .where(eq(draftPairDiffs.player1, oldUserId))
                await tx
                    .update(draftPairDiffs)
                    .set({ player2: newUserId })
                    .where(eq(draftPairDiffs.player2, oldUserId))

                // score_sheets
                await tx
                    .update(scoreSheets)
                    .set({ uploaded_by: newUserId })
                    .where(eq(scoreSheets.uploaded_by, oldUserId))

                // emails
                await tx
                    .update(emailBroadcasts)
                    .set({ sent_by: newUserId })
                    .where(eq(emailBroadcasts.sent_by, oldUserId))
                await tx
                    .update(emailSuppressions)
                    .set({ user_id: newUserId })
                    .where(eq(emailSuppressions.user_id, oldUserId))

                // concerns
                await tx
                    .update(concerns)
                    .set({ user_id: newUserId })
                    .where(eq(concerns.user_id, oldUserId))
                await tx
                    .update(concerns)
                    .set({ assigned_to: newUserId })
                    .where(eq(concerns.assigned_to, oldUserId))
                await tx
                    .update(concernComments)
                    .set({ author_id: newUserId })
                    .where(eq(concernComments.author_id, oldUserId))
                await tx
                    .update(concernReplies)
                    .set({ sent_by: newUserId })
                    .where(eq(concernReplies.sent_by, oldUserId))

                // inbound emails
                await tx
                    .update(inboundEmails)
                    .set({ assigned_to: newUserId })
                    .where(eq(inboundEmails.assigned_to, oldUserId))
                await tx
                    .update(inboundEmailComments)
                    .set({ author_id: newUserId })
                    .where(eq(inboundEmailComments.author_id, oldUserId))
                await tx
                    .update(inboundEmailReplies)
                    .set({ sent_by: newUserId })
                    .where(eq(inboundEmailReplies.sent_by, oldUserId))

                // roster tables (week1 has a unique (season, user) index)
                await tx
                    .delete(week1Rosters)
                    .where(
                        and(
                            eq(week1Rosters.user, oldUserId),
                            inArray(
                                week1Rosters.season,
                                tx
                                    .select({ season: week1Rosters.season })
                                    .from(week1Rosters)
                                    .where(eq(week1Rosters.user, newUserId))
                            )
                        )
                    )
                await tx
                    .update(week1Rosters)
                    .set({ user: newUserId })
                    .where(eq(week1Rosters.user, oldUserId))
                await tx
                    .update(week2Rosters)
                    .set({ user: newUserId })
                    .where(eq(week2Rosters.user, oldUserId))
                await tx
                    .update(week3Rosters)
                    .set({ user: newUserId })
                    .where(eq(week3Rosters.user, oldUserId))

                // waiver_acceptances: restrict FK + unique (user, waiver) —
                // drop old acceptances of waivers the new user already accepted,
                // repoint the rest so legal proof survives the merge.
                await tx.delete(waiverAcceptances).where(
                    and(
                        eq(waiverAcceptances.user_id, oldUserId),
                        inArray(
                            waiverAcceptances.waiver_id,
                            tx
                                .select({
                                    waiver_id: waiverAcceptances.waiver_id
                                })
                                .from(waiverAcceptances)
                                .where(eq(waiverAcceptances.user_id, newUserId))
                        )
                    )
                )
                await tx
                    .update(waiverAcceptances)
                    .set({ user_id: newUserId })
                    .where(eq(waiverAcceptances.user_id, oldUserId))

                // substitution history (restrict FKs — must be repointed or the
                // final delete fails)
                await tx
                    .update(substitutions)
                    .set({ original_user: newUserId })
                    .where(eq(substitutions.original_user, oldUserId))
                await tx
                    .update(substitutions)
                    .set({ sub_user: newUserId })
                    .where(eq(substitutions.sub_user, oldUserId))
                await tx
                    .update(substitutions)
                    .set({ performed_by: newUserId })
                    .where(eq(substitutions.performed_by, oldUserId))
                await tx
                    .update(matchSubstitutions)
                    .set({ original_user: newUserId })
                    .where(eq(matchSubstitutions.original_user, oldUserId))
                await tx
                    .update(matchSubstitutions)
                    .set({ sub_user: newUserId })
                    .where(eq(matchSubstitutions.sub_user, oldUserId))
                await tx
                    .update(matchSubstitutions)
                    .set({ performed_by: newUserId })
                    .where(eq(matchSubstitutions.performed_by, oldUserId))

                // tournament participation. tournament_roster has a unique
                // (tournament, user) — keep-new policy like signups. If both
                // accounts CAPTAIN a team in the same tournament the merge
                // fails loudly (that needs a human decision about which team
                // survives).
                await tx.delete(tournamentRoster).where(
                    and(
                        eq(tournamentRoster.user_id, oldUserId),
                        inArray(
                            tournamentRoster.tournament_id,
                            tx
                                .select({
                                    tournament_id:
                                        tournamentRoster.tournament_id
                                })
                                .from(tournamentRoster)
                                .where(eq(tournamentRoster.user_id, newUserId))
                        )
                    )
                )
                await tx
                    .update(tournamentRoster)
                    .set({ user_id: newUserId })
                    .where(eq(tournamentRoster.user_id, oldUserId))
                await tx
                    .update(tournamentRoster)
                    .set({ added_by_user_id: newUserId })
                    .where(eq(tournamentRoster.added_by_user_id, oldUserId))
                await tx
                    .update(tournamentTeams)
                    .set({ captain_user_id: newUserId })
                    .where(eq(tournamentTeams.captain_user_id, oldUserId))
                await tx.delete(tournamentWaitlist).where(
                    and(
                        eq(tournamentWaitlist.user_id, oldUserId),
                        inArray(
                            tournamentWaitlist.tournament_id,
                            tx
                                .select({
                                    tournament_id:
                                        tournamentWaitlist.tournament_id
                                })
                                .from(tournamentWaitlist)
                                .where(
                                    eq(tournamentWaitlist.user_id, newUserId)
                                )
                        )
                    )
                )
                await tx
                    .update(tournamentWaitlist)
                    .set({ user_id: newUserId })
                    .where(eq(tournamentWaitlist.user_id, oldUserId))

                // Finally delete the old user. Sessions, accounts,
                // user_unavailability, season_refs, match_referees, and any
                // remaining user_roles rows for the old id cascade automatically.
                await tx.delete(users).where(eq(users.id, oldUserId))
            })

            await logAuditEntry({
                userId: session.user.id,
                action: "merge",
                entityType: "users",
                entityId: newUserId,
                summary: `Merged user ${oldUserId} into ${newUserId} (old user deleted)`
            })

            revalidatePath("/dashboard/merge-users")
            return ok(undefined, "Users merged successfully.")
        } catch (error) {
            console.error("Error merging users:", error)
            return fail("Something went wrong while merging users.")
        }
    }
)
