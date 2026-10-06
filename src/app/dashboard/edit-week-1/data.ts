import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import {
    signups,
    users,
    week1Rosters,
    drafts,
    teams,
    seasons
} from "@/database/schema"
import { desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig, getEventsByType } from "@/lib/site-config"
import { fetchPlayerScores } from "@/lib/player-score"
import { getUnavailableSignupIdsForEvent } from "@/lib/week-rosters"
import { loadTryoutSlotRequests } from "@/lib/tryout-slot-requests"
import { getTryoutSlotLabels } from "@/lib/tryout-slot-labels"
import { isAdminOrDirectorBySession } from "@/next/session"

export interface Week1EditablePlayer {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
    placementScore: number
    playFirstWeek: boolean
    seasonsPlayed: number
    hasPairPick: boolean
    /** Tryout sessions (1-2) the player asked to play in; null = no request. */
    requestedSlots: number[] | null
    slotRequestComment: string | null
}

export interface Week1EditableSlot {
    id: number
    sessionNumber: number
    courtNumber: number
    userId: string
}

export const getEditWeek1Data = withAction(
    async (): Promise<
        ActionResult<{
            seasonId: number
            seasonLabel: string
            players: Week1EditablePlayer[]
            slots: Week1EditableSlot[]
            /** Labels for sessions 1-2 (e.g. "7:00 PM"). */
            slotLabels: string[]
        }>
    > => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("You don't have permission to access this page.")
        }

        try {
            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

            const [signupPlayersRaw, rosterSlots] = await Promise.all([
                db
                    .select({
                        id: users.id,
                        firstName: users.first_name,
                        lastName: users.last_name,
                        preferredName: users.preferred_name,
                        male: users.male,
                        signupId: signups.id,
                        pairPick: signups.pair_pick
                    })
                    .from(signups)
                    .innerJoin(users, eq(signups.player, users.id))
                    .where(eq(signups.season, config.seasonId))
                    .orderBy(users.last_name, users.first_name),
                db
                    .select({
                        id: week1Rosters.id,
                        sessionNumber: week1Rosters.session_number,
                        courtNumber: week1Rosters.court_number,
                        userId: week1Rosters.user
                    })
                    .from(week1Rosters)
                    .where(eq(week1Rosters.season, config.seasonId))
                    .orderBy(
                        week1Rosters.session_number,
                        week1Rosters.court_number,
                        week1Rosters.id
                    )
            ])

            const userIds = signupPlayersRaw.map((p) => p.id)

            const draftRows =
                userIds.length > 0
                    ? await db
                          .select({
                              userId: drafts.user,
                              seasonId: seasons.id,
                              overall: drafts.overall
                          })
                          .from(drafts)
                          .innerJoin(teams, eq(drafts.team, teams.id))
                          .innerJoin(seasons, eq(teams.season, seasons.id))
                          .where(inArray(drafts.user, userIds))
                          .orderBy(desc(seasons.id))
                    : []

            const seasonsPlayedByUser = new Map<string, Set<number>>()
            for (const row of draftRows) {
                const played =
                    seasonsPlayedByUser.get(row.userId) || new Set<number>()
                played.add(row.seasonId)
                seasonsPlayedByUser.set(row.userId, played)
            }

            const [scoreByUser, slotRequestByUser] = await Promise.all([
                fetchPlayerScores(userIds, config.seasonId),
                loadTryoutSlotRequests(config.seasonId, 1)
            ])

            const tryouts = getEventsByType(config, "tryout")
            const tryout1Event = tryouts[0] ?? null

            const signupIds = signupPlayersRaw.map((p) => p.signupId)
            const unavailableForTryout1 = tryout1Event
                ? await getUnavailableSignupIdsForEvent(
                      tryout1Event.id,
                      signupIds
                  )
                : new Set<number>()

            const signupPlayers: Week1EditablePlayer[] = signupPlayersRaw.map(
                (p) => ({
                    id: p.id,
                    firstName: p.firstName,
                    lastName: p.lastName,
                    preferredName: p.preferredName,
                    male: p.male,
                    playFirstWeek:
                        !tryout1Event || !unavailableForTryout1.has(p.signupId),
                    seasonsPlayed: seasonsPlayedByUser.get(p.id)?.size ?? 0,
                    placementScore: scoreByUser.get(p.id) ?? 200,
                    hasPairPick: !!p.pairPick,
                    requestedSlots:
                        slotRequestByUser.get(p.id)?.availableSlots ?? null,
                    slotRequestComment:
                        slotRequestByUser.get(p.id)?.comment ?? null
                })
            )

            return ok({
                seasonId: config.seasonId,
                seasonLabel,
                players: signupPlayers,
                slots: rosterSlots,
                slotLabels: getTryoutSlotLabels(config, 1)
            })
        } catch (error) {
            logger.error("Error loading edit week 1 data", undefined, error)
            return fail("Something went wrong while loading data.")
        }
    }
)
