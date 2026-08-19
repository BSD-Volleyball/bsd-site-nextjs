import { expect, test } from "@playwright/test"
import { desc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { randomBytes } from "node:crypto"
import {
    calendarTokens,
    divisions,
    drafts,
    seasons,
    users
} from "@/database/schema"
import { createMatch, createTeam } from "@/test/factories"
import { PERSONAS } from "./helpers"

test.use({ storageState: PERSONAS.player.storageState })

// Put the player persona on a team with a scheduled match so the feed has
// at least one VEVENT to assert on (direct db seeding).
test.beforeAll(async () => {
    const [season] = await db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    const [division] = await db.select().from(divisions).limit(1)
    const [player] = await db
        .select()
        .from(users)
        .where(eq(users.email, PERSONAS.player.email))
    const [captain] = await db
        .select()
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))

    const [existing] = await db
        .select()
        .from(drafts)
        .where(eq(drafts.user, player.id))
    if (existing) return

    const team = await createTeam({
        season: season.id,
        division: division.id,
        captain: captain.id,
        name: "Calendar Crew",
        number: 1
    })
    await db.insert(drafts).values([
        { team: team.id, user: captain.id, round: 1, overall: 1 },
        { team: team.id, user: player.id, round: 2, overall: 2 }
    ])
    await createMatch({
        season: season.id,
        division: division.id,
        week: 1,
        date: "2026-09-19",
        time: "19:00",
        court: 1,
        home_team: team.id
    })
})

test("the season schedule calendar feed returns valid iCal", async ({
    request
}) => {
    const response = await request.get("/dashboard/season-schedule/calendar")
    expect(response.ok()).toBeTruthy()

    const body = await response.text()
    expect(body).toContain("BEGIN:VCALENDAR")
    expect(body).toContain("TZID:America/New_York")
    expect(body).toContain("BEGIN:VEVENT")
    expect(body.trim().endsWith("END:VCALENDAR")).toBe(true)
})

test("the friends calendar download returns valid iCal", async ({
    request
}) => {
    const response = await request.get(
        "/dashboard/season-schedule/calendar?kind=friends"
    )
    expect(response.ok()).toBeTruthy()
    expect(response.headers()["content-disposition"]).toContain("bsd-friends-")

    const body = await response.text()
    expect(body).toContain("BEGIN:VCALENDAR")
    expect(body).toContain("X-WR-CALNAME:BSD Volleyball — Friends")
    // The player is on the team, so their own match shows up in the slot.
    expect(body).toContain("BEGIN:VEVENT")
})

test("the public subscription feed serves the same calendar by token", async ({
    request
}) => {
    // Subscription URLs are minted from the signed-in session; here the
    // token row is seeded directly (calendar-token.ts is server-only) and
    // then fetched with no cookies at all — the token is the whole credential.
    const [player] = await db
        .select()
        .from(users)
        .where(eq(users.email, PERSONAS.player.email))
    const token = randomBytes(32).toString("base64url")
    await db
        .insert(calendarTokens)
        .values({ user_id: player.id, token })
        .onConflictDoUpdate({
            target: calendarTokens.user_id,
            set: { token }
        })

    const response = await request.get(`/api/calendar/${token}/personal.ics`, {
        headers: { cookie: "" }
    })
    expect(response.ok()).toBeTruthy()
    expect(response.headers()["content-type"]).toContain("text/calendar")
    const body = await response.text()
    expect(body).toContain("BEGIN:VEVENT")

    const bad = await request.get(
        `/api/calendar/${"x".repeat(43)}/personal.ics`
    )
    expect(bad.status()).toBe(404)
})
