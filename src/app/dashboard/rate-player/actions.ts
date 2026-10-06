"use server"

import { logger } from "@/lib/logger"
import { db } from "@/database/db"
import { playerRatings, signups } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"
import {
    withAction,
    ok,
    fail,
    requireSession,
    requireSeasonConfig,
    requirePermission
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"

export type RatingSkill =
    | "overall"
    | "passing"
    | "setting"
    | "hitting"
    | "serving"
    | "blocking"

export type RatingNoteType = "shared" | "private"

export interface SkillRatingsInput {
    overall: number
    passing: number
    setting: number
    hitting: number
    serving: number
    blocking: number
}

const validNoteTypes = new Set<RatingNoteType>(["shared", "private"])

function toNullableRating(value: number): number | null {
    return value === 0 ? null : value
}

function getRatingNoteUpdate(
    noteType: RatingNoteType,
    note: string | null
): Partial<typeof playerRatings.$inferInsert> {
    if (noteType === "shared") {
        return { shared_notes: note }
    }

    return { private_notes: note }
}

async function ensurePlayerIsActiveSeasonSignup(
    playerId: string,
    seasonId: number
): Promise<boolean> {
    const [signup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(and(eq(signups.season, seasonId), eq(signups.player, playerId)))
        .limit(1)

    return !!signup
}

export const savePlayerSkillRatings = withAction(
    async (
        playerId: string,
        values: SkillRatingsInput
    ): Promise<ActionResult> => {
        if (!playerId.trim()) {
            return fail("Player ID is required.")
        }

        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("players:rate", { seasonId: config.seasonId })
        const context = {
            seasonId: config.seasonId,
            evaluatorId: session.user.id
        }

        if (playerId === context.evaluatorId) {
            return fail("You cannot rate yourself.")
        }

        const skillValues = [
            values.overall,
            values.passing,
            values.setting,
            values.hitting,
            values.serving,
            values.blocking
        ]

        const areValuesValid = skillValues.every(
            (value) => Number.isFinite(value) && value >= 0 && value <= 6
        )

        if (!areValuesValid) {
            return fail("Skill values must be between 0 and 6.")
        }

        try {
            const playerIsSignedUp = await ensurePlayerIsActiveSeasonSignup(
                playerId,
                context.seasonId
            )

            if (!playerIsSignedUp) {
                return fail("Player is not signed up for the active season.")
            }

            const now = new Date()

            await db
                .insert(playerRatings)
                .values({
                    season: context.seasonId,
                    player: playerId,
                    evaluator: context.evaluatorId,
                    overall: toNullableRating(values.overall),
                    passing: toNullableRating(values.passing),
                    setting: toNullableRating(values.setting),
                    hitting: toNullableRating(values.hitting),
                    serving: toNullableRating(values.serving),
                    blocking: toNullableRating(values.blocking),
                    updated_at: now
                })
                .onConflictDoUpdate({
                    target: [
                        playerRatings.season,
                        playerRatings.player,
                        playerRatings.evaluator
                    ],
                    set: {
                        overall: toNullableRating(values.overall),
                        passing: toNullableRating(values.passing),
                        setting: toNullableRating(values.setting),
                        hitting: toNullableRating(values.hitting),
                        serving: toNullableRating(values.serving),
                        blocking: toNullableRating(values.blocking),
                        updated_at: now
                    }
                })

            await logAuditEntry({
                userId: context.evaluatorId,
                action: "update",
                entityType: "player_rating",
                entityId: playerId,
                summary: `Saved full skill ratings for player ${playerId} in season ${context.seasonId}`
            })

            return ok(undefined, "Ratings saved.")
        } catch (error) {
            logger.error("Error saving player skill ratings", undefined, error)
            return fail("Failed to save ratings.")
        }
    }
)

export const savePlayerRatingNote = withAction(
    async (
        playerId: string,
        noteType: RatingNoteType,
        note: string
    ): Promise<ActionResult> => {
        if (!playerId.trim()) {
            return fail("Player ID is required.")
        }

        if (!validNoteTypes.has(noteType)) {
            return fail("Invalid note type.")
        }

        const session = await requireSession()
        const config = await requireSeasonConfig()
        await requirePermission("players:rate", { seasonId: config.seasonId })
        const context = {
            seasonId: config.seasonId,
            evaluatorId: session.user.id
        }

        if (playerId === context.evaluatorId) {
            return fail("You cannot rate yourself.")
        }

        try {
            const playerIsSignedUp = await ensurePlayerIsActiveSeasonSignup(
                playerId,
                context.seasonId
            )

            if (!playerIsSignedUp) {
                return fail("Player is not signed up for the active season.")
            }

            const normalizedNote = note.trim() || null
            const noteUpdate = getRatingNoteUpdate(noteType, normalizedNote)
            const now = new Date()

            await db
                .insert(playerRatings)
                .values({
                    season: context.seasonId,
                    player: playerId,
                    evaluator: context.evaluatorId,
                    updated_at: now,
                    ...noteUpdate
                })
                .onConflictDoUpdate({
                    target: [
                        playerRatings.season,
                        playerRatings.player,
                        playerRatings.evaluator
                    ],
                    set: {
                        ...noteUpdate,
                        updated_at: now
                    }
                })

            await logAuditEntry({
                userId: context.evaluatorId,
                action: "update",
                entityType: "player_rating",
                entityId: playerId,
                summary: `Saved ${noteType} note for player ${playerId} in season ${context.seasonId}`
            })

            return ok(undefined, "Note saved.")
        } catch (error) {
            logger.error("Error saving player rating note", undefined, error)
            return fail("Failed to save note.")
        }
    }
)
