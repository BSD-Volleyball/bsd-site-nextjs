import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parseJsPlayoffPage, parseSeeds } from "./parse-js-playoff"

// Spring 2024 A: 6 teams, three playoff weeks, S/W/L source tokens throughout.
const html = fs.readFileSync(
    path.join(__dirname, "__fixtures__", "playa-s24-js.html"),
    "utf-8"
)

const page = parseJsPlayoffPage(html, "playa_6t.html", {
    seasonName: "spring",
    seasonYear: 2024
})

describe("parseSeeds", () => {
    it("maps seed position to team number", () => {
        // `var seeds = [6,4,1,3,5,2]` means seed 1 is team 6.
        const seeding = parseSeeds("var seeds = [6,4,1,3,5,2];")
        expect(seeding.get(1)).toBe(6)
        expect(seeding.get(6)).toBe(2)
        expect(seeding.size).toBe(6)
    })

    it("returns nothing when the page has no seeds array", () => {
        expect(parseSeeds("var playdates = [];").size).toBe(0)
    })
})

describe("parseJsPlayoffPage", () => {
    it("reads the seeding, which is what teams.rank needs", () => {
        expect(page.seeding.size).toBeGreaterThan(0)
        expect(page.teams.size).toBeGreaterThan(0)
    })

    it("parses every match with a number, date and scores", () => {
        expect(page.matches.length).toBeGreaterThan(0)
        for (const match of page.matches) {
            expect(match.matchNumber).toBeGreaterThan(0)
            expect(match.dateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            expect(match.sets.length).toBeGreaterThan(0)
        }
    })

    it("keeps both sides as S/W/L source tokens", () => {
        // These pages never name the participants -- they name the slot and
        // let the browser resolve it. The tokens map straight onto
        // playoff_matches_meta.home_source / away_source.
        for (const match of page.matches) {
            expect(match.homeRef).not.toBeNull()
            expect(match.awayRef).not.toBeNull()
            expect(["seed", "winner", "loser"]).toContain(match.homeRef?.kind)
        }
    })

    it("captures the work-team reference", () => {
        expect(page.matches.some((m) => m.workRef !== null)).toBe(true)
    })

    it("numbers matches from match.num, not from document order", () => {
        const numbers = page.matches.map((m) => m.matchNumber)
        expect(new Set(numbers).size).toBe(numbers.length)
        expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
    })

    it("derives games won from the set scores", () => {
        for (const match of page.matches) {
            expect(match.homeGames).toBe(
                match.sets.filter((s) => s.home > s.away).length
            )
            expect(match.awayGames).toBe(
                match.sets.filter((s) => s.away > s.home).length
            )
        }
    })

    it("resolves the opening round against seeds", () => {
        // Week 1 pairs seeds directly; later rounds reference earlier matches.
        const first = page.matches[0]
        expect(first.homeRef?.kind).toBe("seed")
        expect(first.week).toBe(1)
    })

    it("ignores the commented-out 'if necessary' final", () => {
        // Spring 2024 A ended at match 10: the winners-bracket team was
        // undefeated, so the bracket reset was never played and the league
        // commented the whole block out. Reading it anyway imported a final
        // that recorded the champion LOSING -- 29 divisions were repaired for
        // exactly this. The block is still in the fixture on purpose.
        expect(html).toContain("//\tmatch.num = 11;")
        expect(page.matches.map((m) => m.matchNumber)).not.toContain(11)
        expect(Math.max(...page.matches.map((m) => m.matchNumber))).toBe(10)
    })

    it("ignores a commented-out set inside a match that was played", () => {
        // A sweep leaves the third set commented out. Counting it inflates the
        // match score (2-0 read as 3-0) even though the winner is unchanged.
        for (const match of page.matches) {
            expect(match.sets.length).toBeLessThanOrEqual(3)
            expect(match.homeGames + match.awayGames).toBe(match.sets.length)
        }
        const tenth = page.matches.find((m) => m.matchNumber === 10)
        expect(tenth?.sets.length).toBe(2)
    })
})
