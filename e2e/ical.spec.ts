import { expect, test } from "@playwright/test"
import { desc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { divisions, drafts, seasons, users } from "@/database/schema"
import { createMatch, createTeam } from "@/test/factories"
import { PERSONAS } from "./helpers"

test.use({ storageState: PERSONAS.player.storageState })

// The feed requires the caller to be drafted onto a team, so put the player
// persona on one with a scheduled match first (direct db seeding).
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
