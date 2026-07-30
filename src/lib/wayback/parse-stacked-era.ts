// Parses the 2008-2012 standings pages.
//
// This era has no JavaScript and no "Scores:" labels -- it is three plain
// tables, two of which are <br>-stacked (see html-table.ts):
//
//   1. Standings   Team | Captain | Wins | Losses
//   2. Schedule    Date | Time | Court | Match      ("3 vs 4")
//   3. Results     Winner | games | Loser | games | Scores
//
// The results table has NO date column. The join that works is by ROW: one row
// of each table is one play date, and the two tables list dates in the same
// chronological order, so results row i belongs to schedule row i. That gives
// both the week number and the date. Within a row, a result is matched to its
// slot by team pairing to recover time and court.
//
// Matching purely by pairing (ignoring rows) is wrong: schedules are sometimes
// incomplete -- Fall 2012 BBB has 7 teams and only 16 of its 21 pairings in the
// grid -- and pairings repeat once playoffs start.
//
// This era was invisible in the Wayback corpus: no archived snapshot of it was
// ever identified. It only surfaced from the local season-results cache.

import {
    cellsOf,
    clean,
    resolveSurname,
    rowsOf,
    stack,
    tablesOf,
    textCellsOf,
    toInt
} from "./html-table"
import { identifyPage } from "./identify"
import type {
    ParsedMatch,
    ParsedStandingsPage,
    ScheduleSlot,
    SetScore,
    StandingRow
} from "./types"

interface ScheduleRow {
    dateIso: string | null
    slots: {
        time: string | null
        court: number | null
        homeNumber: number
        awayNumber: number
    }[]
}

interface ResultRecord {
    winnerSurname: string
    winnerGames: number
    loserSurname: string
    loserGames: number
    sets: SetScore[]
    note: string | null
}

function headerOf(tableHtml: string): string[] {
    const rows = rowsOf(tableHtml)
    return rows.length > 0
        ? textCellsOf(rows[0]).map((c) => c.toLowerCase())
        : []
}

