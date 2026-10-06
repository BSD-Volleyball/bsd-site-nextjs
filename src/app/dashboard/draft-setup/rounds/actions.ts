"use server"

import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { and, eq, or } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import {
    draftCaptRounds,
    draftPairDiffs,
    individual_divisions
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import { isCommissionerBySession } from "@/next/session"
import { commissionerCanWriteDivision } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import { getDraftSetupStatus } from "@/lib/draft-setup"

export const setCaptainRound = withAction(
    async (input: {
        captainId: string
        round: number
        divisionId: number
    }): Promise<ActionResult> => {
        if (!(await isCommissionerBySession())) {
            return fail("Not authorized")
        }
        if (
            !Number.isInteger(input.round) ||
            input.round < 1 ||
            input.round > 8
        ) {
            return fail("Invalid round (must be 1–8)")
        }
        if (!Number.isInteger(input.divisionId) || input.divisionId <= 0) {
            return fail("Invalid divisionId")
        }

        const session = await auth.api.getSession({ headers: await headers() })
        const userId = session!.user.id

        const config = await getSeasonConfig()
        const seasonId = config.seasonId!

        if (
            !(await commissionerCanWriteDivision(
                userId,
                seasonId,
                input.divisionId
            ))
        ) {
            return fail("You don't have permission for this division.")
        }

        await db
            .insert(draftCaptRounds)
            .values({
                season: seasonId,
                division: input.divisionId,
                saved_by: userId,
                captain: input.captainId,
                round: input.round,
                updated_at: new Date()
            })
            .onConflictDoUpdate({
                target: [
                    draftCaptRounds.season,
                    draftCaptRounds.division,
                    draftCaptRounds.captain
                ],
                set: {
                    round: input.round,
                    saved_by: userId,
                    updated_at: new Date()
                }
            })

        await logAuditEntry({
            userId,
            action: "set_captain_round",
            entityType: "draft_captain_round",
            entityId: input.captainId,
            summary: `Set captain draft round to ${input.round} (division ${input.divisionId}, season ${seasonId})`
        })

        return ok(undefined, "Saved")
    }
)

/**
 * Step 1 lock. Called after every setCaptainRound/setPairDiff save has
 * resolved. Refuses to lock if any non-ghost captain still lacks a round so
 * the lock can never be born stale — the live draft board seeds captains
 * from draft_capt_rounds and a missing row means an empty seat.
 */
export const lockDraftRounds = withAction(
    async (input: { divisionId: number }): Promise<ActionResult> => {
        if (!(await isCommissionerBySession())) {
            return fail("Not authorized")
        }
        if (!Number.isInteger(input.divisionId) || input.divisionId <= 0) {
            return fail("Invalid divisionId")
        }

        const session = await auth.api.getSession({ headers: await headers() })
        const userId = session!.user.id

        const config = await getSeasonConfig()
        const seasonId = config.seasonId!

        if (
            !(await commissionerCanWriteDivision(
                userId,
                seasonId,
                input.divisionId
            ))
        ) {
            return fail("You don't have permission for this division.")
        }

        const status = await getDraftSetupStatus(seasonId, input.divisionId)
        if (status.rounds.missingCaptains.length > 0) {
            return fail(
                `Cannot lock: no draft round saved for ${status.rounds.missingCaptains.join(", ")}.`
            )
        }

        const now = new Date()
        const updated = await db
            .update(individual_divisions)
            .set({
                draft_rounds_locked_at: now,
                draft_rounds_locked_by: userId
            })
            .where(
                and(
                    eq(individual_divisions.season, seasonId),
                    eq(individual_divisions.division, input.divisionId)
                )
            )
            .returning({ id: individual_divisions.id })

        if (updated.length === 0) {
            return fail("Division is not configured for this season.")
        }

        await logAuditEntry({
            userId,
            action: "lock_draft_rounds",
            entityType: "individual_division",
            entityId: String(updated[0].id),
            summary: `Locked captain draft rounds (division ${input.divisionId}, season ${seasonId})`
        })

        return ok(undefined, "Draft rounds locked")
    }
)

export const setPairDiff = withAction(
    async (input: {
        player1Id: string
        player2Id: string
        diff: number
        divisionId: number
    }): Promise<ActionResult> => {
        if (!(await isCommissionerBySession())) {
            return fail("Not authorized")
        }
        if (!Number.isInteger(input.diff) || input.diff < 1 || input.diff > 8) {
            return fail("Invalid diff (must be 1–8)")
        }
        if (!Number.isInteger(input.divisionId) || input.divisionId <= 0) {
            return fail("Invalid divisionId")
        }

        const session = await auth.api.getSession({ headers: await headers() })
        const userId = session!.user.id

        const config = await getSeasonConfig()
        const seasonId = config.seasonId!

        if (
            !(await commissionerCanWriteDivision(
                userId,
                seasonId,
                input.divisionId
            ))
        ) {
            return fail("You don't have permission for this division.")
        }

        // Delete both possible orderings to handle rating-order changes from prior saves
        // Replace the pair's saved diff in one step, so a failed insert never
        // leaves the pair with no diff at all.
        await db.transaction(async (tx) => {
            await tx
                .delete(draftPairDiffs)
                .where(
                    and(
                        eq(draftPairDiffs.season, seasonId),
                        eq(draftPairDiffs.division, input.divisionId),
                        or(
                            and(
                                eq(draftPairDiffs.player1, input.player1Id),
                                eq(draftPairDiffs.player2, input.player2Id)
                            ),
                            and(
                                eq(draftPairDiffs.player1, input.player2Id),
                                eq(draftPairDiffs.player2, input.player1Id)
                            )
                        )
                    )
                )

            // Insert with player1 = higher-rated, player2 = lower-rated
            await tx.insert(draftPairDiffs).values({
                season: seasonId,
                division: input.divisionId,
                saved_by: userId,
                player1: input.player1Id,
                player2: input.player2Id,
                diff: input.diff,
                updated_at: new Date()
            })
        })

        await logAuditEntry({
            userId,
            action: "set_pair_diff",
            entityType: "draft_pair_diff",
            entityId: input.player1Id,
            summary: `Set draft pair diff to ${input.diff} (division ${input.divisionId}, season ${seasonId})`
        })

        return ok(undefined, "Saved")
    }
)
