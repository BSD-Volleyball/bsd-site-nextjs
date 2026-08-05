import { db } from "@/database/db"
import {
    accounts,
    auditLog,
    concernComments,
    concernReplies,
    concerns,
    deletedSignups,
    discounts,
    draftCaptRounds,
    draftHomework,
    draftPairDiffs,
    drafts,
    emailBroadcasts,
    emailSuppressions,
    evaluations,
    inboundEmailComments,
    inboundEmailReplies,
    inboundEmails,
    matchSubstitutions,
    movingDay,
    playerRatings,
    scoreSheets,
    signups,
    subRequests,
    substitutions,
    teams,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist,
    userRoles,
    users,
    waitlist,
    waiverAcceptances,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import { and, eq, inArray, or } from "drizzle-orm"

export interface MergeUserRecordsOptions {
    /**
     * Copy the deleted account's `old_id` and `picture` onto the survivor.
     *
     * True for a fixed-policy duplicate-account merge: the older row usually
     * holds the legacy numeric id and the photo, and the newer sign-up is the
     * empty one.
     *
     * False when the deleted account is a synthetic placeholder (a
     * `legacy-roster-*` / `legacy-hoc-*` row invented by the archive
     * backfill). Those carry a freshly-issued `old_id` and a null `picture`,
     * so copying them would overwrite the real member's legacy id and erase
     * their photo. The placeholder has no identity worth keeping — only its
     * records.
     *
     * A blunt precursor to `survivorPatch`, kept for the legacy-placeholder
     * callers that only ever need this one rule. Pass `false` alongside a
     * `survivorPatch`, which carries `old_id`/`picture` like any other field.
     */
    copyIdentity: boolean

    /**
     * Column values to write onto the survivor once the deleted row is gone.
     *
     * Lets an admin compose the surviving record field by field instead of
     * accepting the survivor's stored values wholesale. Applied AFTER the
     * delete -- see the ordering note on `mergeUserRecords`.
     */
    survivorPatch?: Partial<typeof users.$inferInsert>

    /**
     * Move the deleted account's better-auth `accounts` rows (Google links,
     * password credentials) onto the survivor instead of letting them cascade
     * away.
     *
     * Set this when the survivor is adopting the deleted account's email: those
     * login methods are how the person signs in as that address, so dropping
     * them while keeping the address would lock them out.
     */
    moveAuthAccounts?: boolean
}

/**
 * Move every record owned by `oldUserId` onto `newUserId`, then delete the old
 * account. Runs in a single transaction, so a failure anywhere rolls back.
 *
 * Tables with ON DELETE CASCADE (sessions, accounts, user_unavailability,
 * season_refs, match_referees, notification_optouts, tryout_slot_requests,
 * sub_requests.original_user/target_user) are left to be cleaned up by the
 * final delete. Non-cascading columns must be repointed explicitly here or
 * that delete raises an FK violation.
 *
 * Ordering around the delete is load-bearing:
 *
 *   - `moveAuthAccounts` runs BEFORE it, because `accounts.userId` cascades and
 *     the rows would be gone by the time we could repoint them.
 *   - `survivorPatch` runs AFTER it, because `users.email` is UNIQUE NOT NULL.
 *     Writing the deleted account's email onto the survivor while both rows
 *     still exist violates that constraint and aborts the transaction.
 *
 * Callers are responsible for authorization and for audit logging.
 */
export async function mergeUserRecords(
    oldUserId: string,
    newUserId: string,
    opts: MergeUserRecordsOptions
): Promise<void> {
    await db.transaction(async (tx) => {
        // better-auth logins. Must happen before the delete below, which would
        // otherwise cascade these rows away. Drop any old row whose provider the
        // survivor already has -- better-auth resolves a sign-in by
        // (providerId, accountId), so two rows for the same provider on one user
        // is at best redundant and at worst ambiguous.
        if (opts.moveAuthAccounts) {
            await tx
                .delete(accounts)
                .where(
                    and(
                        eq(accounts.userId, oldUserId),
                        inArray(
                            accounts.providerId,
                            tx
                                .select({ providerId: accounts.providerId })
                                .from(accounts)
                                .where(eq(accounts.userId, newUserId))
                        )
                    )
                )
            await tx
                .update(accounts)
                .set({ userId: newUserId, updatedAt: new Date() })
                .where(eq(accounts.userId, oldUserId))
        }

        if (opts.copyIdentity) {
            const [oldUser] = await tx
                .select({ old_id: users.old_id, picture: users.picture })
                .from(users)
                .where(eq(users.id, oldUserId))
                .limit(1)

            if (oldUser) {
                await tx
                    .update(users)
                    .set({
                        old_id: oldUser.old_id,
                        picture: oldUser.picture,
                        updatedAt: new Date()
                    })
                    .where(eq(users.id, newUserId))
            }
        }

        // signups: (season, player) is unique — where both accounts hold a
        // signup for the same season (the typical duplicate-account case),
        // keep the new user's row and drop the old duplicate (its
        // user_unavailability children cascade away).
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
        // evaluations: (season, player, evaluator) is unique — drop old rows
        // that would collide after repointing either column.
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
                        player: r.player === oldUserId ? newUserId : r.player,
                        evaluator:
                            r.evaluator === oldUserId ? newUserId : r.evaluator
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
        // userRoles: identity is unique (NULLS NOT DISTINCT) — drop old rows
        // duplicating a role the new user already holds, then repoint the rest.
        // (user_id CASCADEs on delete, but granted_by does not, so explicit
        // handling stays.)
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
            await tx.delete(userRoles).where(inArray(userRoles.id, dupRoleIds))
        }
        await tx
            .update(userRoles)
            .set({ user_id: newUserId })
            .where(eq(userRoles.user_id, oldUserId))
        await tx
            .update(userRoles)
            .set({ granted_by: newUserId })
            .where(eq(userRoles.granted_by, oldUserId))

        // player_ratings: (season, player, evaluator) unique — same collision
        // handling as evaluations.
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
                        player: r.player === oldUserId ? newUserId : r.player,
                        evaluator:
                            r.evaluator === oldUserId ? newUserId : r.evaluator
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

        // waiver_acceptances: restrict FK + unique (user, waiver) — drop old
        // acceptances of waivers the new user already accepted, repoint the
        // rest so legal proof survives the merge.
        await tx
            .delete(waiverAcceptances)
            .where(
                and(
                    eq(waiverAcceptances.user_id, oldUserId),
                    inArray(
                        waiverAcceptances.waiver_id,
                        tx
                            .select({ waiver_id: waiverAcceptances.waiver_id })
                            .from(waiverAcceptances)
                            .where(eq(waiverAcceptances.user_id, newUserId))
                    )
                )
            )
        await tx
            .update(waiverAcceptances)
            .set({ user_id: newUserId })
            .where(eq(waiverAcceptances.user_id, oldUserId))

        // substitution history (restrict FKs — must be repointed or the final
        // delete fails)
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

        // sub_requests: original_user/target_user cascade away with the delete,
        // but requested_by and responded_by are RESTRICT — Postgres raises on
        // those before any cascade runs, so they have to be repointed here.
        await tx
            .update(subRequests)
            .set({ requested_by: newUserId })
            .where(eq(subRequests.requested_by, oldUserId))
        await tx
            .update(subRequests)
            .set({ responded_by: newUserId })
            .where(eq(subRequests.responded_by, oldUserId))

        // tournament participation. tournament_roster has a unique
        // (tournament, user) — keep-new policy like signups. If both accounts
        // CAPTAIN a team in the same tournament the merge fails loudly (that
        // needs a human decision about which team survives).
        await tx.delete(tournamentRoster).where(
            and(
                eq(tournamentRoster.user_id, oldUserId),
                inArray(
                    tournamentRoster.tournament_id,
                    tx
                        .select({
                            tournament_id: tournamentRoster.tournament_id
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
                            tournament_id: tournamentWaitlist.tournament_id
                        })
                        .from(tournamentWaitlist)
                        .where(eq(tournamentWaitlist.user_id, newUserId))
                )
            )
        )
        await tx
            .update(tournamentWaitlist)
            .set({ user_id: newUserId })
            .where(eq(tournamentWaitlist.user_id, oldUserId))

        // Finally delete the old user. Sessions, accounts,
        // user_unavailability, season_refs, match_referees, and any remaining
        // user_roles rows for the old id cascade automatically.
        await tx.delete(users).where(eq(users.id, oldUserId))

        // Compose the surviving record. Only legal now that the deleted row is
        // gone: `email` is unique, so the survivor could not have taken the
        // deleted account's address a moment ago.
        if (opts.survivorPatch && Object.keys(opts.survivorPatch).length > 0) {
            await tx
                .update(users)
                .set({ ...opts.survivorPatch, updatedAt: new Date() })
                .where(eq(users.id, newUserId))
        }
    })
}
