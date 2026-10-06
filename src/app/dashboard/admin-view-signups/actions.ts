"use server"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { revalidateCalendarFeeds } from "@/next/calendar-invalidation"
import {
    withAction,
    ok,
    fail,
    requireSeasonConfig,
    requireSession
} from "@/next/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    signups,
    signupDrops,
    draftHomework,
    drafts,
    teams,
    divisions,
    discounts,
    userUnavailability
} from "@/database/schema"
import { and, eq, isNull } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { getSessionUser, isAdminOrDirectorBySession } from "@/next/session"
import { logAuditEntry } from "@/lib/audit-log"
import {
    SIGNUP_DROP_CATEGORIES,
    type SignupDropCategory
} from "@/lib/signup-drops-display"
import { getCurrentDraftDivisions } from "@/lib/roster"

const signupMirrorSelection = {
    id: signups.id,
    season: signups.season,
    player: signups.player,
    age: signups.age,
    captain: signups.captain,
    pair: signups.pair,
    pairPick: signups.pair_pick,
    pairReason: signups.pair_reason,
    refInterest: signups.ref_interest,
    tryoutHelp: signups.tryout_help,
    orderId: signups.order_id,
    amountPaid: signups.amount_paid,
    createdAt: signups.created_at
}

/**
 * Drops a player from the current season.
 *
 * Undrafted players (pre-draft): the signup row is archived into signup_drops
 * (with everything needed to restore it) and deleted. Drafted players
 * (post-draft): only a drop record is inserted — the signup and roster slot
 * stay until a permanent sub is locked in.
 */
