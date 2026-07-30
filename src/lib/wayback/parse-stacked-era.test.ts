import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveSurname, transposeRow } from "./html-table"
import {
    parseResultRows,
    parseScheduleRows,
    parseStackedStandings,
    parseStackedStandingsPage
} from "./parse-stacked-era"

const read = (name: string) =>
    fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf-8")

// Spring 2008 A: 6 teams, 8 play dates, and one week whose Scores column
// literally reads "not reported".
const s08 = read("standa-s08-stacked.html")
// Spring 2013 A: 5 scheduled weeks plus playoff results appended to the same
// results table.
const s13 = read("standa-s13-playoffrows.html")

describe("transposeRow", () => {
    it("zips <br>-stacked columns into records", () => {
        const row = "<td>1<br>2</td><td>Stump<br>Lu</td>"
        expect(transposeRow(row)).toEqual([
            ["1", "Stump"],
            ["2", "Lu"]
        ])
    })

    it("broadcasts a single-valued column to every record", () => {
        // One Date cell applies to all matches played that evening.
        const row = "<td>10/26</td><td>a<br>b<br>c</td>"
        expect(transposeRow(row).map((r) => r[0])).toEqual([
            "10/26",
            "10/26",
            "10/26"
        ])
    })
})

describe("resolveSurname", () => {
    const candidates = new Map([
        ["villaneuva", 1],
        ["weiss", 2]
    ])

    it("matches exactly when it can", () => {
        expect(resolveSurname("Weiss", candidates)).toBe(2)
    })

    it("tolerates a typo between two tables on the same page", () => {
        // Fall 2010 A spells the captain "Villaneuva" in the standings and
        // "Villanueva" in the results.
        expect(resolveSurname("Villanueva", candidates)).toBe(1)
    })

    it("refuses to guess when a near match is ambiguous", () => {
        // "chun" is one edit from both, so there is no single best answer.
        // Attributing a match to the wrong team is worse than skipping it.
        const ambiguous = new Map([
            ["chan", 1],
            ["chen", 2]
        ])
        expect(resolveSurname("chun", ambiguous)).toBeNull()
    })

    it("still resolves when only one candidate is within the budget", () => {
        const candidates = new Map([
            ["smith", 1],
            ["smyth", 2]
        ])
        // One edit from "smith", two from "smyth" -- unambiguous.
        expect(resolveSurname("smitk", candidates)).toBe(1)
    })

    it("returns null for a genuinely unknown name", () => {
        expect(resolveSurname("Nobody", candidates)).toBeNull()
    })
})

describe("parseStackedStandings", () => {
    it("reads the published table", () => {
        const standings = parseStackedStandings(s08)
        expect(standings).toHaveLength(6)
        expect(standings[0]).toMatchObject({
            teamNumber: 5,
            captainSurname: "Gillick",
            wins: 16,
            losses: 8
        })
    })
})

describe("parseScheduleRows", () => {
    it("keeps one entry per play date and skips non-playing rows", () => {
        const rows = parseScheduleRows(s08, "spring", 2008)
        expect(rows).toHaveLength(8)
        expect(rows[0].dateIso).toBe("2008-04-10")
        expect(rows[0].slots).toHaveLength(3)
        expect(rows[0].slots[0]).toMatchObject({ homeNumber: 3, awayNumber: 4 })
    })
})

describe("parseResultRows", () => {
    it("groups results by play date", () => {
        const rows = parseResultRows(s08)
        expect(rows).toHaveLength(8)
        expect(rows[0]).toHaveLength(3)
    })

    it("keeps games won when the scores were never reported", () => {
        // One week's Scores cell reads "not reported"; the games-won columns
        // are still filled in and the published standings count those games.
        const flat = parseResultRows(s08).flat()
        const unscored = flat.filter((r) => r.sets.length === 0)
        expect(unscored.length).toBeGreaterThan(0)
        for (const record of unscored) {
            expect(record.winnerGames + record.loserGames).toBeGreaterThan(0)
            expect(record.note).toMatch(/not reported/i)
        }
    })
})

describe("parseStackedStandingsPage", () => {
    const page = parseStackedStandingsPage(s08, "standa.html", {
        seasonName: "spring",
        seasonYear: 2008
    })

    it("assigns a week and date to every match from the row alignment", () => {
        expect(page.matches).toHaveLength(24)
        expect(page.matches.filter((m) => !m.dateIso)).toEqual([])
        expect(
            [...new Set(page.matches.map((m) => m.week))].sort((a, b) => a - b)
        ).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })

    it("resolves every captain surname to a team number", () => {
        expect(
            page.matches.filter(
                (m) => m.homeNumber === null || m.awayNumber === null
            )
        ).toEqual([])
    })

    it("recovers time and court by pairing within the row", () => {
        expect(page.matches[0].time).toBeTruthy()
    })

    it("reproduces the published standings from games won", () => {
        // The archived W/L counts GAMES. Where set scores are missing the
        // games-won columns still carry the totals, so the reconciliation is
        // done on games rather than on sets.
        const tally = new Map<number, { wins: number; losses: number }>()
        const add = (team: number, wins: number, losses: number) => {
            const current = tally.get(team) ?? { wins: 0, losses: 0 }
            tally.set(team, {
                wins: current.wins + wins,
                losses: current.losses + losses
            })
        }
        for (const match of page.matches.filter((m) => !m.isPlayoff)) {
            if (match.homeNumber === null || match.awayNumber === null) {
                continue
            }
            add(match.homeNumber, match.homeGames, match.awayGames)
            add(match.awayNumber, match.awayGames, match.homeGames)
        }

        for (const row of page.standings) {
            expect(tally.get(row.teamNumber)).toEqual({
                wins: row.wins,
                losses: row.losses
            })
        }
    })
})

describe("playoff results appended to a standings page", () => {
    const page = parseStackedStandingsPage(s13, "standa.html", {
        seasonName: "spring",
        seasonYear: 2013
    })

    it("marks results past the end of the schedule as playoff", () => {
        // Spring 2013 A has 5 scheduled weeks; its results table carries
        // additional rows of playoff matches, which the published
        // regular-season standings deliberately exclude.
        const playoff = page.matches.filter((m) => m.isPlayoff)
        expect(playoff.length).toBeGreaterThan(0)
        expect(page.matches.filter((m) => !m.isPlayoff)).toHaveLength(15)
    })

    it("still reconciles the regular season exactly", () => {
        const tally = new Map<number, { wins: number; losses: number }>()
        const add = (team: number, wins: number, losses: number) => {
            const current = tally.get(team) ?? { wins: 0, losses: 0 }
            tally.set(team, {
                wins: current.wins + wins,
                losses: current.losses + losses
            })
        }
        for (const match of page.matches.filter((m) => !m.isPlayoff)) {
            if (match.homeNumber === null || match.awayNumber === null) {
                continue
            }
            add(match.homeNumber, match.homeGames, match.awayGames)
            add(match.awayNumber, match.awayGames, match.homeGames)
        }
        for (const row of page.standings) {
            expect(tally.get(row.teamNumber)).toEqual({
                wins: row.wins,
                losses: row.losses
            })
        }
    })
})
