import { describe, expect, it } from "vitest"
import type {
    MergeDefaultsContext,
    MergeFieldValues
} from "./merge-user-fields"
import {
    isEmptyFieldValue,
    isMergeChoice,
    isMergeFieldKey,
    MERGE_FIELDS,
    otherChoice,
    resolveDefaultSelections
} from "./merge-user-fields"

function makeUser(overrides: Partial<MergeFieldValues> = {}): MergeFieldValues {
    const base = {} as MergeFieldValues
    for (const field of MERGE_FIELDS) {
        base[field.key] = null
    }
    base.createdAt = new Date("2024-01-01T00:00:00Z")
    base.old_id = 100
    return { ...base, ...overrides }
}

/**
 * Symmetric by default: neither side is fresher, neither can sign in. Tests
 * that care about a tiebreak say so explicitly.
 */
function makeContext(
    overrides: Partial<MergeDefaultsContext> = {}
): MergeDefaultsContext {
    return {
        aUpdatedAt: null,
        bUpdatedAt: null,
        aLoginMethodCount: 0,
        bLoginMethodCount: 0,
        aLastLoginAt: null,
        bLastLoginAt: null,
        ...overrides
    }
}

/** Swap a context's A and B, for the symmetry checks. */
function mirrorContext(ctx: MergeDefaultsContext): MergeDefaultsContext {
    return {
        aUpdatedAt: ctx.bUpdatedAt,
        bUpdatedAt: ctx.aUpdatedAt,
        aLoginMethodCount: ctx.bLoginMethodCount,
        bLoginMethodCount: ctx.aLoginMethodCount,
        aLastLoginAt: ctx.bLastLoginAt,
        bLastLoginAt: ctx.aLastLoginAt
    }
}