export const dropSignup = withAction(
    async (
        signupId: number,
        category: SignupDropCategory,
        note: string
    ): Promise<ActionResult<{ stage: "pre_draft" | "post_draft" }>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (!Number.isInteger(signupId) || signupId <= 0) {
            return fail("Invalid signup id.")
        }

        if (!SIGNUP_DROP_CATEGORIES.includes(category)) {
            return fail("Invalid drop reason category.")
        }

        const trimmedNote = note?.trim() || null

        const session = await requireSession()

        const config = await requireSeasonConfig()

        try {
            const [signupRecord] = await db
                .select(signupMirrorSelection)
                .from(signups)
                .where(
                    and(
                        eq(signups.id, signupId),
                        eq(signups.season, config.seasonId)
                    )
                )
                .limit(1)

            if (!signupRecord) {
                return fail("Signup entry not found for the current season.")
            }

            const [existingDrop] = await db
                .select({ id: signupDrops.id })
                .from(signupDrops)
                .where(
                    and(
                        eq(signupDrops.season, config.seasonId),
                        eq(signupDrops.player, signupRecord.player),
                        isNull(signupDrops.restored_at)
                    )
                )
                .limit(1)
            if (existingDrop) {
                return fail("This player already has an active drop record.")
            }

            const mirrorValues = {
                signup_id: signupRecord.id,
                season: signupRecord.season,
                player: signupRecord.player,
                age: signupRecord.age,
                captain: signupRecord.captain,
                pair: signupRecord.pair,
                pair_pick: signupRecord.pairPick,
                pair_reason: signupRecord.pairReason,
                ref_interest: signupRecord.refInterest,
                tryout_help: signupRecord.tryoutHelp,
                order_id: signupRecord.orderId,
                amount_paid: signupRecord.amountPaid,
                created_at: signupRecord.createdAt,
                reason_category: category,
                reason_note: trimmedNote,
                dropped_by: session.user.id
            }

            const draftedInMap = await getCurrentDraftDivisions(
                config.seasonId,
                [signupRecord.player]
            )

            if (draftedInMap.has(signupRecord.player)) {
                // POST-DRAFT: record the drop only. The signup and the drafts
                // row stay so the roster slot remains visible until a
                // permanent sub is locked in.
                const [teamRow] = await db
                    .select({
                        teamName: teams.name,
                        divisionName: divisions.name
                    })
                    .from(drafts)
                    .innerJoin(teams, eq(drafts.team, teams.id))
                    .innerJoin(divisions, eq(teams.division, divisions.id))
                    .where(
                        and(
                            eq(drafts.user, signupRecord.player),
                            eq(teams.season, config.seasonId)
                        )
                    )
                    .limit(1)

                await db.transaction(async (tx) => {
                    await tx.insert(signupDrops).values({
                        ...mirrorValues,
                        stage: "post_draft",
                        team_name: teamRow?.teamName ?? null,
                        division_name: teamRow?.divisionName ?? null
                    })

                    await logAuditEntry(
                        {
                            userId: session.user.id,
                            action: "drop",
                            entityType: "signups",
                            entityId: signupId,
                            summary: `Dropped drafted player (post-draft, signup and roster slot kept). Category: ${category}.${trimmedNote ? ` Note: ${trimmedNote}.` : ""} Signup record: ${JSON.stringify(signupRecord)}`
                        },
                        tx
                    )
                })

                revalidatePath("/dashboard/admin-view-signups")
                revalidateCalendarFeeds()
                return ok(
                    { stage: "post_draft" },
                    "Player marked as dropped. Their signup and roster slot are kept until a permanent sub is locked in."
                )
            }

            // PRE-DRAFT: archive everything the delete would destroy, then
            // delete the signup.
            await db.transaction(async (tx) => {
                const unavailRows = await tx
                    .select({ eventId: userUnavailability.event_id })
                    .from(userUnavailability)
                    .where(eq(userUnavailability.signup_id, signupId))
                const eventIds = unavailRows.map((r) => r.eventId)

                const homeworkRows = await tx
                    .select()
                    .from(draftHomework)
                    .where(
                        and(
                            eq(draftHomework.season, config.seasonId),
                            eq(draftHomework.player, signupRecord.player)
                        )
                    )

                // Captured before the delete: signups deletion sets
                // discounts.used_signup_id to NULL via FK.
                const [usedDiscount] = await tx
                    .select({ id: discounts.id })
                    .from(discounts)
                    .where(eq(discounts.used_signup_id, signupId))
                    .limit(1)

                await tx.insert(signupDrops).values({
                    ...mirrorValues,
                    stage: "pre_draft",
                    unavailability_event_ids: eventIds,
                    draft_homework_snapshot: homeworkRows,
                    discount_id: usedDiscount?.id ?? null
                })

                // Cascades to userUnavailability, nulls discounts.used_signup_id
                await tx.delete(signups).where(eq(signups.id, signupId))

                // Remove this player from any captain's draft homework board
                await tx
                    .delete(draftHomework)
                    .where(
                        and(
                            eq(draftHomework.season, config.seasonId),
                            eq(draftHomework.player, signupRecord.player)
                        )
                    )

                await logAuditEntry(
                    {
                        userId: session.user.id,
                        action: "drop",
                        entityType: "signups",
                        entityId: signupId,
                        summary: `Dropped signup (pre-draft, signup archived and deleted). Category: ${category}.${trimmedNote ? ` Note: ${trimmedNote}.` : ""} Signup record: ${JSON.stringify(signupRecord)}`
                    },
                    tx
                )
            })

            revalidatePath("/dashboard/admin-view-signups")
            revalidateCalendarFeeds()
            return ok({ stage: "pre_draft" }, "Signup dropped.")
        } catch (error) {
            logger.error("Error dropping signup", undefined, error)
            return fail("Something went wrong.")
        }
    }
)

/**
 * Reverses a drop. Post-draft drops (signup still live) are simply marked
 * restored. Pre-draft drops re-insert the signup with its original id and
 * bring back the archived availability, discount link, and draft homework.
 */