function resolveDate(
    text: string,
    seasonName: string,
    seasonYear: number
): string | null {
    const match = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
    if (!match) {
        return null
    }
    const month = Number.parseInt(match[1], 10)
    const day = Number.parseInt(match[2], 10)
    let year = seasonYear
    if (match[3]) {
        const raw = Number.parseInt(match[3], 10)
        year = match[3].length === 2 ? 2000 + raw : raw
    } else if (seasonName === "fall" && month <= 6) {
        year = seasonYear + 1
    }
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// -------------------------------------------------------------- standings

export function parseStackedStandings(html: string): StandingRow[] {
    for (const table of tablesOf(html)) {
        const header = headerOf(table)
        const teamAt = header.findIndex((c) => c.startsWith("team"))
        const captainAt = header.findIndex((c) => c.startsWith("captain"))
        const winsAt = header.findIndex((c) => c.startsWith("win"))
        const lossesAt = header.findIndex((c) => c.startsWith("loss"))
        if (
            teamAt === -1 ||
            captainAt === -1 ||
            winsAt === -1 ||
            lossesAt === -1
        ) {
            continue
        }

        const standings: StandingRow[] = []
        for (const row of rowsOf(table).slice(1)) {
            const cells = textCellsOf(row)
            const teamNumber = toInt(cells[teamAt] ?? "")
            const wins = toInt(cells[winsAt] ?? "")
            const losses = toInt(cells[lossesAt] ?? "")
            // Pages carry footnotes such as "* 2nd place tie-breaker: ..." as
            // extra rows; those have no team number and are skipped.
            const captainSurname = (cells[captainAt] ?? "")
                .replace(/[*]/g, "")
                .trim()

            if (
                teamNumber === null ||
                wins === null ||
                losses === null ||
                !captainSurname
            ) {
                continue
            }
            standings.push({
                teamNumber,
                captainSurname,
                wins,
                losses,
                gamesBehind: null
            })
        }

        if (standings.length > 0) {
            return standings
        }
    }
    return []
}

// --------------------------------------------------------------- schedule

/** One entry per play date that actually has matches, in chronological order. */
export function parseScheduleRows(
    html: string,
    seasonName: string,
    seasonYear: number
): ScheduleRow[] {
    for (const table of tablesOf(html)) {
        const header = headerOf(table)
        const dateAt = header.findIndex((c) => c.startsWith("date"))
        const matchAt = header.findIndex((c) => c.startsWith("match"))
        if (dateAt === -1 || matchAt === -1) {
            continue
        }
        const timeAt = header.findIndex((c) => c.startsWith("time"))
        const courtAt = header.findIndex((c) => c.startsWith("court"))

        const scheduleRows: ScheduleRow[] = []
        for (const row of rowsOf(table).slice(1)) {
            const columns = cellsOf(row).map(stack)
            const pairings = (columns[matchAt] ?? []).map((cell) =>
                cell.match(/(\d+)\s*vs\.?\s*(\d+)/i)
            )
            if (!pairings.some(Boolean)) {
                // "Playoffs" or "*** No matches ***" -- not a play date.
                continue
            }

            const times = columns[timeAt] ?? []
            const courts = columns[courtAt] ?? []
            const pick = (list: string[], index: number) =>
                list.length === 1 ? list[0] : (list[index] ?? "")

            const slots: ScheduleRow["slots"] = []
            pairings.forEach((pairing, index) => {
                if (!pairing) {
                    return
                }
                const time = pick(times, index)
                slots.push({
                    time: /\d/.test(time) ? time.trim() : null,
                    court: toInt(pick(courts, index)),
                    homeNumber: Number.parseInt(pairing[1], 10),
                    awayNumber: Number.parseInt(pairing[2], 10)
                })
            })

            scheduleRows.push({
                dateIso: resolveDate(
                    (columns[dateAt] ?? [])[0] ?? "",
                    seasonName,
                    seasonYear
                ),
                slots
            })
        }

        if (scheduleRows.length > 0) {
            return scheduleRows
        }
    }
    return []
}

// ---------------------------------------------------------------- results

/** One entry per results row (i.e. per play date), in chronological order. */
export function parseResultRows(html: string): ResultRecord[][] {
    for (const table of tablesOf(html)) {
        const header = headerOf(table)
        const winnerAt = header.findIndex((c) => c.startsWith("winner"))
        const loserAt = header.findIndex((c) => c.startsWith("loser"))
        const scoresAt = header.findIndex((c) => c.startsWith("score"))
        if (winnerAt === -1 || loserAt === -1) {
            continue
        }

        const resultRows: ResultRecord[][] = []
        for (const row of rowsOf(table).slice(1)) {
            const columns = cellsOf(row).map(stack)
            const winners = columns[winnerAt] ?? []
            const losers = columns[loserAt] ?? []
            const scores = scoresAt === -1 ? [] : (columns[scoresAt] ?? [])
            // The games-won columns are the unlabelled ones immediately after
            // each name column.
            const winnerGames = columns[winnerAt + 1] ?? []
            const loserGames = columns[loserAt + 1] ?? []

            const records: ResultRecord[] = []
            for (let i = 0; i < Math.max(winners.length, losers.length); i++) {
                const winnerSurname = clean(winners[i] ?? "")
                const loserSurname = clean(losers[i] ?? "")
                if (!winnerSurname || !loserSurname) {
                    continue
                }

                const scoreText = scores[i] ?? ""
                const sets = [
                    ...scoreText.matchAll(/(\d{1,2})\s*-\s*(\d{1,2})/g)
                ].map((m) => ({
                    home: Number.parseInt(m[1], 10),
                    away: Number.parseInt(m[2], 10)
                }))

                // Some weeks were never scored in detail -- the Scores cell
                // literally reads "not reported" -- but the games-won columns
                // are still filled in and the published standings count those
                // games. Games won is therefore authoritative; the set scores
                // are optional detail.
                records.push({
                    winnerSurname,
                    winnerGames:
                        toInt(winnerGames[i] ?? "") ??
                        sets.filter((s) => s.home > s.away).length,
                    loserSurname,
                    loserGames:
                        toInt(loserGames[i] ?? "") ??
                        sets.filter((s) => s.away > s.home).length,
                    sets,
                    note:
                        sets.length === 0 && scoreText ? clean(scoreText) : null
                })
            }

            if (records.length > 0) {
                resultRows.push(records)
            }
        }

        if (resultRows.length > 0) {
            return resultRows
        }
    }
    return []
}

// ------------------------------------------------------------------- join

export function parseStackedStandingsPage(
    html: string,
    fileName: string,
    season: { seasonName: string; seasonYear: number }
): ParsedStandingsPage {
    const identity = identifyPage(html, fileName)
    const standings = parseStackedStandings(html)
    const scheduleRows = parseScheduleRows(
        html,
        season.seasonName,
        season.seasonYear
    )
    const resultRows = parseResultRows(html)

    const numberBySurname = new Map<string, number>()
    const ambiguous = new Set<string>()
    for (const row of standings) {
        const key = row.captainSurname.toLowerCase().replace(/[^a-z]/g, "")
        if (numberBySurname.has(key)) {
            ambiguous.add(key)
        } else {
            numberBySurname.set(key, row.teamNumber)
        }
    }
    for (const key of ambiguous) {
        numberBySurname.delete(key)
    }

    const matches: ParsedMatch[] = []

    resultRows.forEach((records, rowIndex) => {
        const scheduleRow = scheduleRows[rowIndex]
        // Results rows past the end of the schedule are playoff dates appended
        // after the regular season; the published standings exclude them.
        const isPlayoff = scheduleRow === undefined
        const available = scheduleRow ? [...scheduleRow.slots] : []

        for (const record of records) {
            const homeNumber = resolveSurname(
                record.winnerSurname,
                numberBySurname
            )
            const awayNumber = resolveSurname(
                record.loserSurname,
                numberBySurname
            )

            let slot: ScheduleRow["slots"][number] | undefined
            if (homeNumber !== null && awayNumber !== null) {
                const at = available.findIndex(
                    (candidate) =>
                        (candidate.homeNumber === homeNumber &&
                            candidate.awayNumber === awayNumber) ||
                        (candidate.homeNumber === awayNumber &&
                            candidate.awayNumber === homeNumber)
                )
                if (at !== -1) {
                    slot = available[at]
                    available.splice(at, 1)
                }
            }

            matches.push({
                week: rowIndex + 1,
                dateLabel: scheduleRow?.dateIso ?? "",
                dateIso: scheduleRow?.dateIso ?? null,
                time: slot?.time ?? null,
                court: slot?.court ?? null,
                homeNumber,
                awayNumber,
                homeSurname: record.winnerSurname,
                awaySurname: record.loserSurname,
                homeGames: record.winnerGames,
                awayGames: record.loserGames,
                sets: record.sets,
                note: record.note,
                isPlayoff
            })
        }
    })

    const schedule: ScheduleSlot[] = scheduleRows.flatMap((row) =>
        row.slots.map((slot) => ({
            dateIso: row.dateIso ?? "",
            time: slot.time,
            homeNumber: slot.homeNumber,
            awayNumber: slot.awayNumber,
            note: slot.court === null ? null : `court:${slot.court}`
        }))
    )

    return { identity, standings, schedule, matches }
}
