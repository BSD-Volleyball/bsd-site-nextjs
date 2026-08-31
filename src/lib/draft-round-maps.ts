import { parseGenderSplit } from "@/lib/utils"

export interface HomeworkRoundMaps {
    /** Homework male-tab round → expected draft round */
    male: Record<number, number>
    /** Homework non-male-tab round → expected draft round */
    nonMale: Record<number, number>
}

// Explicit per-split maps translating draft-homework round numbers into the
// draft rounds those picks are expected to land in. Homework rounds outside
// the map (including round 9, "Considering") intentionally have no entry —
// callers treat those as 9.
const SPLIT_ROUND_MAPS: Record<string, HomeworkRoundMaps> = {
    "5-3": {
        male: { 1: 1, 2: 2, 3: 4, 4: 6, 5: 7 },
        nonMale: { 1: 3, 2: 5, 3: 8 }
    },
    "6-2": {
        male: { 1: 1, 2: 2, 3: 4, 4: 5, 5: 6, 6: 7 },
        nonMale: { 1: 3, 2: 8 }
    }
}

/**
 * Returns the homework-round → draft-round maps for a division's
 * `gender_split`. Unrecognized splits fall back to the league-default 5-3
 * maps, mirroring `parseGenderSplit`'s fallback.
 */
export function buildHomeworkRoundMaps(
    genderSplit: string | null | undefined
): HomeworkRoundMaps {
    const { malePerTeam, nonMalePerTeam } = parseGenderSplit(genderSplit)
    return (
        SPLIT_ROUND_MAPS[`${malePerTeam}-${nonMalePerTeam}`] ??
        SPLIT_ROUND_MAPS["5-3"]
    )
}
