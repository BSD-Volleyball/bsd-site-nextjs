import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    draftCaptRounds,
    individual_divisions,
    teams,
    users
} from "@/database/schema"
import { isGhostCaptain } from "@/lib/ghost-captain"
import { formatDisplayName } from "@/lib/utils"

/**
 * Draft Setup readiness for one season+division.
 *
 * Both steps carry an explicit lock timestamp on `individual_divisions`
 * because "done" can't be derived from data alone: `teams.number` exists from
 * team creation and `draft_capt_rounds` rows may cover only some captains.
 * Step 1 additionally checks that every current (non-ghost) captain has a
 * seat, so swapping a captain after locking flips the step to "stale" rather
 * than silently seating five of six on draft night.
 */

export type DraftSetupStepState = "locked" | "stale" | "unlocked"

export interface DraftSetupStatus {
    rounds: {
        state: DraftSetupStepState
        lockedAt: Date | null
        missingCaptains: string[]
    }
    order: {
        state: DraftSetupStepState
        lockedAt: Date | null
    }
    ready: boolean
}

export interface DraftSetupInputs {
    teams: { captain: string; captainName: string }[]
    captainsWithRounds: string[]
    roundsLockedAt: Date | null
    orderLockedAt: Date | null
}

export function computeDraftSetupStatus(
    input: DraftSetupInputs
): DraftSetupStatus {
    const seated = new Set(input.captainsWithRounds)
    const missingCaptains = input.teams
        .filter((t) => !isGhostCaptain(t.captain) && !seated.has(t.captain))
        .map((t) => t.captainName)

    let roundsState: DraftSetupStepState = "unlocked"
    if (input.roundsLockedAt) {
        roundsState = missingCaptains.length === 0 ? "locked" : "stale"
    }

    const orderState: DraftSetupStepState = input.orderLockedAt
        ? "locked"
        : "unlocked"

    return {
        rounds: {
            state: roundsState,
            lockedAt: input.roundsLockedAt,
            missingCaptains
        },
        order: { state: orderState, lockedAt: input.orderLockedAt },
        ready: roundsState === "locked" && orderState === "locked"
    }
}

export async function getDraftSetupStatus(
    seasonId: number,
    divisionId: number
): Promise<DraftSetupStatus> {
    const [teamRows, roundRows, [indivDiv]] = await Promise.all([
        db
            .select({
                captain: teams.captain,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(teams)
            .innerJoin(users, eq(teams.captain, users.id))
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            ),
        db
            .select({ captain: draftCaptRounds.captain })
            .from(draftCaptRounds)
            .where(
                and(
                    eq(draftCaptRounds.season, seasonId),
                    eq(draftCaptRounds.division, divisionId)
                )
            ),
        db
            .select({
                roundsLockedAt: individual_divisions.draft_rounds_locked_at,
                orderLockedAt: individual_divisions.draft_order_locked_at
            })
            .from(individual_divisions)
            .where(
                and(
                    eq(individual_divisions.season, seasonId),
                    eq(individual_divisions.division, divisionId)
                )
            )
            .limit(1)
    ])

    return computeDraftSetupStatus({
        teams: teamRows.map((t) => ({
            captain: t.captain,
            captainName: formatDisplayName(
                t.firstName,
                t.lastName,
                t.preferredName
            )
        })),
        captainsWithRounds: roundRows.map((r) => r.captain),
        roundsLockedAt: indivDiv?.roundsLockedAt ?? null,
        orderLockedAt: indivDiv?.orderLockedAt ?? null
    })
}
