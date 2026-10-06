import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { proxy } from "./proxy"

// better-auth's default (non-secure) cookie name; getSessionCookie only
// checks presence, so any value works.
const SESSION_COOKIE = "better-auth.session_token=abc"

function request(path: string, cookie?: string): NextRequest {
    return new NextRequest(`http://localhost:3000${path}`, {
        headers: cookie ? { cookie } : {}
    })
}

describe("proxy", () => {
    it("sends a signed-in visitor from the homepage to the dashboard", async () => {
        const res = await proxy(request("/", SESSION_COOKIE))
        expect(res.status).toBe(307)
        expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
            "/dashboard"
        )
    })

    it("lets a signed-in visitor stay on the homepage with ?stay=1", async () => {
        const res = await proxy(request("/?stay=1", SESSION_COOKIE))
        expect(res.headers.get("location")).toBeNull()
    })

    it("serves the homepage to a logged-out visitor", async () => {
        const res = await proxy(request("/"))
        expect(res.headers.get("location")).toBeNull()
    })

    it("still sends a logged-out visitor on a dashboard page to sign-in", async () => {
        const res = await proxy(request("/dashboard/rosters?week=2"))
        expect(res.status).toBe(307)
        const location = new URL(res.headers.get("location") ?? "")
        expect(location.pathname).toBe("/auth/sign-in")
        expect(location.searchParams.get("redirectTo")).toBe(
            "/dashboard/rosters?week=2"
        )
    })

    it("keeps every query parameter of the page in redirectTo", async () => {
        const res = await proxy(request("/dashboard/rosters?week=2&division=3"))
        const location = new URL(res.headers.get("location") ?? "")
        expect(location.searchParams.get("redirectTo")).toBe(
            "/dashboard/rosters?week=2&division=3"
        )
        expect(location.searchParams.get("division")).toBeNull()
    })
})
