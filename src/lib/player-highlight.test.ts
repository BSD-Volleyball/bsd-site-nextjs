import { describe, expect, it } from "vitest"
import {
    getPlayerHighlight,
    playerHighlightClass,
    PLAYER_HIGHLIGHT_CLASSES
} from "@/lib/player-highlight"

describe("getPlayerHighlight", () => {
    it("marks the viewer as self", () => {
        expect(getPlayerHighlight("u1", "u1", ["u2"])).toBe("self")
    })

    it("marks an accepted friend as friend", () => {
        expect(getPlayerHighlight("u2", "u1", ["u2", "u3"])).toBe("friend")
        expect(getPlayerHighlight("u2", "u1", new Set(["u2"]))).toBe("friend")
    })

    it("returns null for everyone else", () => {
        expect(getPlayerHighlight("u9", "u1", ["u2"])).toBeNull()
        expect(getPlayerHighlight("u9", undefined, undefined)).toBeNull()
        expect(getPlayerHighlight("u9", "u1", [])).toBeNull()
    })

    it("self wins even if the viewer appears in the friend list", () => {
        expect(getPlayerHighlight("u1", "u1", ["u1"])).toBe("self")
    })
})

describe("playerHighlightClass", () => {
    it("returns the tier classes when highlighted", () => {
        expect(playerHighlightClass("self", "base")).toBe(
            PLAYER_HIGHLIGHT_CLASSES.self
        )
        expect(playerHighlightClass("friend", "base")).toBe(
            PLAYER_HIGHLIGHT_CLASSES.friend
        )
    })

    it("returns the fallback when not highlighted", () => {
        expect(playerHighlightClass(null, "base")).toBe("base")
    })

    it("keeps self bold and friend regular, in distinct hues", () => {
        expect(PLAYER_HIGHLIGHT_CLASSES.self).toContain("font-semibold")
        expect(PLAYER_HIGHLIGHT_CLASSES.friend).not.toContain("font-semibold")
        expect(PLAYER_HIGHLIGHT_CLASSES.self).toContain("bg-orange-")
        expect(PLAYER_HIGHLIGHT_CLASSES.friend).toContain("bg-primary/")
    })
})
