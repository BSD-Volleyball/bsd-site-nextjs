import { describe, expect, it } from "vitest"
import { safeRedirectPath } from "./safe-redirect"

const ORIGIN = "https://league.example"

describe("safeRedirectPath", () => {
    it.each([
        ["/dashboard", "/dashboard"],
        [
            "/dashboard/pay-season?step=2#top",
            "/dashboard/pay-season?step=2#top"
        ],
        ["/onboarding/account", "/onboarding/account"],
        ["https://league.example/dashboard/rosters", "/dashboard/rosters"]
    ])("keeps same-origin target %s", (target, expected) => {
        expect(safeRedirectPath(target, ORIGIN)).toBe(expected)
    })

    it.each([
        "https://evil.example/login",
        "//evil.example/login",
        "/\\evil.example/login",
        "\\\\evil.example",
        "/\t/evil.example",
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "http://league.example/dashboard",
        ""
    ])("rejects %s", (target) => {
        expect(safeRedirectPath(target, ORIGIN)).toBe("/dashboard")
    })

    it("uses the supplied fallback", () => {
        expect(safeRedirectPath(null, ORIGIN, "/")).toBe("/")
    })
})
