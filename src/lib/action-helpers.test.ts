import { describe, expect, it, vi } from "vitest"

// action-helpers transitively imports @/lib/auth, which boots better-auth at
// module load. Stub it: these tests exercise the pure helpers plus
// requireSession's null-session path.
vi.mock("@/lib/auth", () => ({
    auth: { api: { getSession: vi.fn(async () => null) } }
}))
vi.mock("next/headers", () => ({
    headers: async () => new Headers()
}))

import {
    ActionError,
    fail,
    ok,
    requireNonEmptyString,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/lib/action-helpers"

describe("ok / fail", () => {
    it("builds success results with optional data and message", () => {
        expect(ok()).toEqual({
            status: true,
            data: undefined,
            message: undefined
        })
        expect(ok({ id: 1 }, "Saved.")).toEqual({
            status: true,
            data: { id: 1 },
            message: "Saved."
        })
    })

    it("builds failure results", () => {
        expect(fail("Nope.")).toEqual({ status: false, message: "Nope." })
    })
})

describe("requireSession", () => {
    it("throws ActionError when there is no session", async () => {
        await expect(requireSession()).rejects.toThrow("Not authenticated.")
        await expect(requireSession()).rejects.toBeInstanceOf(ActionError)
    })
})

describe("requirePositiveInt", () => {
    it("accepts positive integers and numeric strings", () => {
        expect(requirePositiveInt(5)).toBe(5)
        expect(requirePositiveInt("7")).toBe(7)
    })

    it.each([
        0,
        -1,
        1.5,
        "abc",
        null,
        undefined,
        Number.NaN
    ])("rejects %s", (value) => {
        expect(() => requirePositiveInt(value, "season ID")).toThrow(
            "Invalid season ID."
        )
    })
})

describe("requireNonEmptyString", () => {
    it("trims and returns valid strings", () => {
        expect(requireNonEmptyString("  hello  ", "name")).toBe("hello")
    })

    it.each(["", "   ", 42, null, undefined])("rejects %s", (value) => {
        expect(() => requireNonEmptyString(value, "Name")).toThrow(
            "Name is required."
        )
    })
})

describe("withAction", () => {
    it("passes through successful results and arguments", async () => {
        const action = withAction(async (a: number, b: number) => ok(a + b))
        expect(await action(2, 3)).toEqual({
            status: true,
            data: 5,
            message: undefined
        })
    })

    it("converts ActionError into a fail result", async () => {
        const action = withAction(async () => {
            throw new ActionError("Unauthorized.")
        })
        expect(await action()).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("hides unexpected errors behind a generic message", async () => {
        const consoleSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {})
        const action = withAction(async () => {
            throw new Error("database exploded: secret details")
        })

        const result = await action()
        expect(result).toEqual({
            status: false,
            message: "Something went wrong."
        })
        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
    })
})
