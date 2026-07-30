import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { detectEra, identifyPage, parseFilename } from "./identify"
import { parseRosterPage, parseRosterTeams } from "./parse-rosters"

// Real Wayback capture: web.archive.org/web/20020204171428/rosterb.html
const html = fs.readFileSync(
    path.join(__dirname, "__fixtures__", "rosterb-f01.html"),
    "utf-8"
)

describe("identifyPage", () => {
    it("prefers the in-body heading over a stale <title>", () => {
        // This page's <title> says "Spring 1999 BB Division Rosters" because it
        // was copied forward from an earlier season and never updated. Trusting
        // it would file Fall 2001 B results under Spring 1999 BB.
        const identity = identifyPage(html, "rosterb.html")

        expect(identity).not.toBeNull()
        expect(identity?.seasonName).toBe("fall")
        expect(identity?.seasonYear).toBe(2001)
        expect(identity?.divisionCode).toBe("b")
        expect(identity?.source).toBe("heading")
        expect(identity?.titleConflict).toBe(true)
    })

    it("parses the season-first heading style", () => {
        const identity = identifyPage(
            "<h1>Spring 2016 A Division Standings</h1>",
            "standa.html"
        )
        expect(identity).toMatchObject({
            seasonName: "spring",
            seasonYear: 2016,
            divisionCode: "a",
            titleConflict: false
        })
    })

    it("parses the pre-2012 division-first heading style", () => {
        const identity = identifyPage(
            "<h2>AA Division - Fall 2003</h2>",
            "standaa.html"
        )
        expect(identity).toMatchObject({
            seasonName: "fall",
            seasonYear: 2003,
            divisionCode: "aa"
        })
    })

    it("ignores a <title> whose division contradicts the filename", () => {
        // No heading to fall back on, and the title names a different division
        // than the file -- that mismatch is the stale-title signature.
        const identity = identifyPage(
            "<title>Spring 1999 BB Division Rosters</title><body>no heading</body>",
            "rosterb.html"
        )
        expect(identity).toBeNull()
    })

    it("accepts a <title> that agrees with the filename", () => {
        const identity = identifyPage(
            "<title>Fall 2005 BB Division Rosters</title><body>no heading</body>",
            "rosterbb.html"
        )
        expect(identity).toMatchObject({
            seasonYear: 2005,
            divisionCode: "bb",
            source: "title"
        })
    })
})

describe("parseFilename", () => {
    it.each([
        ["standa.html", "standings", "a"],
        ["standaa_6t.html", "standings", "aa"],
        ["playbbb.html", "playoff", "bbb"],
        ["rosteraba.html", "roster", "aba"],
        ["standab.html", "standings", "ab"]
    ])("maps %s", (file, kind, division) => {
        expect(parseFilename(file)).toEqual({ kind, divisionCode: division })
    })

    it("rejects lookalikes that are not results pages", () => {
        // "player_experience.html" starts with "play" but is not a playoff page.
        expect(parseFilename("player_experience.html")).toBeNull()
        expect(parseFilename("preseason_roster2.html")).toBeNull()
        expect(parseFilename("standings.js")).toBeNull()
    })
})

describe("detectEra", () => {
    it("classifies the archived static pages as the old era", () => {
        expect(detectEra(html)).toBe("old")
    })

    it("classifies JS-driven pages as the new era", () => {
        expect(detectEra("<script>var teamlist = [];</script>")).toBe("new")
    })
})

describe("parseRosterTeams", () => {
    const teams = parseRosterTeams(html)

    it("finds every team on the page", () => {
        expect(teams.map((t) => t.teamNumber)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it("parses 'Last, First' into components", () => {
        const first = teams[0].players[0]
        expect(first).toMatchObject({
            lastName: "Blackburn",
            firstName: "Shannon",
            isCaptain: false
        })
    })

    it("reads the captain off the (Capt) marker", () => {
        const captains = teams.map(
            (t) => t.players.find((p) => p.isCaptain)?.raw ?? null
        )
        expect(captains).toEqual([
            "Toth, Rick (Capt)",
            "Quinn, Peggy (Capt)",
            "Blanchard, Jack (Capt)",
            "Sechler, Tim (Capt)",
            "Gartner, Connie (Capt)",
            "Sallerson, Keith (Capt)"
        ])
    })

    it("disambiguates two players sharing a surname on one team", () => {
        // Team #3 has both Blanchard, Jack (Capt) and Blanchard, Peggy. A
        // surname-only match would be ambiguous; the marker is not.
        const team3 = teams.find((t) => t.teamNumber === 3)
        const blanchards = team3?.players.filter(
            (p) => p.lastName === "Blanchard"
        )

        expect(blanchards).toHaveLength(2)
        expect(
            blanchards?.filter((p) => p.isCaptain).map((p) => p.firstName)
        ).toEqual(["Jack"])
    })

    it("treats non-(Capt) parentheticals as commentary, not captaincy", () => {
        // The archived page really does say "Wohlford, Kyra (Sucks)".
        const kyra = teams
            .flatMap((t) => t.players)
            .find((p) => p.lastName === "Wohlford")

        expect(kyra).toMatchObject({
            lastName: "Wohlford",
            firstName: "Kyra",
            isCaptain: false
        })
    })

    it("gives every team exactly one captain", () => {
        for (const team of teams) {
            expect(team.players.filter((p) => p.isCaptain)).toHaveLength(1)
        }
    })

    it("does not swallow the 'Team #N' header as a player", () => {
        for (const team of teams) {
            expect(team.players.some((p) => /Team\s*#/i.test(p.raw))).toBe(
                false
            )
        }
    })

    it("recovers full rosters", () => {
        expect(teams.every((t) => t.players.length === 8)).toBe(true)
    })
})

describe("parseRosterPage", () => {
    it("returns identity and teams together", () => {
        const page = parseRosterPage(html, "rosterb.html")
        expect(page.identity?.seasonYear).toBe(2001)
        expect(page.teams).toHaveLength(6)
    })
})
