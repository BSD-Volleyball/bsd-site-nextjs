// Parses the JS-driven standings pages (2013-2024).
//
// These pages ship their data as inline JavaScript and render it client-side
// via an external standings.js (which we do not have, and do not need -- the
// data is all inline). Two variants exist and differ only in the array name:
//
//   2013-2021   teams[0]    = {num:1, name:"Toohey",   wins:0, losses:0}
//   2022-2024   teamlist[1] = {num:1, wins:0, losses:0, name:"Yang"}
//
// Note the array INDEX differs (0-based vs 1-based) but both carry an explicit
// `num:` field, so the team number is read from `num:` rather than the index.
// scripts/archive/import-old-match-results.ts uses the index, which is correct
// for `teamlist` and would be off by one for `teams`.
//
// Everything else is shared: `var playdates`, "// Matches - Week N" blocks,
// `date = dates[i]`, `match.time`, `match.teams`, `match.games[g].scores`, and
// an optional `match.court` override.
//
// Unlike the older static pages, there is NO published W/L table here -- the
// wins/losses fields are all zero and computed in the browser. So the
// standings-reconciliation oracle is unavailable for these seasons; they are
// verified against the champions table instead.

import { identifyPage } from "./identify"
import type { ParsedMatch, PageIdentity, SetScore } from "./types"

export interface ParsedJsPage {
    identity: PageIdentity | null
    teams: Map<number, string>
    matches: ParsedMatch[]
}

/**
 * Remove /* ... *\/ block comments.
 *
 * This is load-bearing, not cosmetic. Pages were built by copying the previous
 * season's file and commenting out the parts that no longer applied, so the
 * raw text contains entire commented-out weeks of matches -- with real-looking
 * scores -- from a DIFFERENT season. Fall 2013 AA declares 4 teams yet its
 * text contains matches for teams 5 and 6, all inside a block comment.
 *
 * Line comments are deliberately left alone: "// Matches - Week N" is the
 * marker the week parser keys on.
 */
export function stripBlockComments(script: string): string {
    return script.replace(/\/\*[\s\S]*?\*\//g, "")
}

const TEAM_ENTRY = /(?:teamlist|teams)\s*\[\s*\d+\s*\]\s*=\s*\{([^}]*)\}/g
const WEEK_BLOCK =
    /\/\/\s*Matches\s*-\s*Week\s*(\d+)\s*([\s\S]*?)(?=\/\/\s*Matches\s*-\s*Week\s*\d+|$)/g
const MATCH_BLOCK =
    /match\s*=\s*date\.matches\[(\d+)\]\s*;([\s\S]*?)setWins\(match\)/g

/** teams[0] = {num:1, name:"Toohey", ...} -> Map(1 => "Toohey") */
export function parseTeams(script: string): Map<number, string> {
    const teams = new Map<number, string>()

    TEAM_ENTRY.lastIndex = 0
    for (const entry of script.matchAll(TEAM_ENTRY)) {
        const body = entry[1]
        const num = body.match(/\bnum\s*:\s*(\d+)/)
        const name = body.match(/\bname\s*:\s*"([^"]*)"/)
        if (!num || !name) {
            continue
        }
        const teamNumber = Number.parseInt(num[1], 10)
        const captainSurname = name[1].trim()
        if (!Number.isNaN(teamNumber) && captainSurname) {
            teams.set(teamNumber, captainSurname)
        }
    }

    return teams
}

export function parsePlaydates(script: string): string[] {
    const match = script.match(/var\s+playdates\s*=\s*\[([^\]]*)\]/i)
    if (!match) {
        return []
    }
    return [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1])
}

/** The court every match uses unless it carries its own `match.court`. */
export function parseDefaultCourt(script: string): number | null {
    const match = script.match(/dates\[d\]\.matches\[m\]\.court\s*=\s*(\d+)/)
    return match ? Number.parseInt(match[1], 10) : null
}

/**
 * "09/08" plus the season -> ISO. A fall season that runs into the new year
 * (a January play date on a Fall page) belongs to the following calendar year.
 */
export function resolvePlaydate(
    playdate: string,
    seasonName: string,
    seasonYear: number
): string | null {
    const match = playdate.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
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

export function parseJsMatches(
    rawScript: string,
    options: {
        seasonName: string
        seasonYear: number
        teams: Map<number, string>
    }
): ParsedMatch[] {
    const script = stripBlockComments(rawScript)
    const playdates = parsePlaydates(script)
    const defaultCourt = parseDefaultCourt(script)
    const matches: ParsedMatch[] = []

    WEEK_BLOCK.lastIndex = 0
    for (const weekBlock of script.matchAll(WEEK_BLOCK)) {
        const week = Number.parseInt(weekBlock[1], 10)
        const body = weekBlock[2]
        if (Number.isNaN(week)) {
            continue
        }

        // A standings page can carry playoff weeks too, flagged inline.
        const isPlayoff = /date\.playoffs\s*=\s*true/i.test(body)
        const dateIndex = body.match(/date\s*=\s*dates\[(\d+)\]/)
        const playdate =
            dateIndex !== null
                ? playdates[Number.parseInt(dateIndex[1], 10)]
                : undefined

        MATCH_BLOCK.lastIndex = 0
        for (const matchBlock of body.matchAll(MATCH_BLOCK)) {
            const matchBody = matchBlock[2]

            const teamsMatch = matchBody.match(
                /match\.teams\s*=\s*\[(\d+)\s*,\s*(\d+)\]/
            )
            if (!teamsMatch) {
                // No pairing means a bye or an unplayed slot.
                continue
            }

            const sets: SetScore[] = []
            for (let game = 0; game < 3; game++) {
                const setMatch = matchBody.match(
                    new RegExp(
                        `match\\.games\\[${game}\\]\\.scores\\s*=\\s*\\[\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\]`
                    )
                )
                if (!setMatch) {
                    // A season can end mid-page, or a match can be unplayed.
                    // Missing sets are dropped rather than treated as fatal.
                    continue
                }
                sets.push({
                    home: Number.parseInt(setMatch[1], 10),
                    away: Number.parseInt(setMatch[2], 10)
                })
            }

            if (sets.length === 0) {
                continue
            }

            const homeNumber = Number.parseInt(teamsMatch[1], 10)
            const awayNumber = Number.parseInt(teamsMatch[2], 10)
            const time = matchBody.match(/match\.time\s*=\s*"([^"]*)"/)
            const courtOverride = matchBody.match(/match\.court\s*=\s*(\d+)/)
            const games = countGames(sets)

            matches.push({
                week,
                dateLabel: playdate ?? "",
                dateIso: playdate
                    ? resolvePlaydate(
                          playdate,
                          options.seasonName,
                          options.seasonYear
                      )
                    : null,
                time: time ? time[1].trim() : null,
                court: courtOverride
                    ? Number.parseInt(courtOverride[1], 10)
                    : defaultCourt,
                homeNumber,
                awayNumber,
                homeSurname: options.teams.get(homeNumber) ?? "",
                awaySurname: options.teams.get(awayNumber) ?? "",
                homeGames: games.home,
                awayGames: games.away,
                sets,
                note: null,
                isPlayoff
            })
        }
    }

    return matches
}

export function parseJsStandingsPage(
    html: string,
    fileName: string,
    season: { seasonName: string; seasonYear: number }
): ParsedJsPage {
    const identity = identifyPage(html, fileName)
    const teams = parseTeams(stripBlockComments(html))

    return {
        identity,
        teams,
        matches: parseJsMatches(html, { ...season, teams })
    }
}
