import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    coveragePresence,
    drafts,
    individual_divisions,
    matchReferees,
    teams,
    userUnavailability
} from "@/database/schema"
import {
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { sentMessages } from "@/test/email"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import { sendCoverageDigestForDate } from "@/lib/notifications/coverage-digest"
import { addPresence, getCoverageView, removePresence } from "./actions"

const DATE = "2099-10-06"
const DATE2 = "2099-10-13"

/**
 * A newest season with two regular-season nights. Night 1 has matches at
 * 19:00, 20:00, 21:00; night 2 has one match at 19:00 with a null date on
 * the row (resolved from the week-2 event).
 */
async function seedSeason() {
    const season = await createSeason()
    const division = await createDivision()
    const event1 = await createSeasonEvent(season.id, {
        event_type: "regular_season",
        event_date: DATE,
        sort_order: 0
    })
    const event2 = await createSeasonEvent(season.id, {
        event_type: "regular_season",
        event_date: DATE2,
        sort_order: 1
    })
    const captain = await createUser()
    const home = await createTeam({
        season: season.id,
        captain: captain.id,
        division: division.id,
        name: "Home"
    })
    const away = await createTeam({
        season: season.id,
        captain: captain.id,
        division: division.id,
        name: "Away"
    })
    const m19 = await createMatch({
        season: season.id,
        division: division.id,
        week: 1,
        date: DATE,
        time: "19:00:00",
        home_team: home.id,
        away_team: away.id
    })
    await createMatch({
        season: season.id,
        division: division.id,
        week: 1,
        date: DATE,
        time: "20:00:00",
        home_team: home.id,
        away_team: away.id
    })
    await createMatch({
        season: season.id,
        division: division.id,
        week: 1,
        date: DATE,
        time: "21:00:00",
        home_team: home.id,
        away_team: away.id
    })
    await createMatch({
        season: season.id,
        division: division.id,
        week: 2,
        date: null,
        time: "19:00:00",
        home_team: home.id,
        away_team: away.id
    })
    return { season, division, event1, event2, home, away, m19 }
}

describe("getCoverageView", () => {
    it("rejects unauthenticated callers", async () => {
        logout()
        expect(await getCoverageView()).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("rejects non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        expect(await getCoverageView()).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("derives slots, play/ref sources and status for an admin", async () => {
        const s = await seedSeason()
        const admin = await createUserWithRoles([{ role: "admin" }], {
            first_name: "Ada",
            last_name: "Admin"
        })
        await db
            .insert(drafts)
            .values({ team: s.home.id, user: admin.id, round: 1, overall: 1 })
        await db.insert(matchReferees).values({
            match_id: s.m19.id,
            referee_id: admin.id,
            season_id: s.season.id,
            role: "primary"
        })

        const result = await getCoverageView()
        expect(result.status).toBe(true)
        if (!result.status) return
        const night1 = result.data.dates.find((d) => d.date === DATE)
        const night2 = result.data.dates.find((d) => d.date === DATE2)
        expect(night1?.slots.map((x) => x.startTime)).toEqual([
            "19:00:00",
            "20:00:00",
            "21:00:00"
        ])
        // Ada plays every match (rostered on Home) and refs the 19:00 one.
        expect(night1?.slots[0].people[0]).toMatchObject({
            userId: admin.id,
            name: "Ada Admin",
            counts: true,
            sources: ["play", "ref"]
        })
        expect(night1?.status).toBe("green")
        // Week 2's match had a null date and resolved from the event.
        expect(night2?.slots.map((x) => x.startTime)).toEqual(["19:00:00"])
        expect(night2?.status).toBe("green")
        expect(result.data.pool.map((a) => a.userId)).toContain(admin.id)
    })

    it("derives coaching for an admin who is captain of a coached team", async () => {
        const admin = await createUserWithRoles([{ role: "admin" }], {
            first_name: "Cody",
            last_name: "Coach"
        })
        const s = await seedSeason()
        await db.insert(individual_divisions).values({
            season: s.season.id,
            division: s.division.id,
            coaches: true,
            gender_split: "coed",
            teams: 2
        })
        await db
            .update(teams)
            .set({ captain: admin.id })
            .where(eq(teams.id, s.home.id))

        const result = await getCoverageView()
        expect(result.status).toBe(true)
        if (!result.status) return
        const night1 = result.data.dates.find((d) => d.date === DATE)
        // The Away team's throwaway captain also coaches but is outside the
        // admin/leadership pool, so only the admin appears.
        expect(night1?.slots[0].people).toHaveLength(1)
        expect(night1?.slots[0].people[0]).toMatchObject({
            userId: admin.id,
            sources: ["coach"],
            counts: true
        })
        expect(night1?.status).toBe("green")
    })

    it("flags unavailable admins and excludes them from coverage", async () => {
        const s = await seedSeason()
        const admin = await createUserWithRoles([{ role: "admin" }])
        await db
            .insert(drafts)
            .values({ team: s.home.id, user: admin.id, round: 1, overall: 1 })
        await db
            .insert(userUnavailability)
            .values({ user_id: admin.id, event_id: s.event1.id })

        const result = await getCoverageView()
        if (!result.status) throw new Error(result.message)
        const night1 = result.data.dates.find((d) => d.date === DATE)
        expect(night1?.slots[0].people[0]).toMatchObject({
            userId: admin.id,
            counts: false,
            unavailable: true
        })
        expect(night1?.status).toBe("red")
    })

    it("manual presence overrides unavailability", async () => {
        const s = await seedSeason()
        const admin = await createUserWithRoles([{ role: "admin" }])
        await db
            .insert(drafts)
            .values({ team: s.home.id, user: admin.id, round: 1, overall: 1 })
        await db
            .insert(userUnavailability)
            .values({ user_id: admin.id, event_id: s.event1.id })
        const add = await addPresence({
            userId: admin.id,
            date: DATE,
            slotTimes: ["19:00:00", "20:00:00", "21:00:00"],
            note: "injured, covering"
        })
        expect(add.status).toBe(true)

        const result = await getCoverageView()
        if (!result.status) throw new Error(result.message)
        const night1 = result.data.dates.find((d) => d.date === DATE)
        expect(night1?.slots[0].people[0]).toMatchObject({
            userId: admin.id,
            counts: true,
            unavailable: true,
            sources: ["play", "present"]
        })
        expect(night1?.status).toBe("green")
    })

    it("lists leadership members without counting them", async () => {
        const s = await seedSeason()
        const lead = await createUser({ first_name: "Lee", last_name: "Lead" })
        await db
            .insert(drafts)
            .values({ team: s.home.id, user: lead.id, round: 1, overall: 1 })
        const { userRoles } = await import("@/database/schema")
        await db
            .insert(userRoles)
            .values({ user_id: lead.id, role: "leadership_group" })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getCoverageView()
        if (!result.status) throw new Error(result.message)
        const night1 = result.data.dates.find((d) => d.date === DATE)
        expect(night1?.slots[0].people[0]).toMatchObject({
            userId: lead.id,
            isLeadership: true,
            counts: false
        })
        expect(night1?.status).toBe("red")
    })

    it("lists leadership members in the presence pool", async () => {
        await seedSeason()
        const { userRoles } = await import("@/database/schema")
        const lead = await createUser({ first_name: "Lee", last_name: "Lead" })
        await db
            .insert(userRoles)
            .values({ user_id: lead.id, role: "leadership_group" })
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await getCoverageView()
        if (!result.status) throw new Error(result.message)
        expect(result.data.pool).toContainEqual(
            expect.objectContaining({ userId: lead.id, isLeadership: true })
        )
        expect(result.data.pool).toContainEqual(
            expect.objectContaining({ userId: admin.id, isLeadership: false })
        )
    })
})

describe("addPresence / removePresence", () => {
    it("rejects non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        expect(
            await addPresence({
                userId: "x",
                date: DATE,
                slotTimes: ["19:00:00"]
            })
        ).toEqual({ status: false, message: "Unauthorized." })
        expect(await removePresence({ id: 1 })).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("adds one row per slot and merges into the view", async () => {
        await seedSeason()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const add = await addPresence({
            userId: admin.id,
            date: DATE,
            slotTimes: ["19:00:00", "21:00:00"],
            note: "setup + cleanup"
        })
        expect(add.status).toBe(true)

        const rows = await db
            .select()
            .from(coveragePresence)
            .where(eq(coveragePresence.user_id, admin.id))
        expect(rows.map((r) => r.slot_time).sort()).toEqual([
            "19:00:00",
            "21:00:00"
        ])
        expect(rows[0].created_by).toBe(admin.id)

        const view = await getCoverageView()
        if (!view.status) throw new Error(view.message)
        const night1 = view.data.dates.find((d) => d.date === DATE)
        expect(night1?.status).toBe("yellow")
        expect(night1?.slots[0].people[0]).toMatchObject({
            userId: admin.id,
            sources: ["present"],
            note: "setup + cleanup",
            presenceId: rows.find((r) => r.slot_time === "19:00:00")?.id
        })

        const remove = await removePresence({ id: rows[0].id })
        expect(remove.status).toBe(true)
        const after = await db
            .select()
            .from(coveragePresence)
            .where(eq(coveragePresence.user_id, admin.id))
        expect(after).toHaveLength(1)
    })

    it("adds presence for a leadership member and they count", async () => {
        await seedSeason()
        const { userRoles } = await import("@/database/schema")
        const lead = await createUser({ first_name: "Lee", last_name: "Lead" })
        await db
            .insert(userRoles)
            .values({ user_id: lead.id, role: "leadership_group" })
        await createUserWithRoles([{ role: "admin" }])

        const add = await addPresence({
            userId: lead.id,
            date: DATE,
            slotTimes: ["19:00:00", "20:00:00", "21:00:00"]
        })
        expect(add.status).toBe(true)

        const view = await getCoverageView()
        if (!view.status) throw new Error(view.message)
        const night1 = view.data.dates.find((d) => d.date === DATE)
        expect(night1?.status).toBe("green")
        expect(night1?.slots[0].people[0]).toMatchObject({
            userId: lead.id,
            counts: true,
            isLeadership: true,
            sources: ["present"]
        })
    })

    it("is idempotent on duplicate adds", async () => {
        await seedSeason()
        const admin = await createUserWithRoles([{ role: "admin" }])
        await addPresence({
            userId: admin.id,
            date: DATE,
            slotTimes: ["19:00"]
        })
        await addPresence({
            userId: admin.id,
            date: DATE,
            slotTimes: ["19:00:00"]
        })
        const rows = await db
            .select()
            .from(coveragePresence)
            .where(eq(coveragePresence.user_id, admin.id))
        expect(rows).toHaveLength(1)
    })

    it("rejects a past date, a non-slot time, and a non-admin target", async () => {
        const s = await seedSeason()
        const admin = await createUserWithRoles([{ role: "admin" }])
        const captain = await createUser()

        expect(
            await addPresence({
                userId: admin.id,
                date: "2001-01-01",
                slotTimes: ["19:00:00"]
            })
        ).toMatchObject({ status: false })
        expect(
            await addPresence({
                userId: admin.id,
                date: DATE,
                slotTimes: ["18:30:00"]
            })
        ).toMatchObject({ status: false })
        expect(
            await addPresence({
                userId: captain.id,
                date: DATE,
                slotTimes: ["19:00:00"]
            })
        ).toMatchObject({ status: false })
        expect(s.event1.id).toBeGreaterThan(0)
    })
})

describe("sendCoverageDigestForDate", () => {
    it("emails every admin once and is a no-op on the second call", async () => {
        await seedSeason()
        const admin = await createUserWithRoles([{ role: "admin" }])
        const before = sentMessages().length

        const first = await sendCoverageDigestForDate(DATE)
        expect(first.status).toBe("red")
        expect(first.sent).toBeGreaterThanOrEqual(1)
        const mine = sentMessages()
            .slice(before)
            .filter((m) => m.to.toLowerCase() === admin.email.toLowerCase())
        expect(mine).toHaveLength(1)
        expect(mine[0].subject).toContain("[RED] Coverage for")
        expect(mine[0].htmlBody).toContain("nobody")

        const second = await sendCoverageDigestForDate(DATE)
        expect(second.sent).toBe(0)
        expect(second.skipped).toBeGreaterThanOrEqual(1)
    })

    it("also emails a leadership member who is covering a slot, not one merely playing", async () => {
        const s = await seedSeason()
        const { userRoles } = await import("@/database/schema")
        const covering = await createUser({
            first_name: "Cov",
            last_name: "Lead"
        })
        const playing = await createUser({
            first_name: "Play",
            last_name: "Lead"
        })
        await db.insert(userRoles).values([
            { user_id: covering.id, role: "leadership_group" },
            { user_id: playing.id, role: "leadership_group" }
        ])
        await db.insert(drafts).values({
            team: s.home.id,
            user: playing.id,
            round: 1,
            overall: 1
        })
        const admin = await createUserWithRoles([{ role: "admin" }])
        await db.insert(coveragePresence).values({
            user_id: covering.id,
            event_date: DATE,
            slot_time: "21:00:00",
            created_by: admin.id
        })
        const before = sentMessages().length

        const r = await sendCoverageDigestForDate(DATE)
        expect(r.sent).toBeGreaterThanOrEqual(2)
        const to = sentMessages()
            .slice(before)
            .map((m) => m.to.toLowerCase())
        expect(to).toContain(admin.email.toLowerCase())
        expect(to).toContain(covering.email.toLowerCase())
        expect(to).not.toContain(playing.email.toLowerCase())

        const mine = sentMessages()
            .slice(before)
            .find((m) => m.to.toLowerCase() === covering.email.toLowerCase())
        expect(mine?.htmlBody).toContain("Cleanup")
        expect(mine?.htmlBody).toMatch(/Cleanup[\s\S]*Cov Lead/)
    })

    it("sends nothing for a date with no matches", async () => {
        await seedSeason()
        await createUserWithRoles([{ role: "admin" }])
        const before = sentMessages().length
        const r = await sendCoverageDigestForDate("2099-12-25")
        expect(r).toMatchObject({ status: null, sent: 0 })
        expect(sentMessages().length).toBe(before)
    })
})
