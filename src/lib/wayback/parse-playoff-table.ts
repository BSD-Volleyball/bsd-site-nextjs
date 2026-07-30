// Parses the archived playoff pages.
//
// These pages carry an ASCII-art bracket AND a results table. The table is far
// richer -- it has scores, dates, courts and the work-team assignment -- so it
// is the primary source; the bracket art is only a fallback for structure.
//
// The table has an unusual shape: it is <br>-STACKED. One <tr> covers a whole
// play date, and every <td> in it holds a parallel list of values, one per
// match:
//
//     <td>1<br>2<br>3</td>            <- match numbers
//     <td>Stump<br>Lu<br>Finver</td>  <- winners
//     <td>15-4, 15-7<br>...</td>      <- scores
//
// so a row is transposed into matches by zipping the columns index-wise.
//
// A side is printed as a W#/L#/S# token until the match is played, after which
// the site substitutes the captain's surname. Both forms occur across
// snapshots -- a capture taken before the playoffs ran has tokens and empty
// scores -- so each side is parsed as "surname or reference", never assumed.

import { identifyPage } from "./identify"
import type {
    ParsedPlayoffPage,
    SeedRow,
    PlayoffMatch,
    PlayoffRef,
    SetScore
} from "./types"

const REF_TOKEN = /^([SWL])\s*(\d+)$/i

const POSITION_WORDS: Record<string, number> = {
    "1st": 1,
    "2nd": 2,
    "3rd": 3,
    "4th": 4,
    "5th": 5,
    "6th": 6,
    "7th": 7,
    "8th": 8,
    "9th": 9,
    "10th": 10
}

function clean(html: string): string {
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Split one table cell into its <br>-separated values.
 *
 * Trailing blanks are dropped: the archived markup habitually ends a cell with
 * "<br>\n</font>", which would otherwise inflate the row depth and invent an
 * extra empty match.
 */
function stack(cellHtml: string): string[] {
    const parts = cellHtml.split(/<br\s*\/?>/i).map(clean)
    while (parts.length > 0 && parts[parts.length - 1] === "") {
        parts.pop()
    }
    return parts
}

function cellsOf(rowHtml: string): string[] {
    return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
        (m) => m[1]
    )
}

