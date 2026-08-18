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
import { getFriendsWithSchedule, listFriendIds } from "@/lib/friends"
import { friendScheduleLine } from "@/lib/friends-display"

async function befriend(a: string, b: string) {
    await db.insert(friendships).values({
        requester: a,
        addressee: b,
        status: "accepted",
        responded_at: new Date()
    })
}

describe("getFriendsWithSchedule ordering and names", () => {
    it("puts the soonest tryout slot first and sorts the rest by surname", async () => {
        const me = await createUser()
        const season = await createSeason({ phase: "prep_tryout_week_1" })
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

        // Late session, early session, and two unscheduled friends whose
        // surnames are deliberately out of alphabetical order.
        const late = await createUser({ first_name: "Late", last_name: "Aaa" })
        const early = await createUser({
            first_name: "Early",
            last_name: "Zzz"
        })
        const unscheduledZ = await createUser({
            first_name: "Un",
            last_name: "Wilson"
        })
        const unscheduledA = await createUser({
            first_name: "Un",
            last_name: "Adams"
        })
        for (const friend of [late, early, unscheduledZ, unscheduledA]) {
            await befriend(me.id, friend.id)
        }
        await db.insert(week1Rosters).values([
            {
                season: season.id,
                user: late.id,
                session_number: 2,
                court_number: 1
            },
            {
                season: season.id,
                user: early.id,
                session_number: 1,
                court_number: 2
            }
        ])

        const entries = await getFriendsWithSchedule(me.id, season.id)
        expect(entries.map((e) => e.userId)).toEqual([
            early.id,
            late.id,
            unscheduledA.id,
            unscheduledZ.id
        ])
    })

    it("names friends as Preferred Last", async () => {
        const me = await createUser()
        const friend = await createUser({
            first_name: "Jonathan",
            last_name: "Lukens",
            preferred_name: "Josh"
        })
        await befriend(me.id, friend.id)
        const season = await createSeason()

        const [entry] = await getFriendsWithSchedule(me.id, season.id)
        expect(entry.name).toBe("Josh Lukens")
        expect(entry.lastName).toBe("Lukens")
    })

    it("falls back to the first name when there is no preferred name", async () => {
        const me = await createUser()
        const friend = await createUser({
            first_name: "Dana",
            last_name: "Reyes",
            preferred_name: null
        })
        await befriend(me.id, friend.id)
        const season = await createSeason()

        const [entry] = await getFriendsWithSchedule(me.id, season.id)
        expect(entry.name).toBe("Dana Reyes")
    })
})

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

describe("listFriendIds", () => {
    it("returns accepted friends in either direction and nothing else", async () => {
        const me = await createUser()
        const requestedByMe = await createUser()
        const requestedMe = await createUser()
        const pending = await createUser()
        const declined = await createUser()
        const stranger = await createUser()

        await befriend(me.id, requestedByMe.id)
        await befriend(requestedMe.id, me.id)
        await db.insert(friendships).values([
            { requester: me.id, addressee: pending.id, status: "pending" },
            {
                requester: declined.id,
                addressee: me.id,
                status: "declined",
                responded_at: new Date()
            },
            // A friendship I'm not part of must not leak in.
            {
                requester: pending.id,
                addressee: stranger.id,
                status: "accepted",
                responded_at: new Date()
            }
        ])

        const ids = await listFriendIds(me.id)
        expect(ids.sort()).toEqual([requestedByMe.id, requestedMe.id].sort())
    })

    it("is empty for a user with no friends", async () => {
        const me = await createUser()
        expect(await listFriendIds(me.id)).toEqual([])
    })
})
