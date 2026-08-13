import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
    parseJsStandingsPage,
    parsePlaydates,
    parseTeams,
    resolvePlaydate,
    stripBlockComments,
    stripLineComments
} from "./parse-js-era"

const read = (name: string) =>
    fs.readFileSync(path.join(__dirname, "__fixtures__", name), "utf-8")

// Fall 2016 A: the `var teams` variant (2013-2021), 6 teams.
const jsTeams = read("standa-f16-jsteams.html")
// Spring 2024 A: the `var teamlist` variant (2022-2024).
const jsTeamlist = read("standa-s24-jsteamlist.html")
// Fall 2013 AA: 4 teams, but the file also contains a commented-out block of
// matches for teams 5 and 6 left over from a previous season.
const blockComment = read("standaa-f13-blockcomment.html")

describe("parseTeams", () => {
    it("reads the `var teams` variant via its num: field", () => {
        const teams = parseTeams(jsTeams)
        expect(teams.get(1)).toBe("Toohey")
        expect(teams.get(6)).toBe("Llerena")
        expect(teams.size).toBe(6)
    })

    it("reads the `var teamlist` variant", () => {
        const teams = parseTeams(jsTeamlist)
        expect(teams.size).toBeGreaterThan(0)
    })

    it("uses num:, not the array index", () => {
        // `teams` is 0-based and `teamlist` is 1-based, so indexing would be
        // off by one for one of them. Both carry an explicit num:.
        expect(parseTeams('teams[0] = {num:1, name:"A"};').get(1)).toBe("A")
        expect(parseTeams('teamlist[1] = {num:1, name:"A"};').get(1)).toBe("A")
    })
})

describe("stripBlockComments", () => {
    it("removes /* */ blocks but keeps // line comments", () => {
        const script = "// Matches - Week 1\n/* match.teams = [9,9]; */\nkeep"
        const stripped = stripBlockComments(script)
        expect(stripped).toContain("// Matches - Week 1")
        expect(stripped).toContain("keep")
        expect(stripped).not.toContain("[9,9]")
    })

    it("discards commented-out matches from a previous season", () => {
        // Without stripping, this page yields matches for teams 5 and 6 that
        // do not exist in the division -- fabricated data with real-looking
        // scores. This is the single highest-risk trap in the JS era.
        const page = parseJsStandingsPage(blockComment, "standaa.html", {
            seasonName: "fall",
            seasonYear: 2013
        })

        expect(page.teams.size).toBe(4)
        const referenced = new Set(
            page.matches.flatMap((m) => [m.homeNumber, m.awayNumber])
        )
        expect([...referenced].sort()).toEqual([1, 2, 3, 4])
    })
})

describe("stripLineComments", () => {
    it("removes a commented-out match block", () => {
        const script = [
            "\tmatch.num = 10;",
            "\tmatch.games[0].scores = [25,20];",
            "//\tmatch.num = 11;",
            "//\tmatch.games[0].scores = [24,26];"
        ].join("\n")
        const stripped = stripLineComments(script)
        expect(stripped).toContain("match.num = 10")
        expect(stripped).not.toContain("match.num = 11")
        expect(stripped).not.toContain("[24,26]")
    })

    it("leaves // inside a string literal alone", () => {
        // Nothing in these pages currently does this, but a truncating regex
        // would silently eat half a value if one ever did.
        const script = 'match.note = "see http://x/y"; // drop me'
        expect(stripLineComments(script)).toBe(
            'match.note = "see http://x/y"; '
        )
    })

    it("erases the week markers, which is why callers split first", () => {
        // Documents the ordering constraint the parsers depend on.
        expect(stripLineComments("// Matches - Week 1\nkeep")).toBe("\nkeep")
    })
})

describe("parsePlaydates", () => {
    it("reads the play-date array", () => {
        const dates = parsePlaydates(jsTeams)
        expect(dates[0]).toBe("09/08")
        expect(dates).toHaveLength(10)
    })
})

describe("resolvePlaydate", () => {
    it("stamps the season's year on a bare MM/DD", () => {
        expect(resolvePlaydate("09/08", "fall", 2016)).toBe("2016-09-08")
        expect(resolvePlaydate("04/21", "spring", 2022)).toBe("2022-04-21")
    })

    it("rolls a fall season's early-month date into the next year", () => {
        // A January play date on a Fall page belongs to the following year.
        expect(resolvePlaydate("01/12", "fall", 2016)).toBe("2017-01-12")
    })

    it("honours an explicit year when the page gives one", () => {
        expect(resolvePlaydate("09/08/17", "fall", 2016)).toBe("2017-09-08")
    })
})

describe("parseJsStandingsPage", () => {
    const page = parseJsStandingsPage(jsTeams, "standa.html", {
        seasonName: "fall",
        seasonYear: 2016
    })

    it("recovers matches with teams, scores, times and dates", () => {
        expect(page.matches.length).toBeGreaterThan(0)
        expect(page.matches[0]).toMatchObject({
            week: 1,
            dateIso: "2016-09-08",
            time: "7:00",
            homeNumber: 1,
            awayNumber: 3,
            homeSurname: "Toohey",
            awaySurname: "Lowery"
        })
        expect(page.matches[0].sets).toEqual([
            { home: 25, away: 14 },
            { home: 25, away: 22 },
            { home: 25, away: 11 }
        ])
    })

    it("derives games won from the set scores", () => {
        for (const match of page.matches) {
            const home = match.sets.filter((s) => s.home > s.away).length
            const away = match.sets.filter((s) => s.away > s.home).length
            expect(match.homeGames).toBe(home)
            expect(match.awayGames).toBe(away)
        }
    })

    it("applies the default court when a match does not override it", () => {
        expect(page.matches.every((m) => m.court !== null)).toBe(true)
    })

    it("resolves every team reference to a captain surname", () => {
        expect(
            page.matches.filter((m) => !m.homeSurname || !m.awaySurname)
        ).toEqual([])
    })

    it("emits no matches for declared-but-empty playoff weeks", () => {
        // Standings pages mark playoff dates with `date.playoffs = true` but
        // carry no match data for them -- the results live on play*.html.
        const s24 = parseJsStandingsPage(jsTeamlist, "standa_6t.html", {
            seasonName: "spring",
            seasonYear: 2024
        })
        expect(s24.matches.filter((m) => m.isPlayoff)).toEqual([])
        expect(s24.matches.length).toBeGreaterThan(0)
    })

    it("does not clamp the season at six weeks", () => {
        // The existing archive importer drops weeks > 6; older seasons ran
        // longer, and that clamp would silently discard real results.
        const weeks = new Set(page.matches.map((m) => m.week))
        expect(Math.max(...weeks)).toBeGreaterThan(6)
    })
})
