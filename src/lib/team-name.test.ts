import { describe, expect, it } from "vitest"
import { SEASON_PHASES } from "@/lib/season-phases"
import {
    isTeamRenameOpen,
    normalizeTeamName,
    TEAM_NAME_MAX_LENGTH
} from "./team-name"

describe("isTeamRenameOpen", () => {
    it("is open only from the draft through the regular season", () => {
        const open = SEASON_PHASES.filter(isTeamRenameOpen)
        expect(open).toEqual(["draft", "regular_season"])
    })
})

describe("normalizeTeamName", () => {
    it("trims and collapses whitespace", () => {
        expect(normalizeTeamName("  Net   Results ")).toEqual({
            ok: true,
            name: "Net Results"
        })
    })

    it("rejects blank and non-string input", () => {
        expect(normalizeTeamName("   ").ok).toBe(false)
        expect(normalizeTeamName(undefined).ok).toBe(false)
        expect(normalizeTeamName(42).ok).toBe(false)
    })

    it("enforces the maximum length after trimming", () => {
        const max = "x".repeat(TEAM_NAME_MAX_LENGTH)
        expect(normalizeTeamName(` ${max} `)).toEqual({ ok: true, name: max })
        expect(normalizeTeamName(`${max}x`).ok).toBe(false)
    })
})
