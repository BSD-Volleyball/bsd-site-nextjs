import { describe, expect, it } from "vitest"
import {
    isLegacyEmail,
    legacyKind,
    norm,
    reasonFor,
    suggestMatch
} from "./legacy-matching"

describe("isLegacyEmail / legacyKind", () => {
    it("recognises both placeholder flavours and nothing else", () => {
        expect(
            isLegacyEmail("legacy-roster-jane-doe-f07-1@bumpsetdrink.com")
        ).toBe(true)
        expect(isLegacyEmail("legacy-hoc-jane-doe@bumpsetdrink.com")).toBe(true)
        expect(isLegacyEmail("jane@example.com")).toBe(false)
        // A real address that merely contains the word must not be swept up.
        expect(isLegacyEmail("notlegacy-jane@example.com")).toBe(false)
        expect(isLegacyEmail(null)).toBe(false)
    })

    it("distinguishes hall-of-champions placeholders from roster ones", () => {
        expect(legacyKind("legacy-hoc-jane@bumpsetdrink.com")).toBe("hoc")
        expect(legacyKind("legacy-roster-jane-f07-1@bumpsetdrink.com")).toBe(
            "roster"
        )
    })
})

describe("norm", () => {
    it("strips case, punctuation and surrounding space", () => {
        expect(norm("  O'Brien ")).toBe("obrien")
        expect(norm("Mae-Ling")).toBe("maeling")
        expect(norm("Jean Luc")).toBe("jean luc")
    })
})

describe("reasonFor", () => {
    it("tiers the ways two first names can be the same person", () => {
        expect(reasonFor("james", "james")).toBe("exact")
        expect(reasonFor("bill", "william")).toBe("nickname")
        expect(reasonFor("william", "bill")).toBe("nickname")
        expect(reasonFor("mae ling", "maeling")).toBe("spacing")
        expect(reasonFor("jon", "jonathan")).toBe("prefix")
    })

    it("refuses unrelated names and too-short prefixes", () => {
        expect(reasonFor("james", "jeffrey")).toBeNull()
        // "jo" would prefix-match half the league, so short stems are out.
        expect(reasonFor("jo", "joseph")).toBeNull()
    })
})

const legacy = { id: "legacy-1", firstName: "Bill", lastName: "Smith" }

describe("suggestMatch", () => {
    it("proposes the single same-surname account whose first name relates", () => {
        const match = suggestMatch({
            legacy,
            candidates: [
                { id: "a", firstName: "William", lastName: "Smith" },
                { id: "b", firstName: "Karen", lastName: "Smith" },
                { id: "c", firstName: "William", lastName: "Jones" }
            ]
        })

        expect(match?.target.id).toBe("a")
        expect(match?.reason).toBe("nickname")
    })

    it("stays silent when two candidates could both be the person", () => {
        // Choosing between two people is an admin decision, not a heuristic's.
        const match = suggestMatch({
            legacy,
            candidates: [
                { id: "a", firstName: "William", lastName: "Smith" },
                { id: "b", firstName: "Billy", lastName: "Smith" }
            ]
        })

        expect(match).toBeNull()
    })

    it("stays silent when nobody shares the surname", () => {
        expect(
            suggestMatch({
                legacy,
                candidates: [
                    { id: "a", firstName: "William", lastName: "Wong" }
                ]
            })
        ).toBeNull()
    })

    it("rejects a candidate who played on the same team", () => {
        // Fall 2009 B "Team Jimenez" listed Jimmy, James and Jeff together. A
        // roster never lists one person twice, so a shared team is proof they
        // are different people -- exactly the case a nickname match would get
        // wrong.
        const match = suggestMatch({
            legacy,
            candidates: [{ id: "a", firstName: "William", lastName: "Smith" }],
            sameTeamIds: new Set(["a"])
        })

        expect(match).toBeNull()
    })

    it("never proposes the legacy account as its own target", () => {
        expect(
            suggestMatch({
                legacy,
                candidates: [
                    { id: legacy.id, firstName: "Bill", lastName: "Smith" }
                ]
            })
        ).toBeNull()
    })
})