function rawRows(tableHtml: string): string[] {
    return [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(
        (m) => m[1]
    )
}

function colspanOf(rowHtml: string, index: number): number {
    const opens = [...rowHtml.matchAll(/<t[dh]([^>]*)>/gi)]
    const attrs = opens[index]?.[1] ?? ""
    const match = attrs.match(/colspan\s*=\s*"?(\d+)"?/i)
    return match ? Number.parseInt(match[1], 10) : 1
}

export function parseRef(value: string): PlayoffRef | null {
    const match = value.trim().match(REF_TOKEN)
    if (!match) {
        return null
    }

    const kind =
        match[1].toUpperCase() === "S"
            ? "seed"
            : match[1].toUpperCase() === "W"
              ? "winner"
              : "loser"

    return {
        kind,
        value: Number.parseInt(match[2], 10),
        token: `${match[1].toUpperCase()}${match[2]}`
    }
}

function parseSide(value: string): {
    surname: string | null
    ref: PlayoffRef | null
} {
    const text = value.replace(/\*/g, "").trim()
    if (!text || /^(tbd|bye|-+)$/i.test(text)) {
        return { surname: null, ref: null }
    }

    const ref = parseRef(text)
    return ref ? { surname: null, ref } : { surname: text, ref: null }
}

function parseSets(value: string): SetScore[] {
    return [...value.matchAll(/(\d{1,2})\s*-\s*(\d{1,2})/g)].map((m) => ({
        home: Number.parseInt(m[1], 10),
        away: Number.parseInt(m[2], 10)
    }))
}

function parseNumber(value: string): number | null {
    const match = value.match(/\d+/)
    return match ? Number.parseInt(match[0], 10) : null
}

function parseDate(value: string, seasonYear: number | null): string | null {
    // Printed as "10/26" or "12/07" -- the year is implied by the season, so
    // without a known season we must NOT invent one.
    const match = value.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
    if (!match) {
        return null
    }
    if (seasonYear === null && !match[3]) {
        return null
    }

    const month = Number.parseInt(match[1], 10)
    const day = Number.parseInt(match[2], 10)
    let year = seasonYear as number
    if (match[3]) {
        const raw = Number.parseInt(match[3], 10)
        year =
            match[3].length === 2 ? (raw > 50 ? 1900 + raw : 2000 + raw) : raw
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * Build the effective column list from the table's header rows, expanding the
 * COLSPAN="2" "Match" header into its "Winner"/"Loser" sub-columns.
 */
function headerColumns(
    rows: string[]
): { labels: string[]; bodyStart: number } | null {
    if (rows.length === 0) {
        return null
    }

    const first = cellsOf(rows[0])
    if (first.length === 0) {
        return null
    }

    const second = rows.length > 1 ? cellsOf(rows[1]).map(clean) : []
    const labels: string[] = []
    let subIndex = 0
    let usedSecondRow = false

    first.forEach((cell, index) => {
        const span = colspanOf(rows[0], index)
        if (span > 1 && second.length > 0) {
            for (let s = 0; s < span; s++) {
                labels.push((second[subIndex] ?? "").toLowerCase())
                subIndex++
            }
            usedSecondRow = true
        } else {
            labels.push(clean(cell).toLowerCase())
        }
    })

    if (!labels.some((l) => l.startsWith("match"))) {
        return null
    }

    return { labels, bodyStart: usedSecondRow ? 2 : 1 }
}

export function parsePlayoffMatches(
    html: string,
    seasonYear: number | null
): PlayoffMatch[] {
    for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
        const rows = rawRows(table[1])
        const header = headerColumns(rows)
        if (!header) {
            continue
        }

        const at = (name: string) =>
            header.labels.findIndex((l) => l.startsWith(name))
        const matchAt = at("match")
        const scoresAt = at("score")

        // The two participant columns are labelled either "Winner"/"Loser" or,
        // in a later variant, just "Team"/"Team". The convention is the same
        // either way -- the first column is the winner and the scores are
        // written from its point of view -- but only the first form says so in
        // the header. Verified across every match on the Team/Team pages: the
        // first-listed side wins all 35 of them.
        let winnerAt = at("winner")
        let loserAt = at("loser")
        if (winnerAt === -1 || loserAt === -1) {
            const teamColumns = header.labels
                .map((label, index) => ({ label, index }))
                .filter((x) => x.label === "team")
            if (teamColumns.length === 2) {
                winnerAt = teamColumns[0].index
                loserAt = teamColumns[1].index
            }
        }

        if (matchAt === -1 || winnerAt === -1 || loserAt === -1) {
            continue
        }

        const dateAt = at("date")
        const timeAt = at("time")
        const courtAt = at("court")
        const workAt = at("work")

        const matches: PlayoffMatch[] = []

        for (const row of rows.slice(header.bodyStart)) {
            let columns = cellsOf(row).map(stack)

            // Some pages declare Winner and Loser as two header columns but
            // write the pairing into a single body cell -- "Quinn vs. Sechler",
            // or "W3 vs. W4" before the match is played. The body then has one
            // column fewer than the expanded header, so split that cell back
            // into two to line the row up again.
            if (columns.length === header.labels.length - 1 && winnerAt >= 0) {
                const combined = columns[winnerAt] ?? []
                const homeSide: string[] = []
                const awaySide: string[] = []
                for (const entry of combined) {
                    const parts = entry.split(/\s+vs\.?\s+/i)
                    homeSide.push(parts[0] ?? "")
                    awaySide.push(parts[1] ?? "")
                }
                columns = [
                    ...columns.slice(0, winnerAt),
                    homeSide,
                    awaySide,
                    ...columns.slice(winnerAt + 1)
                ]
            }

            if (columns.length < header.labels.length) {
                continue
            }

            // How many matches this row describes. Columns that carry a single
            // value (typically Date, which applies to the whole play date) are
            // not evidence of depth -- they get broadcast to every match below.
            const depth = Math.max(...columns.map((c) => c.length))
            const pick = (index: number, i: number) => {
                if (index === -1) {
                    return ""
                }
                const column = columns[index] ?? []
                if (column.length === 1) {
                    return column[0]
                }
                return column[i] ?? ""
            }

            for (let i = 0; i < depth; i++) {
                const rawMatchNumber = pick(matchAt, i)
                const matchNumber = parseNumber(rawMatchNumber)
                if (matchNumber === null) {
                    continue
                }

                const winner = parseSide(pick(winnerAt, i))
                const loser = parseSide(pick(loserAt, i))
                const work = parseSide(pick(workAt, i))

                matches.push({
                    matchNumber,
                    // "15*" means the match is only played if necessary.
                    ifNecessary: rawMatchNumber.includes("*"),
                    dateIso: parseDate(pick(dateAt, i), seasonYear),
                    time: /\d/.test(pick(timeAt, i))
                        ? pick(timeAt, i).trim()
                        : null,
                    court: parseNumber(pick(courtAt, i)),
                    winnerSurname: winner.surname,
                    loserSurname: loser.surname,
                    winnerRef: winner.ref,
                    loserRef: loser.ref,
                    workSurname: work.surname,
                    workRef: work.ref,
                    sets: parseSets(pick(scoresAt, i))
                })
            }
        }

        if (matches.length > 0) {
            return matches.sort((a, b) => a.matchNumber - b.matchNumber)
        }
    }

    return []
}

/**
 * The "Position | Team" table beside the bracket.
 *
 * Despite sitting on the playoff page this is the REGULAR-SEASON order, i.e.
 * the playoff seeding -- see SeedRow. It feeds teams.rank, which is what
 * resolves "S1".."S6" bracket sources. The playoff outcome is verified
 * separately, by checking the final's winner against the champions table.
 */
export function parseSeeding(html: string): SeedRow[] {
    const text = html
        .replace(/<\/(td|th|tr|br|p|div)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")

    const seeding: SeedRow[] = []
    const seen = new Set<number>()

    for (const line of text.split(/\r?\n/)) {
        const match = line.match(
            /\b(\d{1,2}(?:st|nd|rd|th))\b\s+([A-Za-z][A-Za-z'./\- ]*)/
        )
        if (!match) {
            continue
        }

        const position = POSITION_WORDS[match[1].toLowerCase()]
        const captainSurname = match[2].replace(/\s+/g, " ").trim()

        if (!position || seen.has(position) || !captainSurname) {
            continue
        }
        // Guard against prose like "1st Round" being read as a placement.
        if (/^(round|place|position|match|game|seed)\b/i.test(captainSurname)) {
            continue
        }

        seen.add(position)
        seeding.push({ position, captainSurname })
    }

    return seeding.sort((a, b) => a.position - b.position)
}

/**
 * `seasonYear` overrides whatever the page says. Playoff pages are usually
 * headed just "A Division Playoff Bracket" with no season at all (64 of the
 * 212 archived snapshots), so the caller supplies the year it resolved from
 * the source directory or a sibling standings page. Without one, dates are
 * left null rather than being stamped with the wrong year.
 */
export function parsePlayoffPage(
    html: string,
    fileName: string,
    seasonYear?: number
): ParsedPlayoffPage {
    const identity = identifyPage(html, fileName)
    const year = seasonYear ?? identity?.seasonYear ?? null

    return {
        identity,
        matches: parsePlayoffMatches(html, year),
        seeding: parseSeeding(html)
    }
}
