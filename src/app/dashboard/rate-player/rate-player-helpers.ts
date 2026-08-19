import { formatDisplayName } from "@/lib/utils"
import type { SeasonPhase } from "@/lib/season-phases"
import type { LookupType, PlayerRatingValues, RatePlayerEntry } from "./actions"

export function getDisplayName(player: RatePlayerEntry): string {
    return formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
}

export function getOldIdLabel(player: RatePlayerEntry): string {
    if (player.oldId === null) {
        return "No old_id"
    }

    return `#${player.oldId}`
}

export function getGenderLabel(male: boolean | null): string {
    if (male === true) {
        return "Male"
    }

    if (male === false) {
        return "Non-Male"
    }

    return "—"
}

export function getEmptyRating(): PlayerRatingValues {
    return {
        overall: null,
        passing: null,
        setting: null,
        hitting: null,
        serving: null,
        blocking: null,
        sharedNotes: null,
        privateNotes: null
    }
}

export interface DefaultLookupContext {
    phase: SeasonPhase
    /** Tryout event dates (YYYY-MM-DD) in week order: [tryout 1, tryout 2, tryout 3]. */
    tryoutDates: string[]
    /** Today's date (YYYY-MM-DD) in the league's timezone. */
    today: string
    /** True once at least one draft pick exists for the season. */
    draftStarted: boolean
    /** Whether the "By Team" option is offered in the dropdown. */
    byTeamAvailable: boolean
}

/**
 * Picks the lookup type the Rate Player page should open on, following the
 * season timeline: Direct in the off-season and before tryouts, Tryout N
 * from that tryout's date until the next one, and By Team once drafting has
 * started. ISO date strings compare lexically, so no Date parsing is needed.
 */
export function resolveDefaultLookupType({
    phase,
    tryoutDates,
    today,
    draftStarted,
    byTeamAvailable
}: DefaultLookupContext): LookupType {
    if (phase === "off_season" || phase === "complete") {
        return "direct"
    }

    const teamsExist =
        draftStarted || phase === "regular_season" || phase === "playoffs"
    if (teamsExist && byTeamAvailable) {
        return "byTeam"
    }

    const tryoutLookups: LookupType[] = ["tryout1", "tryout2", "tryout3"]
    for (let i = Math.min(tryoutDates.length, 3) - 1; i >= 0; i--) {
        if (today >= tryoutDates[i]) {
            return tryoutLookups[i]
        }
    }

    return "direct"
}
