import { describe, expect, it } from "vitest"
import {
    isValidPhaseRevert,
    isValidPhaseTransition,
    PHASE_CONFIG,
    SEASON_PHASES,
    type SeasonPhase
} from "@/lib/season-phases"

describe("PHASE_CONFIG", () => {
    it("covers every declared phase", () => {
        for (const phase of SEASON_PHASES) {
            expect(PHASE_CONFIG[phase]).toBeDefined()
        }
        expect(Object.keys(PHASE_CONFIG)).toHaveLength(SEASON_PHASES.length)
    })

    it("keeps forward and backward links consistent", () => {
        // If B lists A as its previousPhase, then A must list B as a nextPhase
        for (const phase of SEASON_PHASES) {
            const prev = PHASE_CONFIG[phase].previousPhase
            if (prev !== null) {
                expect(
                    PHASE_CONFIG[prev].nextPhases,
                    `${prev} should advance to ${phase}`
                ).toContain(phase)
            }
        }
    })

    it("only references declared phases in transitions", () => {
        const known = new Set<string>(SEASON_PHASES)
        for (const phase of SEASON_PHASES) {
            for (const next of PHASE_CONFIG[phase].nextPhases) {
                expect(known.has(next)).toBe(true)
            }
        }
    })
})

describe("isValidPhaseTransition", () => {
    it("allows the documented forward chain", () => {
        expect(isValidPhaseTransition("off_season", "registration_open")).toBe(
            true
        )
        expect(isValidPhaseTransition("draft", "regular_season")).toBe(true)
        expect(isValidPhaseTransition("playoffs", "complete")).toBe(true)
    })

    it("rejects skipping phases", () => {
        expect(isValidPhaseTransition("off_season", "draft")).toBe(false)
        expect(isValidPhaseTransition("registration_open", "playoffs")).toBe(
            false
        )
    })

    it("allows no transitions out of complete", () => {
        for (const phase of SEASON_PHASES) {
            expect(isValidPhaseTransition("complete", phase)).toBe(false)
        }
    })
})

describe("isValidPhaseRevert", () => {
    it("allows stepping back exactly one phase", () => {
        expect(isValidPhaseRevert("registration_open", "off_season")).toBe(true)
        expect(isValidPhaseRevert("playoffs", "regular_season")).toBe(true)
    })

    it("rejects reverting multiple phases or from the start", () => {
        expect(isValidPhaseRevert("draft", "registration_open")).toBe(false)
        for (const phase of SEASON_PHASES) {
            expect(isValidPhaseRevert("off_season", phase as SeasonPhase)).toBe(
                false
            )
        }
    })
})
