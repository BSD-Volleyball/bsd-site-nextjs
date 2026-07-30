import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parsePlayoffPage, parseRef, parseSeeding } from "./parse-playoff-table"

// Real Wayback capture: web.archive.org/web/20010407224803/playa.html
// Fall 2000 A division, double elimination, 15 matches.
const html = fs.readFileSync(
    path.join(__dirname, "__fixtures__", "playa-f00.html"),
    "utf-8"
)

const page = parsePlayoffPage(html, "playa.html", 2000)

describe("parseRef", () => {
    it.each([
        ["S4", "seed", 4],
        ["W1", "winner", 1],
        ["L12", "loser", 12]
    ])("parses %s", (token, kind, value) => {
        expect(parseRef(token)).toEqual({ kind, value, token })
    })

    it("treats a captain surname as not a reference", () => {
        expect(parseRef("Gillick")).toBeNull()
    })
})

describe("parsePlayoffMatches", () => {
    it("recovers every match in the bracket", () => {
        expect(page.matches.map((m) => m.matchNumber)).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
        ])
    })

    it("transposes the <br>-stacked columns correctly", () => {
        // Row 1 of the table stacks matches 1-4; each must get its own time,
        // court, winner, loser and score line.
        expect(page.matches[0]).toMatchObject({
            matchNumber: 1,
            time: "6:30",
            court: 3,
            winnerSurname: "Stump",
            loserSurname: "Gartner"
        })
        expect(page.matches[3]).toMatchObject({
            matchNumber: 4,
            time: "9:30",
            winnerSurname: "Gillick",
            loserSurname: "McIntyre"
        })
    })

    it("broadcasts a single-valued date column across the whole row", () => {
        // The Date cell holds one value for four matches.
        expect(page.matches.slice(0, 4).map((m) => m.dateIso)).toEqual([
            "2000-10-26",
            "2000-10-26",
            "2000-10-26",
            "2000-10-26"
        ])
        expect(page.matches[4].dateIso).toBe("2000-11-02")
    })

    it("parses per-set scores for every played match", () => {
        expect(page.matches.every((m) => m.sets.length >= 2)).toBe(true)
        expect(page.matches[0].sets).toEqual([
            { home: 10, away: 15 },
            { home: 15, away: 11 },
            { home: 15, away: 4 }
        ])
    })

    it("captures the work-team assignment", () => {
        expect(page.matches[0].workSurname).toBe("Lu")
    })

    it("flags an if-necessary match", () => {
        // The page prints the deciding match as "15*".
        expect(
            page.matches.find((m) => m.matchNumber === 15)?.ifNecessary
        ).toBe(true)
        expect(
            page.matches.find((m) => m.matchNumber === 14)?.ifNecessary
        ).toBe(false)
    })

    it("never fabricates a year when the season is unknown", () => {
        // Playoff pages are usually headed just "A Division Playoff Bracket",
        // so identifyPage returns null. Dates must stay null rather than being
        // stamped with the current year.
        const unknown = parsePlayoffPage(html, "playa.html")
        expect(unknown.identity).toBeNull()
        expect(unknown.matches).toHaveLength(15)
        expect(unknown.matches.filter((m) => m.dateIso !== null)).toEqual([])
    })

    it("reads W#/L# tokens for a bracket captured before it was played", () => {
        const pending = `
          <table>
            <tr><th ROWSPAN="2">Match</th><th COLSPAN="2">Match</th><th ROWSPAN="2">Scores</th></tr>
            <tr><th>Winner</th><th>Loser</th></tr>
            <tr><td>5<br>6</td><td>W3<br>W1</td><td>L4<br>W2</td><td><br></td></tr>
          </table>`
        const parsed = parsePlayoffPage(pending, "playbb.html", 2002)

        expect(parsed.matches[0]).toMatchObject({
            matchNumber: 5,
            winnerSurname: null,
            loserSurname: null,
            winnerRef: { kind: "winner", value: 3 },
            loserRef: { kind: "loser", value: 4 }
        })
        expect(parsed.matches[0].sets).toEqual([])
    })
})

describe("parseSeeding", () => {
    // The "Position | Team" table is the REGULAR-SEASON order, not the playoff
    // result. Proven here: it lists Weaver 1st, yet Weaver loses every playoff
    // match and Gillick -- the champion recorded in the champions table -- wins
    // the final. Treating this as final placement would be wrong.
    it("reads the full ordering", () => {
        expect(page.seeding).toEqual([
            { position: 1, captainSurname: "Weaver" },
            { position: 2, captainSurname: "Finver" },
            { position: 3, captainSurname: "Gillick" },
            { position: 4, captainSurname: "Stump" },
            { position: 5, captainSurname: "Gartner" },
            { position: 6, captainSurname: "McIntyre" },
            { position: 7, captainSurname: "VanBrunt" },
            { position: 8, captainSurname: "Lu" }
        ])
    })

    it("is NOT the playoff result", () => {
        const finalWinner = page.matches.find(
            (m) => m.matchNumber === 15
        )?.winnerSurname
        expect(finalWinner).toBe("Gillick")
        // ...but Gillick is only 3rd in the seeding table.
        expect(page.seeding[0].captainSurname).not.toBe(finalWinner)
    })

    it("ignores prose that merely looks ordinal", () => {
        expect(parseSeeding("<p>Winners of the 1st Round advance</p>")).toEqual(
            []
        )
    })
})

describe("champions cross-check", () => {
    it("identifies the division winner as the final's winner", () => {
        // The champions table records Fall 2000 A as Team Gillick, which is how
        // a snapshot's season assignment gets verified independently.
        const played = page.matches.filter((m) => m.winnerSurname !== null)
        const last = played[played.length - 1]
        expect(last.winnerSurname).toBe("Gillick")
    })
})
