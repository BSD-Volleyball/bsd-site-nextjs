// Parses the pre-2012 static-HTML standings pages.
//
// Each page holds three sections that have to be stitched together:
//
//   1. A standings table   -> team number <-> captain surname, plus W/L.
//   2. A <pre> schedule    -> date + time-slot grid of "1 vs 2" pairings.
//   3. Results blocks      -> "Week 7 - October 19" then rows of
//                             winner / games / loser / games / "Scores: ...".
//
// Only the standings table maps a captain surname back to a team NUMBER, and
// only the schedule knows what time a match was played, so the results are
// joined against both. Everything the join cannot recover stays null --
// matches.time and matches.court are nullable, so a partial row still imports.
//
// Orientation note: the results list the WINNER first. "home" throughout this
// module means first-listed, and set scores follow the same orientation.

import { buildSurnameIndex, resolveSurname } from "./html-table"
import { identifyPage } from "./identify"
import type {
    ParsedMatch,
    ParsedStandingsPage,
    ScheduleSlot,
    SetScore,
    StandingRow
} from "./types"

const MONTHS: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12
}

function cellText(html: string): string {
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim()
}

function rowsOf(tableHtml: string): string[][] {
    return [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
        [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((td) =>
            cellText(td[1])
        )
    )
}

function toInt(value: string): number | null {
    const match = value.match(/-?\d+/)
    return match ? Number.parseInt(match[0], 10) : null
}

// ---------------------------------------------------------------- standings

/**
 * The standings table is the first table whose header row mentions Wins.
 * Columns are: Team | Captain | Wins | Losses | [Games Behind].
 */
export function parseStandings(html: string): StandingRow[] {
    for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
        const rows = rowsOf(table[1])
        if (rows.length < 2) {
            continue
        }

        const header = rows[0].map((c) => c.toLowerCase())
        const winsAt = header.findIndex((c) => c.startsWith("win"))
        const lossesAt = header.findIndex((c) => c.startsWith("loss"))
        const teamAt = header.findIndex((c) => c.startsWith("team"))
        const captainAt = header.findIndex((c) => c.startsWith("captain"))
        const behindAt = header.findIndex((c) => c.includes("behind"))

        if (
            winsAt === -1 ||
            lossesAt === -1 ||
            teamAt === -1 ||
            captainAt === -1
        ) {
            continue
        }

        const standings: StandingRow[] = []
        for (const row of rows.slice(1)) {
            const teamNumber = toInt(row[teamAt] ?? "")
            const wins = toInt(row[winsAt] ?? "")
            const losses = toInt(row[lossesAt] ?? "")
            const captainSurname = (row[captainAt] ?? "").trim()

            if (teamNumber === null || wins === null || losses === null) {
                continue
            }
            if (!captainSurname) {
                continue
            }

            standings.push({
                teamNumber,
                captainSurname,
                wins,
                losses,
                // "---" for the division leader; only a real number counts.
                gamesBehind: behindAt === -1 ? null : toInt(row[behindAt] ?? "")
            })
        }

        if (standings.length > 0) {
            return standings
        }
    }

    return []
}

// ----------------------------------------------------------------- schedule

function twoDigitYearToFull(yy: number, seasonYear: number): number {
    // Pages only ever span the season's own year and its neighbours, so anchor
    // the century on the season rather than guessing from the value alone.
    const candidates = [1900 + yy, 2000 + yy, 2100 + yy]
    return candidates.reduce((best, year) =>
        Math.abs(year - seasonYear) < Math.abs(best - seasonYear) ? year : best
    )
}

/**
 * The schedule is a <pre> grid: a header line of time slots, then one line per
 * play date with a pairing under each slot.
 */
export function parseSchedule(
    html: string,
    seasonYear: number
): ScheduleSlot[] {
    const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
    if (!pre) {
        return []
    }

    const text = pre[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")

    const lines = text.split(/\r?\n/)
    const times = [...(lines[0]?.matchAll(/(\d{1,2}:\d{2})/g) ?? [])].map(
        (m) => m[1]
    )

    const slots: ScheduleSlot[] = []
    for (const line of lines.slice(1)) {
        const dateMatch = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
        if (!dateMatch) {
            continue
        }

        const month = Number.parseInt(dateMatch[1], 10)
        const day = Number.parseInt(dateMatch[2], 10)
        const rawYear = Number.parseInt(dateMatch[3], 10)
        const year =
            dateMatch[3].length === 2
                ? twoDigitYearToFull(rawYear, seasonYear)
                : rawYear
        const dateIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

        const noteMatch = line.match(/\(([^)]+)\)/)
        const pairings = [...line.matchAll(/(\d+)\s*vs\.?\s*(\d+)/gi)]

        pairings.forEach((pairing, index) => {
            slots.push({
                dateIso,
                time: times[index] ?? null,
                homeNumber: Number.parseInt(pairing[1], 10),
                awayNumber: Number.parseInt(pairing[2], 10),
                note: noteMatch ? noteMatch[1].trim() : null
            })
        })
    }

    return slots
}

