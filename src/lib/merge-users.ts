import { db } from "@/database/db"
import {
    auditLog,
    concernComments,
    concernReplies,
    concerns,
    signupDrops,
    discounts,
    draftCaptRounds,
    draftHomework,
    draftPairDiffs,
    drafts,
    emailBroadcasts,
    emailSuppressions,
    evaluations,
    friendships,
    inboundEmailComments,
    inboundEmailReplies,
    inboundEmails,
    matchReferees,
    matchSubstitutions,
    movingDay,
    notificationOptouts,
    playerRatings,
    scoreSheets,
    seasonRefs,
    signups,
    subRequests,
    substitutions,
    teams,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist,
    tryoutSlotRequests,
    tryoutVolunteerAssignments,
    userRoles,
    userUnavailability,
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
}

/**
 * Move every record owned by `oldUserId` onto `newUserId`, then delete the old
 * account. Runs in a single transaction, so a failure anywhere rolls back.
 *
 * Only `sessions` and `accounts` are left to the final delete's ON DELETE
 * CASCADE: they authenticate a specific account rather than describing a
 * player, so they belong to the row that is going away. Everything else that
 * references a user -- including the cascading tables, which would otherwise be
 * silently destroyed rather than merged -- is repointed explicitly below.
 *
 * Repointing has to reckon with unique constraints: where both accounts hold a
 * row that would collide after the move (the same season's signup, the same
 * waiver acceptance, the same night's availability), the deleted account's copy
 * is dropped and the survivor's is kept.
 *
 * `survivorPatch` runs AFTER the delete, because `users.email` is UNIQUE NOT
 * NULL. Writing the deleted account's email onto the survivor while both rows
 * still exist violates that constraint and aborts the transaction. Callers that
 * derive the survivor from the email choice never patch `email` at all, but the
 * ordering stays as cheap insurance for the ones that might.
 *
 * Callers are responsible for authorization and for audit logging.
 */
