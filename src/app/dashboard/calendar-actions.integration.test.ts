import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, calendarTokens } from "@/database/schema"
import { findUserIdByCalendarToken } from "@/lib/calendar-token"
import { createUserWithRoles, logout } from "@/test/session"
import { getCalendarLinks, resetCalendarToken } from "./calendar-actions"

describe("getCalendarLinks", () => {
    it("requires a session", async () => {
        logout()
        const result = await getCalendarLinks()
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("mints one token lazily and returns the same links on repeat calls", async () => {
        const user = await createUserWithRoles([])

        const first = await getCalendarLinks()
        expect(first.status).toBe(true)
        if (!first.status) return
        expect(first.data.personal.url).toMatch(
            /^https?:\/\/.+\/api\/calendar\/[A-Za-z0-9_-]{43}\/personal\.ics$/
        )
        expect(first.data.friends.url).toMatch(/\/friends\.ics$/)
        expect(first.data.personal.webcalUrl.startsWith("webcal://")).toBe(true)

        const second = await getCalendarLinks()
        expect(second).toEqual(first)

        const rows = await db
            .select()
            .from(calendarTokens)
            .where(eq(calendarTokens.user_id, user.id))
        expect(rows).toHaveLength(1)
        expect(await findUserIdByCalendarToken(rows[0].token)).toBe(user.id)
    })
})

describe("resetCalendarToken", () => {
    it("requires a session", async () => {
        logout()
        const result = await resetCalendarToken()
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("rotates the token, invalidating the old one, and audits it", async () => {
        const user = await createUserWithRoles([])
        const before = await getCalendarLinks()
        if (!before.status) throw new Error("setup failed")
        const [{ token: oldToken }] = await db
            .select({ token: calendarTokens.token })
            .from(calendarTokens)
            .where(eq(calendarTokens.user_id, user.id))

        const result = await resetCalendarToken()
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.personal.url).not.toBe(before.data.personal.url)
        expect(result.message).toMatch(/reset/i)

        expect(await findUserIdByCalendarToken(oldToken)).toBeNull()
        const [row] = await db
            .select()
            .from(calendarTokens)
            .where(eq(calendarTokens.user_id, user.id))
        expect(row.token).not.toBe(oldToken)
        expect(row.rotated_at).not.toBeNull()
        expect(await findUserIdByCalendarToken(row.token)).toBe(user.id)

        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.action, "reset_calendar_token"))
        expect(audit).toHaveLength(1)
        expect(audit[0].user).toBe(user.id)
    })

    it("works even when no token existed yet", async () => {
        const user = await createUserWithRoles([])
        const result = await resetCalendarToken()
        expect(result.status).toBe(true)
        const rows = await db
            .select()
            .from(calendarTokens)
            .where(eq(calendarTokens.user_id, user.id))
        expect(rows).toHaveLength(1)
    })
})
