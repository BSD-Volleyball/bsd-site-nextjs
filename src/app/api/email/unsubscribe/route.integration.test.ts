import { eq } from "drizzle-orm"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { notificationOptouts } from "@/database/schema"
import { createUnsubscribeToken } from "@/lib/notifications/unsubscribe-token"
import { createUser } from "@/test/session"
import { GET, POST } from "./route"

function requestWithToken(token: string | null, method: "GET" | "POST") {
    const url = new URL("http://localhost:3000/api/email/unsubscribe")
    if (token !== null) url.searchParams.set("token", token)
    return new NextRequest(url, { method })
}

describe("one-click unsubscribe endpoint", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("POST opts the token's user out of the token's type", async () => {
        const user = await createUser()
        const token = createUnsubscribeToken(user.id, "game_reminder_player")

        const response = await POST(requestWithToken(token, "POST"))
        expect(response.status).toBe(200)

        const rows = await db
            .select()
            .from(notificationOptouts)
            .where(eq(notificationOptouts.user_id, user.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].notification_type).toBe("game_reminder_player")
    })

    it("POST is idempotent", async () => {
        const user = await createUser()
        const token = createUnsubscribeToken(user.id, "draft_results")

        expect((await POST(requestWithToken(token, "POST"))).status).toBe(200)
        expect((await POST(requestWithToken(token, "POST"))).status).toBe(200)

        const rows = await db
            .select()
            .from(notificationOptouts)
            .where(eq(notificationOptouts.user_id, user.id))
        expect(rows).toHaveLength(1)
    })

    it("rejects missing, tampered, and mandatory-type tokens", async () => {
        const user = await createUser()

        expect((await POST(requestWithToken(null, "POST"))).status).toBe(400)
        expect(
            (await POST(requestWithToken("garbage.token", "POST"))).status
        ).toBe(400)

        const valid = createUnsubscribeToken(user.id, "draft_results")
        expect((await POST(requestWithToken(`${valid}x`, "POST"))).status).toBe(
            400
        )

        // A signed token for a mandatory type must still be refused.
        const mandatory = createUnsubscribeToken(user.id, "in_season_updates")
        expect((await POST(requestWithToken(mandatory, "POST"))).status).toBe(
            400
        )

        const rows = await db
            .select()
            .from(notificationOptouts)
            .where(eq(notificationOptouts.user_id, user.id))
        expect(rows).toHaveLength(0)
    })

    it("GET applies the opt-out and redirects to the Notifications page", async () => {
        const user = await createUser()
        const token = createUnsubscribeToken(user.id, "tryout_roster")

        const response = await GET(requestWithToken(token, "GET"))
        expect(response.status).toBeGreaterThanOrEqual(300)
        expect(response.status).toBeLessThan(400)
        expect(response.headers.get("location")).toContain(
            "/dashboard/notifications"
        )

        const rows = await db
            .select()
            .from(notificationOptouts)
            .where(eq(notificationOptouts.user_id, user.id))
        expect(rows).toHaveLength(1)
    })
})
