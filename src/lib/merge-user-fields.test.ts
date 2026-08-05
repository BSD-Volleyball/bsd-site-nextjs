import { describe, expect, it } from "vitest"
import type { MergeFieldValues } from "./merge-user-fields"
import {
    isEmptyFieldValue,
    isMergeChoice,
    isMergeFieldKey,
    MERGE_FIELDS,
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

describe("resolveDefaultSelections", () => {
    it("omits fields both accounts agree on", () => {
        const selection = resolveDefaultSelections(
            makeUser({ phone: "555-1111" }),
            makeUser({ phone: "555-1111" })
        )

        expect(selection.phone).toBeUndefined()
    })

    it("omits fields neither account has", () => {
        const selection = resolveDefaultSelections(
            makeUser({ phone: null }),
            makeUser({ phone: "   " })
        )

        expect(selection.phone).toBeUndefined()
    })

    it("takes the old value when only the old account has one", () => {
        const selection = resolveDefaultSelections(
            makeUser({ phone: "555-1111" }),
            makeUser({ phone: null })
        )

        expect(selection.phone).toBe("old")
    })

    it("keeps the survivor value when both differ", () => {
        const selection = resolveDefaultSelections(
            makeUser({ phone: "555-1111" }),
            makeUser({ phone: "555-2222" })
        )

        expect(selection.phone).toBe("new")
    })

    it("treats false as a real value rather than emptiness", () => {
        // captain_eligible: false is a deliberate decision and must not lose to
        // the other account's true just because it is falsy.
        const selection = resolveDefaultSelections(
            makeUser({ captain_eligible: true }),
            makeUser({ captain_eligible: false })
        )

        expect(selection.captain_eligible).toBe("new")
    })

    it("keeps the earlier createdAt so member-since survives", () => {
        const older = makeUser({ createdAt: new Date("2015-06-01T00:00:00Z") })
        const newer = makeUser({ createdAt: new Date("2026-02-01T00:00:00Z") })

        expect(resolveDefaultSelections(older, newer).createdAt).toBe("old")
        expect(resolveDefaultSelections(newer, older).createdAt).toBe("new")
    })

    it("makes emailVerified and email_status follow the email", () => {
        const selection = resolveDefaultSelections(
            makeUser({
                email: "old@example.com",
                emailVerified: true,
                email_status: "valid"
            }),
            makeUser({
                email: null,
                emailVerified: false,
                email_status: "bounced"
            })
        )

        expect(selection.email).toBe("old")
        expect(selection.emailVerified).toBe("old")
        expect(selection.email_status).toBe("old")
    })

    it("takes old_id from whichever account owns the photo", () => {
        // Photo filenames are {old_id}_{initials}.jpg, so the id and the
        // picture have to arrive together or the photo is orphaned.
        const withPhoto = makeUser({ old_id: 900, picture: "900_JL.jpg" })
        const withoutPhoto = makeUser({ old_id: 12, picture: null })

        const selection = resolveDefaultSelections(withPhoto, withoutPhoto)

        expect(selection.old_id).toBe("old")
        expect(selection.picture).toBe("old")
    })

    it("falls back to the lower old_id when neither account has a photo", () => {
        const selection = resolveDefaultSelections(
            makeUser({ old_id: 4242 }),
            makeUser({ old_id: 9001 })
        )

        expect(selection.old_id).toBe("old")
    })

    it("returns only keys with a real decision behind them", () => {
        const identical = makeUser({ phone: "555-1111" })
        const selection = resolveDefaultSelections(identical, {
            ...identical
        })

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
        expect(isMergeChoice("old")).toBe(true)
        expect(isMergeChoice("new")).toBe(true)
        expect(isMergeChoice("OLD")).toBe(false)
        expect(isMergeChoice(null)).toBe(false)
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
