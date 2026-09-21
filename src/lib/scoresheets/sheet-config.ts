/**
 * sheet-config.ts — the rules text, point ranges and identity codes printed on
 * a score sheet. Pure: no database, no pdf-lib.
 *
 * The scoring rules themselves are owned by the rules pages
 * (`src/components/rules/match-formats.tsx`, `playoffs.tsx`,
 * `interruptions.tsx`). Those are React components that `src/lib` may not
 * import, so the one-line summaries printed on the sheet are restated here.
 * When a rule changes there, change it here too.
 */

import { getSeasonAbbreviation } from "@/lib/pdf/tryout-sheet-shared"
import type { SheetEventType, SheetNight } from "./types"

/**
 * Bumped whenever the printed geometry changes in a way that would break a
 * reader built against the old layout. Printed on the sheet and carried in
 * the QR link so a photo can always be matched to the template that made it.
 */
export const TEMPLATE_VERSION = 1

export interface GameRule {
    game: 1 | 2 | 3
    /** Highest point number printed in the tally grid. */
    maxPoint: number
    /** Leading points pre-marked with an X (playoff games start at 4-4). */
    preStruck: number
    /** Numbers per printed row. */
    perRow: number
}

/**
 * Regular season caps every game at 27, so the grid stops there rather than
 * printing columns nobody can reach. Playoff games 1-2 cap at 30; game 3 is
 * uncapped, so the grid runs to 35 and anything beyond goes in the FINAL
 * boxes, which hold two digits.
 */
const REGULAR_SEASON_RULES: GameRule[] = [
    { game: 1, maxPoint: 27, preStruck: 0, perRow: 10 },
    { game: 2, maxPoint: 27, preStruck: 0, perRow: 10 },
    { game: 3, maxPoint: 27, preStruck: 0, perRow: 10 }
]

const PLAYOFF_RULES: GameRule[] = [
    { game: 1, maxPoint: 30, preStruck: 4, perRow: 10 },
    { game: 2, maxPoint: 30, preStruck: 4, perRow: 10 },
    { game: 3, maxPoint: 35, preStruck: 4, perRow: 12 }
]

export function gameRules(eventType: SheetEventType): GameRule[] {
    return eventType === "playoff" ? PLAYOFF_RULES : REGULAR_SEASON_RULES
}

/** Number of printed tally rows for a game. */
export function tallyRowCount(rule: GameRule): number {
    return Math.ceil(rule.maxPoint / rule.perRow)
}

const REGULAR_SEASON_TEXT: string[] = [
    "WARM-UPS: warm up and be ready before the previous match ends.",
    "RALLY SCORING. Play to 25, win by 2, with a 27-point cap.",
    "Game 1 ends more than 25 min after match start? Start game 2 at 6-6 (X out points 1-6).",
    "Game 2 ends more than 40 min after match start? Start game 3 at 6-6 (X out points 1-6).",
    "Two 30-second timeouts per team per game."
]

const PLAYOFF_TEXT: string[] = [
    "WARM-UPS: warm up and be ready before the previous match ends.",
    "RALLY SCORING. Games 1 & 2: both teams start at 4. Play to 25, win by 2, 30-point cap.",
    "Game 3: start at 4, play to 25, win by 2, NO cap. Switch sides at 15.",
    "Points 1-4 are pre-marked. Two 30-second timeouts per team per game.",
    "Work team is 4 players: scorer, two line judges, down ref."
]

export function ruleLines(eventType: SheetEventType): string[] {
    return eventType === "playoff" ? PLAYOFF_TEXT : REGULAR_SEASON_TEXT
}

/**
 * How to fill the sheet. Printed in bold above the match blocks because the
 * FINAL boxes are new and are the only thing a reader will later parse.
 */
export const FILL_INSTRUCTION =
    "Slash each point as it is scored. At the end of every game write the FINAL score in the boxes, one digit per box."

/** "fall" + 2026 -> "F26". */
export function seasonCodeFor(seasonName: string, year: number): string {
    const abbreviation = getSeasonAbbreviation(seasonName)
    return `${abbreviation}${String(year % 100).padStart(2, "0")}`
}

/** "F26-W3-C4"; playoff nights use P, an unassigned court uses CTBD. */
export function sheetCode(
    night: Pick<SheetNight, "seasonCode" | "eventType" | "ordinal">,
    court: number | null
): string {
    const phase = night.eventType === "playoff" ? "P" : "W"
    const courtPart = court === null ? "CTBD" : `C${court}`
    return `${night.seasonCode}-${phase}${night.ordinal}-${courtPart}`
}

/**
 * The QR target: the score-entry page with this night and court preselected.
 * The link doubles as the sheet's machine identity -- it carries the date,
 * the court and the template version.
 */
export function sheetDeepLink(
    siteUrl: string,
    date: string,
    court: number | null
): string {
    const base = siteUrl.replace(/\/+$/, "")
    const params = new URLSearchParams({ date })
    if (court !== null) params.set("court", String(court))
    params.set("v", String(TEMPLATE_VERSION))
    return `${base}/dashboard/enter-scores?${params.toString()}`
}
