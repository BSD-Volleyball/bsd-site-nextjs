// Works out which season and division an archived page belongs to.
//
// This is the highest-risk step in the whole backfill: the old site was
// overwritten in place each season, so a page's identity is the ONLY thing
// telling us which of 69 seasons its results belong to. Getting it wrong files
// real results under the wrong season, silently.
//
// The <title> tag cannot be trusted. Pages were copied forward between seasons
// without updating it -- a real snapshot has:
//     <title>Spring 1999 BB Division Rosters</title>   <- stale, wrong season AND division
//     <h1>Fall 2001 B Division Rosters</h1>            <- correct
// so we always prefer the in-body heading, and treat a title/heading conflict
// as a signal that the title is stale rather than as ambiguity.

import type { PageEra, PageIdentity, PageKind } from "./types"

// Division codes that actually appear in the archived filenames. Anything else
// is not a results page (e.g. "player_experience.html" starts with "play").
const KNOWN_DIVISION_CODES = new Set([
    "a",
    "aa",
    "b",
    "bb",
    "bbb",
    "ab",
    "aba",
    "abb",
    "c"
])

const SEASON_NAMES = "Spring|Summer|Fall|Winter"

// "Fall 2001 B Division Rosters", "Spring 2016 A Division Standings"
const SEASON_FIRST = new RegExp(
    `\\b(${SEASON_NAMES})\\s+(\\d{4})\\s+([A-Za-z]+)\\s+Division\\b`,
    "i"
)

// "A Division - Fall 2001" (the pre-2012 heading style)
const DIVISION_FIRST = new RegExp(
    `\\b([A-Za-z]+)\\s+Division\\s*[-–—]\\s*(${SEASON_NAMES})\\s+(\\d{4})\\b`,
    "i"
)

export function normalizeDivisionName(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
}

function stripTags(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim()
}

/** Page kind and division as implied by the archived filename. */
export function parseFilename(
    fileName: string
): { kind: PageKind; divisionCode: string } | null {
    const base = fileName.toLowerCase().split("/").pop() ?? ""
    const match = base.match(
        /^(stand|play|roster)([a-z]+?)(_\d+t)?(?:_[a-z0-9]+)?\.html$/
    )
    if (!match) {
        return null
    }

    const divisionCode = match[2]
    if (!KNOWN_DIVISION_CODES.has(divisionCode)) {
        return null
    }

    const kind: PageKind =
        match[1] === "stand"
            ? "standings"
            : match[1] === "play"
              ? "playoff"
              : "roster"

    return { kind, divisionCode }
}

/**
 * Pick which parser a page needs. See PageEra for the four generations.
 *
 * Order matters. The JS markers are checked first because a JS-driven page can
 * still contain a <pre> block (the playoff ASCII bracket survived every
 * rewrite). Among the non-JS pages, a literal "Scores:" label is what
 * distinguishes the <=2007 static layout from the 2008-2012 stacked tables,
 * which put scores in an unlabelled column instead.
 */
export function detectEra(html: string): PageEra {
    if (/var\s+teamlist\b/i.test(html)) {
        return "js-teamlist"
    }
    if (/var\s+teams\b/i.test(html)) {
        return "js-teams"
    }
    if (/var\s+playdates\b/i.test(html)) {
        return "js-playdates"
    }
    if (/Scores?:/i.test(html)) {
        return "static"
    }
    // A Winner/Loser header is the signature of the <br>-stacked tables. Roster
    // pages have neither that nor any JS, which is what "plain" captures --
    // they were never rewritten, so one parser handles every era.
    if (/>\s*Winner\b/i.test(html) || /<th[^>]*>\s*Winner/i.test(html)) {
        return "stacked"
    }
    return "plain"
}

function matchSeasonText(text: string) {
    const seasonFirst = text.match(SEASON_FIRST)
    if (seasonFirst) {
        return {
            seasonName: seasonFirst[1].toLowerCase(),
            seasonYear: Number.parseInt(seasonFirst[2], 10),
            divisionCode: normalizeDivisionName(seasonFirst[3])
        }
    }

    const divisionFirst = text.match(DIVISION_FIRST)
    if (divisionFirst) {
        return {
            seasonName: divisionFirst[2].toLowerCase(),
            seasonYear: Number.parseInt(divisionFirst[3], 10),
            divisionCode: normalizeDivisionName(divisionFirst[1])
        }
    }

    return null
}

export function extractTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    return match ? stripTags(match[1]) : null
}

export function extractHeadings(html: string): string[] {
    return [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
        .map((m) => stripTags(m[1]))
        .filter((h) => h.length > 0)
}

/**
 * Identify a page, preferring the in-body heading over <title>.
 *
 * `fileName` is used as a tiebreaker: when the title names a different
 * division than the filename, the title is stale and is discarded outright.
 */
export function identifyPage(
    html: string,
    fileName: string
): PageIdentity | null {
    const fromFile = parseFilename(fileName)
    const title = extractTitle(html)
    const titleParsed = title ? matchSeasonText(title) : null

    for (const heading of extractHeadings(html)) {
        const parsed = matchSeasonText(heading)
        if (!parsed) {
            continue
        }

        const titleConflict =
            titleParsed !== null &&
            (titleParsed.seasonName !== parsed.seasonName ||
                titleParsed.seasonYear !== parsed.seasonYear ||
                titleParsed.divisionCode !== parsed.divisionCode)

        return { ...parsed, source: "heading", titleConflict }
    }

    // No usable heading. Fall back to the title only when its division agrees
    // with the filename -- that agreement is what distinguishes a current title
    // from one left over from a previous season.
    if (titleParsed) {
        const agrees =
            fromFile === null ||
            fromFile.divisionCode === titleParsed.divisionCode
        if (agrees) {
            return { ...titleParsed, source: "title", titleConflict: false }
        }
    }

    return null
}
