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
 * reader built against the old layout. Carried in the page's machine tag so
 * a photo can always be matched to the template that printed it.
 *
 * v2: the third checkbox in each game cell became a WIN tick (the team that
 * won the game) where v1 had a forfeit tick, and moved 1.5pt right.
 * v3: after the first night in the gym — corner marks moved inside the
 * printable area (they were being clipped), everything set larger and in
 * black, rules cut from five lines to three, and the captain's initials box
 * moved under each captain's own name.
 */
export const TEMPLATE_VERSION = 3

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

/**
 * Three lines, not five. They came back from the gym too small to read, and
 * the fix is as much about using the width of the page as about the type
 * size: each line now runs the full column instead of stopping a third of the
 * way across.
 */
const REGULAR_SEASON_TEXT: string[] = [
    "RALLY SCORING — play to 25, win by 2, 27-point cap. Two 30-second timeouts per team per game.",
    "Warm up before the previous match ends so the next match can start on time.",
    "Game 1 ran past 25 min? Start game 2 at 6-6. Game 2 past 40 min? Start game 3 at 6-6. X out points 1-6."
]

const PLAYOFF_TEXT: string[] = [
    "RALLY SCORING — every game starts 4-4 (points 1-4 pre-marked). Two 30-second timeouts per team per game.",
    "Games 1 & 2: play to 25, win by 2, 30-point cap. Game 3: to 25, win by 2, NO cap, switch sides at 15.",
    "Warm up before the previous match ends. Work team is 4: scorer, two line judges, down ref."
]

export function ruleLines(eventType: SheetEventType): string[] {
    return eventType === "playoff" ? PLAYOFF_TEXT : REGULAR_SEASON_TEXT
}

/**
 * How to fill the sheet. Printed in bold above the match blocks because the
 * FINAL boxes and the WIN tick are new, and between them are everything a
 * reader will later parse.
 */
export const FILL_INSTRUCTION =
    "Slash each point as scored. After each game write the FINAL score, one digit per box, and tick WIN for the winner."

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
 * Printed beside the QR code for anyone typing it by hand. The QR image
 * itself (`public/score-sheet-qr.png`) encodes this same short link, which
 * redirects to /dashboard/enter-scores. It is deliberately generic: one
 * person collects every court's sheet and works through them on one page.
 */
export const SCORE_ENTRY_SHORT_URL = "bsdvb.us/s"

/**
 * The per-page machine tag, carried in its own small QR code.
 *
 * Because the visible QR is generic, this is what tells a processor exactly
 * which sheet a photo is. Leading `BSD<version>` both namespaces the payload
 * and says which template geometry to read it with.
 */
export function sheetTag(
    night: Pick<SheetNight, "seasonCode" | "eventType" | "ordinal" | "date">,
    court: number | null
): string {
    const phase = night.eventType === "playoff" ? "P" : "W"
    return [
        `BSD${TEMPLATE_VERSION}`,
        night.seasonCode,
        `${phase}${night.ordinal}`,
        night.date,
        court === null ? "TBD" : String(court)
    ].join(":")
}

// --- start-time guidance --------------------------------------------------

/** Grace after the scheduled start before a first match must be under way. */
export const FIRST_MATCH_GRACE_MINUTES = 10
/** Turnaround between back-to-back matches on the same court. */
export const TURNAROUND_MINUTES = 6

/** "19:00:00" + 10 -> "7:10pm", matching the wording on the old sheet. */
function shiftedClockLabel(time: string, addMinutes: number): string {
    const [hours, minutes] = time.split(":").map(Number)
    const total = (hours * 60 + minutes + addMinutes + 1440) % 1440
    const h24 = Math.floor(total / 60)
    const m = total % 60
    const period = h24 >= 12 ? "pm" : "am"
    const h12 = h24 % 12 || 12
    return `${h12}:${String(m).padStart(2, "0")}${period}`
}

/**
 * The highlighted note on a match block.
 *
 * A court's first match is pinned to the clock. So is the first match of a
 * *new division* on the same court, which is what playoff week 2 looks like:
 * one court hosts two divisions in separate time blocks, and the later block
 * does not follow on from the earlier one.
 */
export function startNote(
    match: { time: string | null; divisionName: string },
    previous: { divisionName: string } | null
): string | null {
    const startsNewBlock =
        previous === null || previous.divisionName !== match.divisionName

    if (!startsNewBlock) {
        return `Start ${TURNAROUND_MINUTES} mins after previous match ends`
    }
    if (!match.time) return null
    return `Start no later than ${shiftedClockLabel(match.time, FIRST_MATCH_GRACE_MINUTES)}`
}
