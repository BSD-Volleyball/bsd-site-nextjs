import { afterEach, describe, expect, it } from "vitest"
import {
    buildPlayerPictureUrl,
    cn,
    formatPlayerName,
    requireEnv,
    serializeCsvField,
    splitByGender
} from "@/lib/utils"

describe("cn", () => {
    it("merges conditional classes and resolves tailwind conflicts", () => {
        expect(cn("p-2", "p-4")).toBe("p-4")
        expect(cn("text-sm", false && "hidden", "font-bold")).toBe(
            "text-sm font-bold"
        )
    })
})

describe("requireEnv", () => {
    afterEach(() => {
        delete process.env.TEST_REQUIRE_ENV_VAR
    })

    it("returns the value when set", () => {
        process.env.TEST_REQUIRE_ENV_VAR = "hello"
        expect(requireEnv("TEST_REQUIRE_ENV_VAR")).toBe("hello")
    })

    it("throws a descriptive error when missing or empty", () => {
        expect(() => requireEnv("TEST_REQUIRE_ENV_VAR")).toThrow(
            /TEST_REQUIRE_ENV_VAR/
        )
        process.env.TEST_REQUIRE_ENV_VAR = ""
        expect(() => requireEnv("TEST_REQUIRE_ENV_VAR")).toThrow()
    })
})

describe("formatPlayerName", () => {
    it("formats first and last name", () => {
        expect(formatPlayerName("Jordan", "Lee")).toBe("Jordan Lee")
    })

    it("inserts the preferred name in parentheses", () => {
        expect(formatPlayerName("Jordan", "Lee", "JJ")).toBe("Jordan (JJ) Lee")
    })

    it("ignores null and empty preferred names", () => {
        expect(formatPlayerName("Jordan", "Lee", null)).toBe("Jordan Lee")
        expect(formatPlayerName("Jordan", "Lee", "")).toBe("Jordan Lee")
    })
})

describe("splitByGender", () => {
    it("treats only explicit true as male; null/undefined/false are non-male", () => {
        const players = [
            { id: 1, male: true },
            { id: 2, male: false },
            { id: 3, male: null },
            { id: 4 }
        ]
        const { males, nonMales } = splitByGender(players)
        expect(males.map((p) => p.id)).toEqual([1])
        expect(nonMales.map((p) => p.id)).toEqual([2, 3, 4])
    })
})

describe("buildPlayerPictureUrl", () => {
    it("returns empty string for a missing path", () => {
        expect(buildPlayerPictureUrl("https://cdn.test", null)).toBe("")
    })

    it("passes through absolute URLs untouched", () => {
        expect(
            buildPlayerPictureUrl("https://cdn.test", "https://elsewhere/x.jpg")
        ).toBe("https://elsewhere/x.jpg")
    })

    it("joins base and path regardless of slashes", () => {
        expect(buildPlayerPictureUrl("https://cdn.test", "pics/a.jpg")).toBe(
            "https://cdn.test/pics/a.jpg"
        )
        expect(buildPlayerPictureUrl("https://cdn.test/", "/pics/a.jpg")).toBe(
            "https://cdn.test/pics/a.jpg"
        )
    })

    it("returns the bare path when no base is configured", () => {
        expect(buildPlayerPictureUrl("", "pics/a.jpg")).toBe("pics/a.jpg")
    })
})

describe("serializeCsvField", () => {
    it("serializes null and undefined as empty", () => {
        expect(serializeCsvField(null)).toBe("")
        expect(serializeCsvField(undefined)).toBe("")
    })

    it("leaves plain values unquoted", () => {
        expect(serializeCsvField("hello")).toBe("hello")
        expect(serializeCsvField(42)).toBe("42")
    })

    it("quotes values containing commas, quotes, or newlines", () => {
        expect(serializeCsvField("a,b")).toBe('"a,b"')
        expect(serializeCsvField('say "hi"')).toBe('"say ""hi"""')
        expect(serializeCsvField("line1\nline2")).toBe('"line1\nline2"')
    })
})
