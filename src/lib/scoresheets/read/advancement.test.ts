import { describe, expect, it } from "vitest"

import {
    type AdvancementMatch,
    advancementProblems,
    namedSide
} from "./advancement"
import type { PageReading, WrittenNames } from "./page-reader"

const team = (captains: string[] = []) => ({ captains, source: null })
const slot = (kind: "winner" | "loser", matchNum: number) => ({
    captains: [],
    source: { kind, matchNum }
})

// Court 4 on 2026-10-29, as printed: ABA M6, then ABA M8 fed by M5 (played
// on another court) and M6, then ABB M5, whose number collides with ABA's.
const COURT_4: AdvancementMatch[] = [
    {
        home: "Team Gomez",
        away: "Team Collazo",
        bracket: {
            division: "ABA",
            matchNum: 6,
            home: team(["Margarita Gomez"]),
            away: team(["Beatrice Collazo"])
        }
    },
    {
        home: "Winner of M5",
        away: "Winner of M6",
        bracket: {
            division: "ABA",
            matchNum: 8,
            home: slot("winner", 5),
            away: slot("winner", 6)
        }
    },
    {
        home: "Team Shanmugam",
        away: "Team Ameer",
        bracket: {
            division: "ABB",
            matchNum: 5,
            home: team(["Senthil Shanmugam"]),
            away: team(["Faique Ameer"])
        }
    }
]

function reading(writtenNames: WrittenNames[], model = "a/one"): PageReading {
    return { model, sheetCode: null, matches: [], writtenNames }
}

const none = { home: null, away: null }

describe("advancementProblems", () => {
    it("flags the match whose scores send the other team forward", () => {
        // The sheet said Gomez 26-24 in game 3, so Gomez won; the referee
        // then wrote Collazo into the Winner of M6 slot, and Collazo played.
        const problems = advancementProblems(
            COURT_4,
            ["home", null, "home"],
            [
                reading([
                    none,
                    { home: "Team Vinny", away: "Team Collazo" },
                    none
                ])
            ]
        )

        expect(problems).toEqual([
            {
                matchIndex: 0,
                problem:
                    'The referee wrote "Team Collazo" into match 2 as the winner of M6, but these scores make Team Gomez the winner. Check this match\'s scores against the photo.'
            }
        ])
    })

    it("is quiet when the written name agrees with the scores", () => {
        const problems = advancementProblems(
            COURT_4,
            ["away", null, "home"],
            [reading([none, { home: null, away: "Collazo" }, none])]
        )
        expect(problems).toEqual([])
    })

    it("never reads ABA's Winner of M5 as ABB's M5 on the same page", () => {
        // ABB M5 here went to Shanmugam; "Ameer" in the ABA slot would be a
        // contradiction only if the division were ignored.
        const problems = advancementProblems(
            COURT_4,
            ["away", null, "home"],
            [reading([none, { home: "Team Ameer", away: null }, none])]
        )
        expect(problems).toEqual([])
    })

    it("places a name written by captain rather than team", () => {
        const problems = advancementProblems(
            COURT_4,
            ["away", null, "home"],
            [reading([none, { home: null, away: "MARGARITA GOMEZ" }, none])]
        )
        expect(problems).toHaveLength(1)
        expect(problems[0].matchIndex).toBe(0)
    })

    it("checks a loser slot against the loser", () => {
        const matches: AdvancementMatch[] = [
            COURT_4[0],
            {
                home: "Team Pham",
                away: "Loser of M6",
                bracket: {
                    division: "ABA",
                    matchNum: 9,
                    home: team(),
                    away: slot("loser", 6)
                }
            }
        ]
        const written = [none, { home: null, away: "Gomez" }]

        expect(
            advancementProblems(matches, ["away", null], [reading(written)])
        ).toEqual([])
        expect(
            advancementProblems(matches, ["home", null], [reading(written)])
        ).toHaveLength(1)
    })

    it("raises nothing it cannot be sure of", () => {
        const collazo = [none, { home: null, away: "Collazo" }, none]
        // The source match's winner is not settled by the scores.
        expect(
            advancementProblems(
                COURT_4,
                [null, null, "home"],
                [reading(collazo)]
            )
        ).toEqual([])
        // An older read with no written names at all.
        expect(
            advancementProblems(
                COURT_4,
                ["home", null, "home"],
                [{ model: "a/one", sheetCode: null, matches: [] }]
            )
        ).toEqual([])
    })

    it("reports a contradiction once, however many readers saw it", () => {
        const written = [none, { home: null, away: "Collazo" }, none]
        const problems = advancementProblems(
            COURT_4,
            ["home", null, "home"],
            [reading(written, "a/one"), reading(written, "b/two")]
        )
        expect(problems).toHaveLength(1)
    })
})

describe("namedSide", () => {
    const m6 = COURT_4[0] as Parameters<typeof namedSide>[1]

    it("ignores filler words and case", () => {
        expect(namedSide("team COLLAZO", m6)).toBe("away")
        expect(namedSide("Gómez", m6)).toBe("home")
    })

    it("places nothing that names neither team, or both", () => {
        expect(namedSide("Team Vinny", m6)).toBeNull()
        expect(namedSide("Team", m6)).toBeNull()
        expect(namedSide("Gomez / Collazo", m6)).toBeNull()
    })
})
