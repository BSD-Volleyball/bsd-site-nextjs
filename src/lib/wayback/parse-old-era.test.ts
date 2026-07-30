import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
    joinMatches,
    parseOldEraStandingsPage,
    parseResults,
    parseSchedule,
    parseSetScores,
    parseStandings
} from "./parse-old-era"

// Real Wayback capture: web.archive.org/web/20010219115712/standb.html
// (Fall 2000, B division, 8 teams, 7 weeks)
const html = fs.readFileSync(
    path.join(__dirname, "__fixtures__", "standb-f00.html"),
    "utf-8"
)

const page = parseOldEraStandingsPage(html, "standb.html")

describe("parseOldEraStandingsPage", () => {
    it("identifies the season from the division-first heading", () => {
        expect(page.identity).toMatchObject({
            seasonName: "fall",
            seasonYear: 2000,
            divisionCode: "b",
            source: "heading"
        })
    })
})

describe("parseStandings", () => {
    it("reads every row of the standings table", () => {
        expect(page.standings).toHaveLength(8)
        expect(page.standings[0]).toEqual({
            teamNumber: 4,
            captainSurname: "Valdes",
            wins: 17,
            losses: 4,
            gamesBehind: null
        })
    })

    it("keeps the published finishing order", () => {
        expect(page.standings.map((s) => s.teamNumber)).toEqual([
            4, 5, 6, 3, 2, 1, 8, 7
        ])
    })

    it("ignores tables that are not the standings table", () => {
        expect(parseStandings("<table><tr><td>a</td></tr></table>")).toEqual([])
    })
})

describe("parseSchedule", () => {
    it("expands the <pre> grid into dated, timed slots", () => {
        expect(page.schedule).toHaveLength(28)
        expect(page.schedule[0]).toEqual({
            dateIso: "2000-09-07",
            time: "6:30",
            homeNumber: 2,
            awayNumber: 5,
            note: null
        })
    })

    it("anchors two-digit years on the season, not the current century", () => {
        const slots = parseSchedule(
            "<pre>      6:30\n09/07/98   1 vs 2</pre>",
            1998
        )
        expect(slots[0].dateIso).toBe("1998-09-07")
    })
})

describe("parseSetScores", () => {
    it("parses a three-set line", () => {
        expect(parseSetScores("Scores: 9-15, 15-9, 15-11")).toEqual([
            { home: 9, away: 15 },
            { home: 15, away: 9 },
            { home: 15, away: 11 }
        ])
    })

    it("returns nothing when no scores were recorded", () => {
        expect(parseSetScores("Postponed due to hurricane")).toEqual([])
    })
})

describe("parseResults", () => {
    it("recovers every match across every week", () => {
        expect(page.matches).toHaveLength(28)
        expect(
            [...new Set(page.matches.map((m) => m.week))].sort((a, b) => a - b)
        ).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it("treats the first-listed team as the winner", () => {
        // The archived pages list winner first; every row must agree.
        for (const match of page.matches) {
            expect(match.homeGames).toBeGreaterThan(match.awayGames)
        }
    })

    it("orients set scores to the first-listed team", () => {
        const first = page.matches[0]
        expect(first.homeSurname).toBe("Quinn")
        expect(first.sets).toEqual([
            { home: 9, away: 15 },
            { home: 15, away: 9 },
            { home: 15, away: 11 }
        ])
        // Quinn won 2 games, which the set scores must independently show.
        const won = first.sets.filter((s) => s.home > s.away).length
        expect(won).toBe(first.homeGames)
    })

    it("does not invent dates when the header has none", () => {
        expect(
            parseResults(
                "<b>Week 1 - </b><table><tr><td>x</td></tr></table>",
                2000
            )
        ).toEqual([])
    })
})

describe("joinMatches", () => {
    it("resolves every captain surname to a team number", () => {
        const unresolved = page.matches.filter(
            (m) => m.homeNumber === null || m.awayNumber === null
        )
        expect(unresolved).toEqual([])
    })

    it("recovers a date and time for every match from the schedule grid", () => {
        expect(page.matches.filter((m) => !m.dateIso)).toEqual([])
        expect(page.matches.filter((m) => !m.time)).toEqual([])
    })

    it("refuses to guess when two captains share a surname", () => {
        // An ambiguous surname must resolve to null rather than to whichever
        // team happened to be listed first.
        const joined = joinMatches(
            [
                {
                    week: 1,
                    dateLabel: "October 1",
                    dateIso: null,
                    time: null,
                    court: null,
                    homeNumber: null,
                    awayNumber: null,
                    homeSurname: "Smith",
                    awaySurname: "Jones",
                    homeGames: 2,
                    awayGames: 1,
                    sets: [],
                    note: null,
                    isPlayoff: false
                }
            ],
            [
                {
                    teamNumber: 1,
                    captainSurname: "Smith",
                    wins: 0,
                    losses: 0,
                    gamesBehind: null
                },
                {
                    teamNumber: 2,
                    captainSurname: "Smith",
                    wins: 0,
                    losses: 0,
                    gamesBehind: null
                },
                {
                    teamNumber: 3,
                    captainSurname: "Jones",
                    wins: 0,
                    losses: 0,
                    gamesBehind: null
                }
            ],
            []
        )

        expect(joined[0].homeNumber).toBeNull()
        expect(joined[0].awayNumber).toBe(3)
    })
})

describe("standings reconciliation (the verification oracle)", () => {
    // The archived W/L column counts GAMES (sets) won, not matches won. This
    // was determined empirically: a games-based reading reconciles for all 8
    // teams, a match-based reading for none. src/lib/team-ranking.ts's
    // computeStandings also counts sets, so the two agree.
    it("reproduces the published standings exactly from the parsed matches", () => {
        const tally = new Map<number, { wins: number; losses: number }>()
        const add = (team: number, wins: number, losses: number) => {
            const current = tally.get(team) ?? { wins: 0, losses: 0 }
            tally.set(team, {
                wins: current.wins + wins,
                losses: current.losses + losses
            })
        }

        for (const match of page.matches) {
            if (match.homeNumber === null || match.awayNumber === null) {
                continue
            }
            let homeWon = 0
            let awayWon = 0
            for (const set of match.sets) {
                if (set.home > set.away) {
                    homeWon++
                } else if (set.away > set.home) {
                    awayWon++
                }
            }
            add(match.homeNumber, homeWon, awayWon)
            add(match.awayNumber, awayWon, homeWon)
        }

        for (const row of page.standings) {
            expect(tally.get(row.teamNumber)).toEqual({
                wins: row.wins,
                losses: row.losses
            })
        }
    })
})
