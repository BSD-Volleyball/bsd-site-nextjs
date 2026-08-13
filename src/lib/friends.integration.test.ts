import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { friendships, week1Rosters } from "@/database/schema"
import { createUser } from "@/test/session"
import {
    createEventTimeSlot,
    createSeason,
    createSeasonEvent,
    createSignup
} from "@/test/factories"
import { getFriendsWithSchedule } from "@/lib/friends"
import { friendScheduleLine } from "@/lib/friends-display"

async function befriend(a: string, b: string) {
    await db.insert(friendships).values({
        requester: a,
        addressee: b,
        status: "accepted",
        responded_at: new Date()
    })
}

describe("getFriendsWithSchedule season context", () => {
    it("marks a signed-up friend with no assignment as signed up", async () => {
        const me = await createUser()
        const friend = await createUser()
        await befriend(me.id, friend.id)
        const season = await createSeason({ phase: "prep_tryout_week_1" })
        await createSignup({ season: season.id, player: friend.id })

        const [entry] = await getFriendsWithSchedule(me.id, season.id)
        expect(entry.signedUpForSeason).toBe(true)
        expect(entry.preseason).toBeNull()
        expect(entry.nextMatch).toBeNull()
        expect(friendScheduleLine(entry)).toBe("Signed up — not scheduled yet")
    })

    it("marks a friend with no signup as not playing this season", async () => {
        const me = await createUser()
        const friend = await createUser()
        await befriend(me.id, friend.id)
        const season = await createSeason({ phase: "prep_tryout_week_1" })

        const [entry] = await getFriendsWithSchedule(me.id, season.id)
        expect(entry.signedUpForSeason).toBe(false)
        expect(friendScheduleLine(entry)).toBe("Not playing this season")
    })

    it("reports a week 1 tryout slot with session, time, and court", async () => {
        const me = await createUser()
        const friend = await createUser()
        await befriend(me.id, friend.id)
        const season = await createSeason({ phase: "prep_tryout_week_1" })
        await createSignup({ season: season.id, player: friend.id })
        const tryout = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: "2026-09-03",
            sort_order: 0
        })
        await createEventTimeSlot(tryout.id, {
            start_time: "18:00",
            sort_order: 0
        })
        await createEventTimeSlot(tryout.id, {
            start_time: "20:00",
            sort_order: 1
        })
        await db.insert(week1Rosters).values({
            season: season.id,
            user: friend.id,
            session_number: 2,
            court_number: 5
        })

        const [entry] = await getFriendsWithSchedule(me.id, season.id)
        expect(entry.preseason).toMatchObject({
            week: 1,
            sessionLabel: "Session 2",
            courtNumber: 5,
            time: "8:00 PM"
        })
        expect(friendScheduleLine(entry)).toContain("Tryout Week 1")
        expect(friendScheduleLine(entry)).toContain("Court 5")
    })

    it("shows the week 1 alternate list without a court", async () => {
        const me = await createUser()
        const friend = await createUser()
        await befriend(me.id, friend.id)
        const season = await createSeason({ phase: "prep_tryout_week_1" })
        await createSignup({ season: season.id, player: friend.id })
        await db.insert(week1Rosters).values({
            season: season.id,
            user: friend.id,
            session_number: 3,
            court_number: 0
        })

        const [entry] = await getFriendsWithSchedule(me.id, season.id)
        expect(entry.preseason).toMatchObject({
            sessionLabel: "Alternate",
            courtNumber: null
        })
        expect(friendScheduleLine(entry)).toContain("Alternate")
    })

    it("ignores preseason rosters outside the tryout phases", async () => {
        const me = await createUser()
        const friend = await createUser()
        await befriend(me.id, friend.id)
        const season = await createSeason({ phase: "regular_season" })
        await createSignup({ season: season.id, player: friend.id })
        await db.insert(week1Rosters).values({
            season: season.id,
            user: friend.id,
            session_number: 1,
            court_number: 2
        })

        const [entry] = await getFriendsWithSchedule(me.id, season.id)
        expect(entry.preseason).toBeNull()
        expect(friendScheduleLine(entry)).toBe("Signed up — not scheduled yet")
    })
})