// ------------------------------------------------------------------ results

export function parseSetScores(text: string): SetScore[] {
    const scores = text.match(/Scores?:\s*([^<]*)/i)
    if (!scores) {
        return []
    }

    return [...scores[1].matchAll(/(\d{1,2})\s*-\s*(\d{1,2})/g)].map((m) => ({
        home: Number.parseInt(m[1], 10),
        away: Number.parseInt(m[2], 10)
    }))
}

/**
 * Result blocks are headed "Week 7 - October 19" (older pages sometimes say
 * "Match 8 - October 9") and followed by a table of that week's results.
 */
export function parseResults(html: string, seasonYear: number): ParsedMatch[] {
    const headerRegex =
        /<b>\s*(?:Week|Match)\s*(\d+)\s*-\s*([A-Za-z]+\s+\d{1,2})\s*<\/b>/gi
    const headers = [...html.matchAll(headerRegex)]
    const matches: ParsedMatch[] = []

    for (let i = 0; i < headers.length; i++) {
        const header = headers[i]
        const week = Number.parseInt(header[1], 10)
        const dateLabel = header[2].replace(/\s+/g, " ").trim()

        const start = (header.index ?? 0) + header[0].length
        const end = headers[i + 1]?.index ?? html.length
        const block = html.slice(start, end)

        const table = block.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
        if (!table) {
            continue
        }

        const [monthName, dayText] = dateLabel.split(/\s+/)
        const month = MONTHS[monthName?.toLowerCase() ?? ""]
        const day = Number.parseInt(dayText ?? "", 10)
        const dateIso =
            month && !Number.isNaN(day)
                ? `${seasonYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                : null

        for (const row of rowsOf(table[1])) {
            // winner | games | loser | games | "Scores: ..."
            if (row.length < 4) {
                continue
            }

            const homeSurname = row[0]
            const homeGames = toInt(row[1] ?? "")
            const awaySurname = row[2]
            const awayGames = toInt(row[3] ?? "")
            const tail = row.slice(4).join(" ")

            if (
                !homeSurname ||
                !awaySurname ||
                homeGames === null ||
                awayGames === null
            ) {
                continue
            }

            matches.push({
                week,
                dateLabel,
                dateIso,
                time: null,
                court: null,
                homeNumber: null,
                awayNumber: null,
                homeSurname,
                awaySurname,
                homeGames,
                awayGames,
                sets: parseSetScores(tail),
                note: /forfeit/i.test(tail) ? "forfeit" : null,
                // Pre-2012 playoffs live on play*.html, never here.
                isPlayoff: false
            })
        }
    }

    return matches
}

// -------------------------------------------------------------------- join

function normalizeSurname(value: string): string {
    return value.toLowerCase().replace(/[^a-z]/g, "")
}

/**
 * Fill in team numbers from the standings table, and time/date from the
 * schedule grid. Anything unresolvable is left null rather than guessed.
 */
export function joinMatches(
    matches: ParsedMatch[],
    standings: StandingRow[],
    schedule: ScheduleSlot[]
): ParsedMatch[] {
    const numberBySurname = buildSurnameIndex(
        standings.map((row) => ({
            name: row.captainSurname,
            value: row.teamNumber
        }))
    )

    return matches.map((match) => {
        const homeNumber = resolveSurname(match.homeSurname, numberBySurname)
        const awayNumber = resolveSurname(match.awaySurname, numberBySurname)

        let dateIso = match.dateIso
        let time = match.time
        let note = match.note

        if (homeNumber !== null && awayNumber !== null) {
            const slot = schedule.find(
                (s) =>
                    (s.homeNumber === homeNumber &&
                        s.awayNumber === awayNumber) ||
                    (s.homeNumber === awayNumber && s.awayNumber === homeNumber)
            )
            if (slot) {
                // The schedule carries an explicit MM/DD/YY, so it beats the
                // month/day we inferred from the results header.
                dateIso = slot.dateIso
                time = slot.time
                note = note ?? slot.note
            }
        }

        return { ...match, homeNumber, awayNumber, dateIso, time, note }
    })
}

export function parseOldEraStandingsPage(
    html: string,
    fileName: string
): ParsedStandingsPage {
    const identity = identifyPage(html, fileName)
    const seasonYear = identity?.seasonYear ?? new Date().getFullYear()

    const standings = parseStandings(html)
    const schedule = parseSchedule(html, seasonYear)
    const matches = joinMatches(
        parseResults(html, seasonYear),
        standings,
        schedule
    )

    return { identity, standings, schedule, matches }
}
