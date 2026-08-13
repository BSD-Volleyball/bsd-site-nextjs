// Parses the JS-driven playoff pages (2016-2024).
//
// Same inline-JavaScript shape as the JS standings pages, plus the bracket
// structure the older pages only expressed as ASCII art:
//
//     var seeds = [6,4,1,3,5,2];      // team numbers, in seed order
//     // Matches - Playoff Week 1
//     match.num   = 2;
//     match.teams = ["S1","W1"];      // seed 1 vs winner of match 1
//     match.work  = "L1";             // loser of match 1 works the match
//     match.games[0].scores = [25,20];
//
// The S#/W#/L# tokens are exactly the grammar playoff_matches_meta already
// uses for home_source / away_source / work_source, so this maps onto the
// existing schema without translation.
//
// Neither side is ever named here -- the page names the SLOT and the browser
// resolves it -- so the importer has to resolve refs itself, working forward
// from the seeds.

import {
    parsePlaydates,
    resolvePlaydate,
    stripBlockComments,
    stripLineComments
} from "./parse-js-era"
import { identifyPage } from "./identify"
import { parseRef } from "./parse-playoff-table"
import { parseTeams } from "./parse-js-era"
import type { JsPlayoffMatch, ParsedJsPlayoffPage, SetScore } from "./types"

const WEEK_BLOCK =
    /\/\/\s*Matches\s*-\s*(?:Playoff\s*)?Week\s*(\d+)[^\n]*([\s\S]*?)(?=\/\/\s*Matches\s*-\s*(?:Playoff\s*)?Week\s*\d+|$)/g
const MATCH_BLOCK =
    /match\s*=\s*date\.matches\[(\d+)\]\s*;([\s\S]*?)setWins\(match\)/g

/**
 * `var seeds = [6,4,1,3,5,2]` -> Map(seed position -> team number).
 *
 * The array is ambiguous on its own -- it could equally mean "team i holds seed
 * seeds[i]" -- and the site's own rendering JS is not in the archive. Settled
 * empirically against the champions table across all 128 JS-era playoff slices:
 * reading it as seed -> team number reproduces 93 recorded champions, the
 * inverse reading only 46.
 */
export function parseSeeds(script: string): Map<number, number> {
    const seeding = new Map<number, number>()
    const match = script.match(/var\s+seeds\s*=\s*\[([^\]]*)\]/i)
    if (!match) {
        return seeding
    }

    const numbers = [...match[1].matchAll(/\d+/g)].map((m) =>
        Number.parseInt(m[0], 10)
    )
    numbers.forEach((teamNumber, index) => {
        seeding.set(index + 1, teamNumber)
    })
    return seeding
}

function countGames(sets: SetScore[]): { home: number; away: number } {
    let home = 0
    let away = 0
    for (const set of sets) {
        if (set.home > set.away) {
            home++
        } else if (set.away > set.home) {
            away++
        }
    }
    return { home, away }
}

export function parseJsPlayoffMatches(
    rawScript: string,
    season: { seasonName: string; seasonYear: number }
): JsPlayoffMatch[] {
    const script = stripBlockComments(rawScript)
    const playdates = parsePlaydates(script)
    const defaultCourt = script.match(
        /dates\[d\]\.matches\[m\]\.court\s*=\s*(\d+)/
    )
    const matches: JsPlayoffMatch[] = []

    WEEK_BLOCK.lastIndex = 0
    for (const weekBlock of script.matchAll(WEEK_BLOCK)) {
        const week = Number.parseInt(weekBlock[1], 10)
        // Drops the commented-out "if necessary" final and any commented-out
        // set. Safe here and only here: the week markers are already consumed.
        const body = stripLineComments(weekBlock[2])
        if (Number.isNaN(week)) {
            continue
        }

        const dateIndex = body.match(/date\s*=\s*dates\[(\d+)\]/)
        const playdate =
            dateIndex !== null
                ? playdates[Number.parseInt(dateIndex[1], 10)]
                : undefined

        MATCH_BLOCK.lastIndex = 0
        for (const matchBlock of body.matchAll(MATCH_BLOCK)) {
            const matchBody = matchBlock[2]

            const teamsMatch = matchBody.match(
                /match\.teams\s*=\s*\[\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\]/
            )
            if (!teamsMatch) {
                continue
            }

            const sets: SetScore[] = []
            for (let game = 0; game < 3; game++) {
                const setMatch = matchBody.match(
                    new RegExp(
                        `match\\.games\\[${game}\\]\\.scores\\s*=\\s*\\[\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\]`
                    )
                )
                if (setMatch) {
                    sets.push({
                        home: Number.parseInt(setMatch[1], 10),
                        away: Number.parseInt(setMatch[2], 10)
                    })
                }
            }

            const numMatch = matchBody.match(/match\.num\s*=\s*(\d+)/)
            const time = matchBody.match(/match\.time\s*=\s*"([^"]*)"/)
            const work = matchBody.match(/match\.work\s*=\s*"([^"]*)"/)
            const courtOverride = matchBody.match(/match\.court\s*=\s*(\d+)/)
            const games = countGames(sets)

            matches.push({
                // Pages that omit match.num fall back to slot order within the
                // week, which is the order they are played in.
                matchNumber: numMatch
                    ? Number.parseInt(numMatch[1], 10)
                    : matches.length + 1,
                week,
                dateIso: playdate
                    ? resolvePlaydate(
                          playdate,
                          season.seasonName,
                          season.seasonYear
                      )
                    : null,
                time: time ? time[1].trim() : null,
                court: courtOverride
                    ? Number.parseInt(courtOverride[1], 10)
                    : defaultCourt
                      ? Number.parseInt(defaultCourt[1], 10)
                      : null,
                homeRef: parseRef(teamsMatch[1]),
                awayRef: parseRef(teamsMatch[2]),
                workRef: work ? parseRef(work[1]) : null,
                sets,
                homeGames: games.home,
                awayGames: games.away
            })
        }
    }

    return matches.sort((a, b) => a.matchNumber - b.matchNumber)
}

export function parseJsPlayoffPage(
    html: string,
    fileName: string,
    season: { seasonName: string; seasonYear: number }
): ParsedJsPlayoffPage {
    const script = stripBlockComments(html)

    return {
        identity: identifyPage(html, fileName),
        teams: parseTeams(script),
        seeding: parseSeeds(script),
        matches: parseJsPlayoffMatches(html, season)
    }
}