export async function mergeUserRecords(
    oldUserId: string,
    newUserId: string,
    opts: MergeUserRecordsOptions
): Promise<void> {
    await db.transaction(async (tx) => {
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
        // If the two merged accounts had paired with each other, the signup now
        // points at itself. Nobody is their own pair pick, so clear it.
        await tx
            .update(signups)
            .set({ pair_pick: null })
            .where(
                and(
                    eq(signups.player, newUserId),
                    eq(signups.pair_pick, newUserId)
                )
            )

        // signup_drops
        await tx
            .update(signupDrops)
            .set({ player: newUserId })
            .where(eq(signupDrops.player, oldUserId))
        await tx
            .update(signupDrops)
            .set({ dropped_by: newUserId })
            .where(eq(signupDrops.dropped_by, oldUserId))
        await tx
            .update(signupDrops)
            .set({ restored_by: newUserId })
            .where(eq(signupDrops.restored_by, oldUserId))

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

        // draft_capt_rounds: (season, division, captain) is unique — drop the
        // old account's row where the survivor already captained that division.
        await tx
            .update(draftCaptRounds)
            .set({ saved_by: newUserId })
            .where(eq(draftCaptRounds.saved_by, oldUserId))
        const [oldCaptRoundRows, newCaptRoundRows] = await Promise.all([
            tx
                .select({
                    id: draftCaptRounds.id,
                    season: draftCaptRounds.season,
                    division: draftCaptRounds.division
                })
                .from(draftCaptRounds)
                .where(eq(draftCaptRounds.captain, oldUserId)),
            tx
                .select({
                    season: draftCaptRounds.season,
                    division: draftCaptRounds.division
                })
                .from(draftCaptRounds)
                .where(eq(draftCaptRounds.captain, newUserId))
        ])
        const newCaptRoundKeys = new Set(
            newCaptRoundRows.map((r) => `${r.season}|${r.division}`)
        )
        const dupCaptRoundIds = oldCaptRoundRows
            .filter((r) => newCaptRoundKeys.has(`${r.season}|${r.division}`))
            .map((r) => r.id)
        if (dupCaptRoundIds.length > 0) {
            await tx
                .delete(draftCaptRounds)
                .where(inArray(draftCaptRounds.id, dupCaptRoundIds))
        }
        await tx
            .update(draftCaptRounds)
            .set({ captain: newUserId })
            .where(eq(draftCaptRounds.captain, oldUserId))

        // draft_pair_diffs: (season, division, player1, player2) is unique, and
        // a row pairing the two merged accounts would collapse to a player
        // paired with themselves. Drop those outright, then drop the old rows
        // that would duplicate one the survivor already has.
        await tx
            .update(draftPairDiffs)
            .set({ saved_by: newUserId })
            .where(eq(draftPairDiffs.saved_by, oldUserId))
        const [oldPairDiffRows, newPairDiffRows] = await Promise.all([
            tx
                .select({
                    id: draftPairDiffs.id,
                    season: draftPairDiffs.season,
                    division: draftPairDiffs.division,
                    player1: draftPairDiffs.player1,
                    player2: draftPairDiffs.player2
                })
                .from(draftPairDiffs)
                .where(
                    or(
                        eq(draftPairDiffs.player1, oldUserId),
                        eq(draftPairDiffs.player2, oldUserId)
                    )
                ),
            tx
                .select({
                    season: draftPairDiffs.season,
                    division: draftPairDiffs.division,
                    player1: draftPairDiffs.player1,
                    player2: draftPairDiffs.player2
                })
                .from(draftPairDiffs)
                .where(
                    or(
                        eq(draftPairDiffs.player1, newUserId),
                        eq(draftPairDiffs.player2, newUserId)
                    )
                )
        ])
        const pairDiffKey = (r: {
            season: number
            division: number
            player1: string
            player2: string
        }) => `${r.season}|${r.division}|${r.player1}|${r.player2}`
        const newPairDiffKeys = new Set(newPairDiffRows.map(pairDiffKey))
        const dropPairDiffIds = oldPairDiffRows
            .filter((r) => {
                const player1 = r.player1 === oldUserId ? newUserId : r.player1
                const player2 = r.player2 === oldUserId ? newUserId : r.player2
                return (
                    player1 === player2 ||
                    newPairDiffKeys.has(pairDiffKey({ ...r, player1, player2 }))
                )
            })
            .map((r) => r.id)
        if (dropPairDiffIds.length > 0) {
            await tx
                .delete(draftPairDiffs)
                .where(inArray(draftPairDiffs.id, dropPairDiffIds))
        }
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
        // (match, original_user) is unique — drop the old account's row where
        // the survivor was already subbed out of that match.
        await tx
            .delete(matchSubstitutions)
            .where(
                and(
                    eq(matchSubstitutions.original_user, oldUserId),
                    inArray(
                        matchSubstitutions.match,
                        tx
                            .select({ match: matchSubstitutions.match })
                            .from(matchSubstitutions)
                            .where(
                                eq(matchSubstitutions.original_user, newUserId)
                            )
                    )
                )
            )
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

        // sub_requests. A request between the two merged accounts becomes a
        // request to sub for oneself, and pending requests are unique on
        // (match, original_user, target_user) — drop both cases, then repoint
        // the rest so the sub history survives.
        await tx
            .update(subRequests)
            .set({ requested_by: newUserId })
            .where(eq(subRequests.requested_by, oldUserId))
        await tx
            .update(subRequests)
            .set({ responded_by: newUserId })
            .where(eq(subRequests.responded_by, oldUserId))
        const [oldSubReqRows, newSubReqRows] = await Promise.all([
            tx
                .select({
                    id: subRequests.id,
                    match: subRequests.match,
                    original_user: subRequests.original_user,
                    target_user: subRequests.target_user,
                    status: subRequests.status
                })
                .from(subRequests)
                .where(
                    or(
                        eq(subRequests.original_user, oldUserId),
                        eq(subRequests.target_user, oldUserId)
                    )
                ),
            tx
                .select({
                    match: subRequests.match,
                    original_user: subRequests.original_user,
                    target_user: subRequests.target_user
                })
                .from(subRequests)
                .where(
                    and(
                        eq(subRequests.status, "pending"),
                        or(
                            eq(subRequests.original_user, newUserId),
                            eq(subRequests.target_user, newUserId)
                        )
                    )
                )
        ])
        const subReqKey = (r: {
            match: number
            original_user: string
            target_user: string
        }) => `${r.match}|${r.original_user}|${r.target_user}`
        const newSubReqKeys = new Set(newSubReqRows.map(subReqKey))
        const dropSubReqIds = oldSubReqRows
            .filter((r) => {
                const original_user =
                    r.original_user === oldUserId ? newUserId : r.original_user
                const target_user =
                    r.target_user === oldUserId ? newUserId : r.target_user
                return (
                    original_user === target_user ||
                    (r.status === "pending" &&
                        newSubReqKeys.has(
                            subReqKey({ ...r, original_user, target_user })
                        ))
                )
            })
            .map((r) => r.id)
        if (dropSubReqIds.length > 0) {
            await tx
                .delete(subRequests)
                .where(inArray(subRequests.id, dropSubReqIds))
        }
        await tx
            .update(subRequests)
            .set({ original_user: newUserId })
            .where(eq(subRequests.original_user, oldUserId))
        await tx
            .update(subRequests)
            .set({ target_user: newUserId })
            .where(eq(subRequests.target_user, oldUserId))

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

        // user_unavailability: (user_id, event_id) is unique. Rows attached to
        // a duplicate signup already cascaded away when that signup was
        // dropped above; what remains is availability the survivor should
        // inherit rather than lose.
        await tx
            .delete(userUnavailability)
            .where(
                and(
                    eq(userUnavailability.user_id, oldUserId),
                    inArray(
                        userUnavailability.event_id,
                        tx
                            .select({ event_id: userUnavailability.event_id })
                            .from(userUnavailability)
                            .where(eq(userUnavailability.user_id, newUserId))
                    )
                )
            )
        await tx
            .update(userUnavailability)
            .set({ user_id: newUserId })
            .where(eq(userUnavailability.user_id, oldUserId))

        // season_refs: (season_id, user_id) is unique — keep the survivor's
        // certification row for a season they both hold one for.
        await tx
            .delete(seasonRefs)
            .where(
                and(
                    eq(seasonRefs.user_id, oldUserId),
                    inArray(
                        seasonRefs.season_id,
                        tx
                            .select({ season_id: seasonRefs.season_id })
                            .from(seasonRefs)
                            .where(eq(seasonRefs.user_id, newUserId))
                    )
                )
            )
        await tx
            .update(seasonRefs)
            .set({ user_id: newUserId })
            .where(eq(seasonRefs.user_id, oldUserId))

        // match_referees: the unique index is (match_id, role), so repointing
        // cannot violate it — but it could leave one person reffing the same
        // match twice under two roles. Drop those rather than create them.
        await tx
            .delete(matchReferees)
            .where(
                and(
                    eq(matchReferees.referee_id, oldUserId),
                    inArray(
                        matchReferees.match_id,
                        tx
                            .select({ match_id: matchReferees.match_id })
                            .from(matchReferees)
                            .where(eq(matchReferees.referee_id, newUserId))
                    )
                )
            )
        await tx
            .update(matchReferees)
            .set({ referee_id: newUserId })
            .where(eq(matchReferees.referee_id, oldUserId))

        // notification_optouts: (user_id, notification_type) is unique. An
        // opt-out on either account is a stated preference, so the survivor
        // inherits the union rather than only its own.
        await tx.delete(notificationOptouts).where(
            and(
                eq(notificationOptouts.user_id, oldUserId),
                inArray(
                    notificationOptouts.notification_type,
                    tx
                        .select({
                            notification_type:
                                notificationOptouts.notification_type
                        })
                        .from(notificationOptouts)
                        .where(eq(notificationOptouts.user_id, newUserId))
                )
            )
        )
        await tx
            .update(notificationOptouts)
            .set({ user_id: newUserId })
            .where(eq(notificationOptouts.user_id, oldUserId))

        // tryout_slot_requests: (season, user_id, week) is unique.
        const [oldSlotRows, newSlotRows] = await Promise.all([
            tx
                .select({
                    id: tryoutSlotRequests.id,
                    season: tryoutSlotRequests.season,
                    week: tryoutSlotRequests.week
                })
                .from(tryoutSlotRequests)
                .where(eq(tryoutSlotRequests.user_id, oldUserId)),
            tx
                .select({
                    season: tryoutSlotRequests.season,
                    week: tryoutSlotRequests.week
                })
                .from(tryoutSlotRequests)
                .where(eq(tryoutSlotRequests.user_id, newUserId))
        ])
        const newSlotKeys = new Set(
            newSlotRows.map((r) => `${r.season}|${r.week}`)
        )
        const dupSlotIds = oldSlotRows
            .filter((r) => newSlotKeys.has(`${r.season}|${r.week}`))
            .map((r) => r.id)
        if (dupSlotIds.length > 0) {
            await tx
                .delete(tryoutSlotRequests)
                .where(inArray(tryoutSlotRequests.id, dupSlotIds))
        }
        await tx
            .update(tryoutSlotRequests)
            .set({ user_id: newUserId })
            .where(eq(tryoutSlotRequests.user_id, oldUserId))
        await tx
            .update(tryoutSlotRequests)
            .set({ created_by: newUserId })
            .where(eq(tryoutSlotRequests.created_by, oldUserId))

        // tryout_volunteer_assignments: (job_id, time_slot_id, user_id) is
        // unique with NULLS NOT DISTINCT, so a whole-night job (null slot)
        // collides too.
        const [oldVolRows, newVolRows] = await Promise.all([
            tx
                .select({
                    id: tryoutVolunteerAssignments.id,
                    job_id: tryoutVolunteerAssignments.job_id,
                    time_slot_id: tryoutVolunteerAssignments.time_slot_id
                })
                .from(tryoutVolunteerAssignments)
                .where(eq(tryoutVolunteerAssignments.user_id, oldUserId)),
            tx
                .select({
                    job_id: tryoutVolunteerAssignments.job_id,
                    time_slot_id: tryoutVolunteerAssignments.time_slot_id
                })
                .from(tryoutVolunteerAssignments)
                .where(eq(tryoutVolunteerAssignments.user_id, newUserId))
        ])
        const volKey = (r: { job_id: number; time_slot_id: number | null }) =>
            `${r.job_id}|${r.time_slot_id ?? "null"}`
        const newVolKeys = new Set(newVolRows.map(volKey))
        const dupVolIds = oldVolRows
            .filter((r) => newVolKeys.has(volKey(r)))
            .map((r) => r.id)
        if (dupVolIds.length > 0) {
            await tx
                .delete(tryoutVolunteerAssignments)
                .where(inArray(tryoutVolunteerAssignments.id, dupVolIds))
        }
        await tx
            .update(tryoutVolunteerAssignments)
            .set({ user_id: newUserId })
            .where(eq(tryoutVolunteerAssignments.user_id, oldUserId))
        await tx
            .update(tryoutVolunteerAssignments)
            .set({ assigned_by: newUserId })
            .where(eq(tryoutVolunteerAssignments.assigned_by, oldUserId))

        // friendships. Two constraints bite here: a CHECK forbids befriending
        // yourself, so the edge between the two merged accounts has to go; and
        // a partial unique index allows only one LIVE (pending/accepted) edge
        // per unordered pair, so an old live edge is dropped where the survivor
        // already has a live edge with the same person. Terminal rows
        // (declined/cancelled/removed) sit outside that index and are kept as
        // history.
        const LIVE_FRIENDSHIP = ["pending", "accepted"] as const
        const [oldFriendRows, newLiveFriendRows] = await Promise.all([
            tx
                .select({
                    id: friendships.id,
                    requester: friendships.requester,
                    addressee: friendships.addressee,
                    status: friendships.status
                })
                .from(friendships)
                .where(
                    or(
                        eq(friendships.requester, oldUserId),
                        eq(friendships.addressee, oldUserId)
                    )
                ),
            tx
                .select({
                    requester: friendships.requester,
                    addressee: friendships.addressee
                })
                .from(friendships)
                .where(
                    and(
                        inArray(friendships.status, [...LIVE_FRIENDSHIP]),
                        or(
                            eq(friendships.requester, newUserId),
                            eq(friendships.addressee, newUserId)
                        )
                    )
                )
        ])
        const survivorLivePartners = new Set(
            newLiveFriendRows.map((r) =>
                r.requester === newUserId ? r.addressee : r.requester
            )
        )
        const dropFriendshipIds = oldFriendRows
            .filter((r) => {
                const partner =
                    r.requester === oldUserId ? r.addressee : r.requester
                if (partner === newUserId) {
                    // The two accounts were friends with each other.
                    return true
                }
                return (
                    LIVE_FRIENDSHIP.includes(
                        r.status as (typeof LIVE_FRIENDSHIP)[number]
                    ) && survivorLivePartners.has(partner)
                )
            })
            .map((r) => r.id)
        if (dropFriendshipIds.length > 0) {
            await tx
                .delete(friendships)
                .where(inArray(friendships.id, dropFriendshipIds))
        }
        await tx
            .update(friendships)
            .set({ requester: newUserId })
            .where(eq(friendships.requester, oldUserId))
        await tx
            .update(friendships)
            .set({ addressee: newUserId })
            .where(eq(friendships.addressee, oldUserId))

        // Finally delete the old user. Only its sessions and better-auth
        // `accounts` rows cascade away with it: those authenticate this
        // specific account, and the survivor keeps its own. Any remaining
        // user_roles rows for the old id cascade too.
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