describe("resolveDefaultSelections", () => {
    it("omits fields both accounts agree on", () => {
        const selection = resolveDefaultSelections(
            makeUser({ phone: "555-1111" }),
            makeUser({ phone: "555-1111" }),
            makeContext()
        )

        expect(selection.phone).toBeUndefined()
    })

    it("omits fields neither account has", () => {
        const selection = resolveDefaultSelections(
            makeUser({ phone: null }),
            makeUser({ phone: "   " }),
            makeContext()
        )

        expect(selection.phone).toBeUndefined()
    })

    it("takes the only side that has a value", () => {
        expect(
            resolveDefaultSelections(
                makeUser({ phone: "555-1111" }),
                makeUser({ phone: null }),
                makeContext()
            ).phone
        ).toBe("a")

        expect(
            resolveDefaultSelections(
                makeUser({ phone: null }),
                makeUser({ phone: "555-2222" }),
                makeContext()
            ).phone
        ).toBe("b")
    })

    it("prefers the more recently updated account when both differ", () => {
        const stale = new Date("2020-01-01T00:00:00Z")
        const fresh = new Date("2026-01-01T00:00:00Z")

        expect(
            resolveDefaultSelections(
                makeUser({ phone: "555-1111" }),
                makeUser({ phone: "555-2222" }),
                makeContext({ aUpdatedAt: fresh, bUpdatedAt: stale })
            ).phone
        ).toBe("a")

        expect(
            resolveDefaultSelections(
                makeUser({ phone: "555-1111" }),
                makeUser({ phone: "555-2222" }),
                makeContext({ aUpdatedAt: stale, bUpdatedAt: fresh })
            ).phone
        ).toBe("b")
    })

    it("treats false as a real value rather than emptiness", () => {
        // captain_eligible: false is a deliberate decision and must not lose to
        // the other account's true just because it is falsy. With both sides
        // populated the recency rule decides.
        const selection = resolveDefaultSelections(
            makeUser({ captain_eligible: true }),
            makeUser({ captain_eligible: false }),
            makeContext({
                aUpdatedAt: new Date("2020-01-01T00:00:00Z"),
                bUpdatedAt: new Date("2026-01-01T00:00:00Z")
            })
        )

        expect(selection.captain_eligible).toBe("b")
    })

    it("keeps the earlier createdAt so member-since survives", () => {
        const older = makeUser({ createdAt: new Date("2015-06-01T00:00:00Z") })
        const newer = makeUser({ createdAt: new Date("2026-02-01T00:00:00Z") })

        expect(
            resolveDefaultSelections(older, newer, makeContext()).createdAt
        ).toBe("a")
        expect(
            resolveDefaultSelections(newer, older, makeContext()).createdAt
        ).toBe("b")
    })

    it("takes the email from the account that can actually sign in", () => {
        const selection = resolveDefaultSelections(
            makeUser({ email: "a@example.com" }),
            makeUser({ email: "b@example.com" }),
            makeContext({ aLoginMethodCount: 0, bLoginMethodCount: 1 })
        )

        expect(selection.email).toBe("b")
    })

    it("falls back to the most recent login when both can sign in", () => {
        const selection = resolveDefaultSelections(
            makeUser({ email: "a@example.com" }),
            makeUser({ email: "b@example.com" }),
            makeContext({
                aLoginMethodCount: 1,
                bLoginMethodCount: 1,
                aLastLoginAt: new Date("2026-05-01T00:00:00Z"),
                bLastLoginAt: new Date("2021-05-01T00:00:00Z")
            })
        )

        expect(selection.email).toBe("a")
    })

    it("makes emailVerified and email_status follow the email", () => {
        const selection = resolveDefaultSelections(
            makeUser({
                email: "a@example.com",
                emailVerified: true,
                email_status: "valid"
            }),
            makeUser({
                email: "b@example.com",
                emailVerified: false,
                email_status: "bounced"
            }),
            makeContext({ aLoginMethodCount: 1, bLoginMethodCount: 0 })
        )

        expect(selection.email).toBe("a")
        expect(selection.emailVerified).toBe("a")
        expect(selection.email_status).toBe("a")
    })

    it("takes old_id from whichever account owns the photo", () => {
        // Photo filenames are {old_id}_{initials}.jpg, so the id and the
        // picture have to arrive together or the photo is orphaned.
        const withPhoto = makeUser({ old_id: 900, picture: "900_JL.jpg" })
        const withoutPhoto = makeUser({ old_id: 12, picture: null })

        const selection = resolveDefaultSelections(
            withPhoto,
            withoutPhoto,
            makeContext()
        )

        expect(selection.old_id).toBe("a")
        expect(selection.picture).toBe("a")
    })

    it("falls back to the lower old_id when neither account has a photo", () => {
        const selection = resolveDefaultSelections(
            makeUser({ old_id: 4242 }),
            makeUser({ old_id: 9001 }),
            makeContext()
        )

        expect(selection.old_id).toBe("a")
    })

    it("is symmetric: swapping the two accounts mirrors every choice", () => {
        const ctx = makeContext({
            aUpdatedAt: new Date("2026-01-01T00:00:00Z"),
            bUpdatedAt: new Date("2020-01-01T00:00:00Z"),
            aLoginMethodCount: 0,
            bLoginMethodCount: 1,
            aLastLoginAt: null,
            bLastLoginAt: new Date("2025-01-01T00:00:00Z")
        })
        const userA = makeUser({
            email: "a@example.com",
            phone: "555-1111",
            old_id: 900,
            picture: "900_JL.jpg",
            createdAt: new Date("2015-06-01T00:00:00Z"),
            height: 70
        })
        const userB = makeUser({
            email: "b@example.com",
            phone: "555-2222",
            old_id: 12,
            picture: null,
            createdAt: new Date("2026-02-01T00:00:00Z"),
            height: null
        })

        const forward = resolveDefaultSelections(userA, userB, ctx)
        const mirrored = resolveDefaultSelections(
            userB,
            userA,
            mirrorContext(ctx)
        )

        expect(Object.keys(mirrored).sort()).toEqual(
            Object.keys(forward).sort()
        )
        for (const [key, choice] of Object.entries(forward)) {
            expect(mirrored[key as keyof typeof mirrored]).toBe(
                otherChoice(choice)
            )
        }
    })

    it("returns only keys with a real decision behind them", () => {
        const identical = makeUser({ phone: "555-1111" })
        const selection = resolveDefaultSelections(
            identical,
            { ...identical },
            makeContext()
        )

        expect(Object.keys(selection)).toHaveLength(0)
    })
})

describe("field key and choice guards", () => {
    it("accepts known keys and rejects anything else", () => {
        expect(isMergeFieldKey("phone")).toBe(true)
        expect(isMergeFieldKey("id")).toBe(false)
        expect(isMergeFieldKey("updatedAt")).toBe(false)
        expect(isMergeFieldKey("__proto__")).toBe(false)
        expect(isMergeFieldKey(42)).toBe(false)
    })

    it("accepts only the two choice tokens", () => {
        expect(isMergeChoice("a")).toBe(true)
        expect(isMergeChoice("b")).toBe(true)
        expect(isMergeChoice("old")).toBe(false)
        expect(isMergeChoice("A")).toBe(false)
        expect(isMergeChoice(null)).toBe(false)
    })

    it("flips a choice to the other side", () => {
        expect(otherChoice("a")).toBe("b")
        expect(otherChoice("b")).toBe("a")
    })
})

describe("isEmptyFieldValue", () => {
    it("counts null, undefined and blank strings as empty", () => {
        expect(isEmptyFieldValue(null)).toBe(true)
        expect(isEmptyFieldValue(undefined)).toBe(true)
        expect(isEmptyFieldValue("   ")).toBe(true)
    })

    it("counts false and zero as present", () => {
        expect(isEmptyFieldValue(false)).toBe(false)
        expect(isEmptyFieldValue(0)).toBe(false)
    })
})
