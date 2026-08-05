import { describe, expect, it } from "vitest"
import {
    EMAIL_SUBJECT_PREFIX,
    applyEmailSubjectPrefix,
    stripEmailSubjectPrefix
} from "./email-subject"

describe("applyEmailSubjectPrefix", () => {
    it("prepends the prefix to a plain subject", () => {
        expect(applyEmailSubjectPrefix("Week 3 schedule")).toBe(
            "[BSD] Week 3 schedule"
        )
    })

    it("does not double an already-prefixed subject", () => {
        expect(applyEmailSubjectPrefix("[BSD] Week 3 schedule")).toBe(
            "[BSD] Week 3 schedule"
        )
    })

    it("normalizes casing and spacing of an existing prefix", () => {
        expect(applyEmailSubjectPrefix("[bsd]Week 3")).toBe("[BSD] Week 3")
        expect(applyEmailSubjectPrefix("  [ BSD ]   Week 3  ")).toBe(
            "[BSD] Week 3"
        )
    })

    it("collapses repeated prefixes", () => {
        expect(applyEmailSubjectPrefix("[BSD] [BSD] Week 3")).toBe(
            "[BSD] Week 3"
        )
    })

    it("leaves a mid-subject occurrence alone", () => {
        expect(applyEmailSubjectPrefix("Re: [BSD] Week 3")).toBe(
            "[BSD] Re: [BSD] Week 3"
        )
    })

    it("is idempotent", () => {
        const once = applyEmailSubjectPrefix("Week 3")
        expect(applyEmailSubjectPrefix(once)).toBe(once)
    })
})

describe("stripEmailSubjectPrefix", () => {
    it("returns empty for a subject that is only the prefix", () => {
        expect(stripEmailSubjectPrefix(EMAIL_SUBJECT_PREFIX)).toBe("")
    })

    it("trims surrounding whitespace", () => {
        expect(stripEmailSubjectPrefix("  Week 3  ")).toBe("Week 3")
    })
})