export const restoreDrop = withAction(
    async (dropId: number): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (!Number.isInteger(dropId) || dropId <= 0) {
            return fail("Invalid drop id.")
        }

        const session = await requireSession()

        try {
            const [drop] = await db
                .select()
                .from(signupDrops)
                .where(eq(signupDrops.id, dropId))
                .limit(1)

            if (!drop) {
                return fail("Drop record not found.")
            }
            if (drop.restored_at !== null) {
                return fail("This drop has already been restored.")
            }

            const restoredFields = {
                restored_at: new Date(),
                restored_by: session.user.id
            }

            if (drop.stage === "post_draft") {
                // Signup and roster slot were never removed.
                await db.transaction(async (tx) => {
                    await tx
                        .update(signupDrops)
                        .set(restoredFields)
                        .where(eq(signupDrops.id, dropId))

                    await logAuditEntry(
                        {
                            userId: session.user.id,
                            action: "restore",
                            entityType: "signups",
                            entityId: drop.signup_id,
                            summary: `Restored post-draft drop #${dropId} for player ${drop.player} (season ${drop.season}).`
                        },
                        tx
                    )
                })

                revalidatePath("/dashboard/admin-view-signups")
                revalidateCalendarFeeds()
                return ok(undefined, "Drop restored.")
            }

            // PRE-DRAFT: the signup row must come back.
            const [liveSignup] = await db
                .select({ id: signups.id })
                .from(signups)
                .where(
                    and(
                        eq(signups.season, drop.season),
                        eq(signups.player, drop.player)
                    )
                )
                .limit(1)
            if (liveSignup) {
                return fail(
                    "This player already has a live signup for that season."
                )
            }

            await db.transaction(async (tx) => {
                // Original id is safe to reuse: the sequence already allocated
                // it, so future serial inserts cannot collide.
                await tx.insert(signups).values({
                    id: drop.signup_id,
                    season: drop.season,
                    player: drop.player,
                    age: drop.age,
                    captain: drop.captain,
                    pair: drop.pair,
                    pair_pick: drop.pair_pick,
                    pair_reason: drop.pair_reason,
                    ref_interest: drop.ref_interest,
                    tryout_help: drop.tryout_help,
                    order_id: drop.order_id,
                    amount_paid: drop.amount_paid,
                    created_at: drop.created_at
                })

                const eventIds = drop.unavailability_event_ids ?? []
                if (eventIds.length > 0) {
                    await tx
                        .insert(userUnavailability)
                        .values(
                            eventIds.map((eventId) => ({
                                user_id: drop.player,
                                signup_id: drop.signup_id,
                                event_id: eventId
                            }))
                        )
                        .onConflictDoNothing()
                }

                // Re-link the discount redemption only if the discount has not
                // been pointed at another signup since.
                if (drop.discount_id !== null) {
                    await tx
                        .update(discounts)
                        .set({ used_signup_id: drop.signup_id })
                        .where(
                            and(
                                eq(discounts.id, drop.discount_id),
                                isNull(discounts.used_signup_id)
                            )
                        )
                }

                const homeworkRows = drop.draft_homework_snapshot ?? []
                if (homeworkRows.length > 0) {
                    await tx
                        .insert(draftHomework)
                        .values(
                            homeworkRows.map((row) => ({
                                season: row.season as number,
                                captain: row.captain as string,
                                division: row.division as number,
                                round: row.round as number,
                                slot: row.slot as number,
                                player: row.player as string,
                                is_male_tab: row.is_male_tab as boolean
                            }))
                        )
                        .onConflictDoNothing()
                }

                await tx
                    .update(signupDrops)
                    .set(restoredFields)
                    .where(eq(signupDrops.id, dropId))

                await logAuditEntry(
                    {
                        userId: session.user.id,
                        action: "restore",
                        entityType: "signups",
                        entityId: drop.signup_id,
                        summary: `Restored pre-draft drop #${dropId}: re-created signup ${drop.signup_id} for player ${drop.player} (season ${drop.season}) with ${(drop.unavailability_event_ids ?? []).length} availability rows.`
                    },
                    tx
                )
            })

            revalidatePath("/dashboard/admin-view-signups")
            revalidateCalendarFeeds()
            return ok(undefined, "Drop restored. The signup is live again.")
        } catch (error) {
            logger.error("Error restoring drop", undefined, error)
            return fail("Something went wrong.")
        }
    }
)

export async function logAdminCsvDownload(): Promise<void> {
    const user = await getSessionUser()
    if (!user) return

    const config = await getSeasonConfig()

    await logAuditEntry({
        userId: user.id,
        action: "read",
        entityType: "signups",
        summary: `Downloaded admin signups CSV for season ${config.seasonId ?? "unknown"}`
    })
}
