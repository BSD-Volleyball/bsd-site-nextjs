import { expect, request, test as setup } from "@playwright/test"
import { inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"
import { db } from "@/database/db"
import { userRoles, users } from "@/database/schema"
import {
    createDivision,
    createEventTimeSlot,
    createSeason,
    createSeasonEvent,
    createWaiver
} from "@/test/factories"
import { PERSONAS } from "../helpers"

// Runs once before the chromium project: resets the bsd_e2e database from
// the repo migrations, seeds a baseline season, creates the personas
// through the REAL better-auth signup endpoint (its only full-stack
// coverage), and saves their signed-in storage states.

setup("reset database, seed baseline, create personas", async () => {
    setup.setTimeout(180_000)

    const client = new Client({
        connectionString: process.env.E2E_DATABASE_URL
    })
    await client.connect()
    try {
        await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE")
        await client.query("DROP SCHEMA IF EXISTS public CASCADE")
        await client.query("CREATE SCHEMA public")
        await migrate(drizzle(client), { migrationsFolder: "migrations" })
    } finally {
        await client.end()
    }

    // Baseline data: current season with tryout + regular-season events,
    // one division, and a published waiver.
    const season = await createSeason()
    await createDivision({ name: "AA", level: 1 })
    const tryout = await createSeasonEvent(season.id, {
        event_type: "tryout",
        event_date: "2026-09-05"
    })
    await createEventTimeSlot(tryout.id, { start_time: "18:00" })
    for (const [i, date] of ["2026-09-19", "2026-09-26"].entries()) {
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: date,
            sort_order: i
        })
    }
    await createWaiver({ content: "E2E waiver terms", active: true })

    // Personas via the real signup endpoint (exercises better-auth + BotID)
    for (const persona of Object.values(PERSONAS)) {
        const api = await request.newContext({
            baseURL: process.env.E2E_BASE_URL
        })
        const response = await api.post("/api/auth/sign-up/email", {
            data: {
                email: persona.email,
                password: persona.password,
                name: `${persona.firstName} ${persona.lastName}`,
                first_name: persona.firstName,
                last_name: persona.lastName
            }
        })
        expect(
            response.ok(),
            `signup for ${persona.email}: ${response.status()} ${await response.text()}`
        ).toBeTruthy()
        await api.storageState({ path: persona.storageState })
        await api.dispose()
    }

    // Roles and onboarding flags via SQL — user_roles is the sole authority
    const personaRows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
            inArray(
                users.email,
                Object.values(PERSONAS).map((p) => p.email)
            )
        )
    const idByEmail = new Map(personaRows.map((row) => [row.email, row.id]))

    const adminId = idByEmail.get(PERSONAS.admin.email)
    const captainId = idByEmail.get(PERSONAS.captain.email)
    if (!adminId || !captainId) {
        throw new Error("Persona users were not created")
    }

    await db
        .update(users)
        .set({ onboarding_completed: true })
        .where(
            inArray(
                users.id,
                personaRows.map((row) => row.id)
            )
        )
    await db.insert(userRoles).values([
        { user_id: adminId, role: "admin" },
        { user_id: captainId, role: "captain", season_id: season.id }
    ])
})
