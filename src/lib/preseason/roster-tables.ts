import { week2Rosters, week3Rosters } from "@/database/schema"

/**
 * The roster table for preseason week 2 or 3. The two tables share an
 * identical column set, so the cast gives every caller one code path.
 */
export function weekRosterTable(week: 2 | 3) {
    return (week === 2 ? week2Rosters : week3Rosters) as typeof week2Rosters
}
