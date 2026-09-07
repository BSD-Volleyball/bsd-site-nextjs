import { describe, expect, it } from "vitest"
import {
    defaultWeek1Unavailable,
    effectiveWeek1Audience,
    getWeek1PriorityGroup,
    LONG_GAP_SEASONS,
    resolveWeek1Audience
} from "./week1-priority"

const CURRENT = 50

const draft = (seasonId: number, divisionLevel: number) => ({
    seasonId,
    divisionLevel
})

const returning = {
    hasAnyDraft: true,
    playFirstWeek: true,
    missesTryout2Or3: false,
    mostRecentDraft: draft(CURRENT - 1, 3),
    secondMostRecentDraft: draft(CURRENT - 2, 3),
    currentSeasonId: CURRENT
}

describe("getWeek1PriorityGroup", () => {
    it("puts players with no draft history in new_users regardless of week 1", () => {
        expect(
            getWeek1PriorityGroup({
                ...returning,
                hasAnyDraft: false,
                playFirstWeek: false,
                mostRecentDraft: null,
                secondMostRecentDraft: null
            })
        ).toBe("new_users")
    })

    it("excludes returning players who are not playing week 1", () => {
        expect(
            getWeek1PriorityGroup({ ...returning, playFirstWeek: false })
        ).toBeNull()
    })

    it("flags a long gap only when more than LONG_GAP_SEASONS seasons have passed", () => {
        expect(
            getWeek1PriorityGroup({
                ...returning,
                mostRecentDraft: draft(CURRENT - LONG_GAP_SEASONS - 1, 3),
                secondMostRecentDraft: null
            })
        ).toBe("week1_long_gap")
        expect(
            getWeek1PriorityGroup({
                ...returning,
                mostRecentDraft: draft(CURRENT - LONG_GAP_SEASONS, 3),
                secondMostRecentDraft: null
            })
        ).toBe("week1_other")
    })

    it("flags missing tryout 2 or 3", () => {
        expect(
            getWeek1PriorityGroup({ ...returning, missesTryout2Or3: true })
        ).toBe("week1_missing_tryout")
    })

    it("flags a dropped division (higher level number = lower division)", () => {
        expect(
            getWeek1PriorityGroup({
                ...returning,
                mostRecentDraft: draft(CURRENT - 1, 4),
                secondMostRecentDraft: draft(CURRENT - 2, 3)
            })
        ).toBe("week1_dropped_division")
    })

    it("does not flag a promotion as a dropped division", () => {
        expect(
            getWeek1PriorityGroup({
                ...returning,
                mostRecentDraft: draft(CURRENT - 1, 2),
                secondMostRecentDraft: draft(CURRENT - 2, 3)
            })
        ).toBe("week1_other")
    })

    it("ranks a long gap ahead of a missing tryout", () => {
        expect(
            getWeek1PriorityGroup({
                ...returning,
                missesTryout2Or3: true,
                mostRecentDraft: draft(CURRENT - 10, 3)
            })
        ).toBe("week1_long_gap")
    })
})

describe("resolveWeek1Audience", () => {
    const base = {
        hasAnyDraft: true,
        mostRecentDraft: draft(CURRENT - 1, 3),
        secondMostRecentDraft: draft(CURRENT - 2, 3),
        currentSeasonId: CURRENT,
        isBubblePlayer: false,
        missesTryout2Or3: false
    }

    it("is 'new' for players with no draft history", () => {
        expect(
            resolveWeek1Audience({
                ...base,
                hasAnyDraft: false,
                mostRecentDraft: null,
                secondMostRecentDraft: null
            })
        ).toBe("new")
    })

    it("is 'returning' for a steady recent player", () => {
        expect(resolveWeek1Audience(base)).toBe("returning")
    })

    it("is 'likely' after a long gap", () => {
        expect(
            resolveWeek1Audience({
                ...base,
                mostRecentDraft: draft(CURRENT - 6, 3),
                secondMostRecentDraft: null
            })
        ).toBe("likely")
    })

    it("is 'likely' when missing tryout 2 or 3", () => {
        expect(resolveWeek1Audience({ ...base, missesTryout2Or3: true })).toBe(
            "likely"
        )
    })

    it("is 'likely' after dropping a division", () => {
        expect(
            resolveWeek1Audience({
                ...base,
                mostRecentDraft: draft(CURRENT - 1, 5),
                secondMostRecentDraft: draft(CURRENT - 2, 3)
            })
        ).toBe("likely")
    })

    it("is 'likely' for bubble players", () => {
        expect(resolveWeek1Audience({ ...base, isBubblePlayer: true })).toBe(
            "likely"
        )
    })
})

describe("effectiveWeek1Audience", () => {
    it("upgrades returning to likely when tryout 2 or 3 is missed", () => {
        expect(effectiveWeek1Audience("returning", true)).toBe("likely")
    })

    it("leaves returning alone when tryouts 2 and 3 are attended", () => {
        expect(effectiveWeek1Audience("returning", false)).toBe("returning")
    })

    it("never changes new or likely", () => {
        expect(effectiveWeek1Audience("new", true)).toBe("new")
        expect(effectiveWeek1Audience("likely", false)).toBe("likely")
    })
})

describe("defaultWeek1Unavailable", () => {
    it("defaults only plain returning players to sitting out week 1", () => {
        expect(defaultWeek1Unavailable("returning")).toBe(true)
        expect(defaultWeek1Unavailable("likely")).toBe(false)
        expect(defaultWeek1Unavailable("new")).toBe(false)
    })
})
