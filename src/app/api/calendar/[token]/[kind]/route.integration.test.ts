import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    drafts,
    friendships,
    matchReferees,
    userUnavailability,
    week1Rosters
} from "@/database/schema"
import {
    getOrCreateCalendarToken,
    rotateCalendarToken
} from "@/lib/calendar-token"
import {
    createDivision,
    createEventTimeSlot,
    createMatch,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser } from "@/test/session"
import { GET } from "./route"

/** Undo RFC 5545 line folding so long UIDs/descriptions can be matched. */
async function unfolded(res: Response): Promise<string> {
    return (await res.text()).replace(/\r\n[ \t]/g, "")
}

function get(token: string, kind: string) {
    const url = `http://localhost:3000/api/calendar/${token}/${kind}`
    return GET(new NextRequest(url), {
        params: Promise.resolve({ token, kind })
    })
}

async function seedMatchBetween(owner: { id: string }, friend: { id: string }) {
    const season = await createSeason()
    const division = await createDivision({ name: "Rec" })
    const ownerTeam = await createTeam({
        season: season.id,
        captain: owner.id,
        division: division.id,
        name: "Spikers"
    })
    const friendTeam = await createTeam({
        season: season.id,
        captain: friend.id,
        division: division.id,
        name: "Diggers"
    })
    await db.insert(drafts).values([
        { team: ownerTeam.id, user: owner.id, round: 1, overall: 1 },
        { team: friendTeam.id, user: friend.id, round: 1, overall: 2 }
    ])
    const match = await createMatch({
        season: season.id,
        division: division.id,
        week: 4,
        date: "2026-10-07",
        time: "19:00",
        court: 2,
        home_team: ownerTeam.id,
        away_team: friendTeam.id
    })
    return { season, division, ownerTeam, friendTeam, match }
}

async function seedSeasonNights() {
    const season = await createSeason()
    const tryout = await createSeasonEvent(season.id, {
        event_type: "tryout",
        event_date: "2026-09-02",
        sort_order: 1
    })
    for (const [i, t] of ["19:00", "20:00", "21:00"].entries()) {
        await createEventTimeSlot(tryout.id, { start_time: t, sort_order: i })
    }
    const regular = await createSeasonEvent(season.id, {
        event_type: "regular_season",
        event_date: "2026-09-16",
        sort_order: 2
    })
    for (const [i, t] of ["19:00", "20:10", "21:20"].entries()) {
        await createEventTimeSlot(regular.id, { start_time: t, sort_order: i })
    }
    const playoff = await createSeasonEvent(season.id, {
        event_type: "playoff",
        event_date: "2026-10-28",
        sort_order: 3
    })
    return { season, tryout, regular, playoff }
}

describe("GET /api/calendar/[token]/[kind]", () => {
    it("404s for malformed or unknown tokens and bad kinds", async () => {
        const user = await createUser()
        const token = await getOrCreateCalendarToken(user.id)

        expect((await get("short", "personal.ics")).status).toBe(404)
        expect((await get("not a token!!", "personal.ics")).status).toBe(404)
        expect((await get("A".repeat(43), "personal.ics")).status).toBe(404)
        expect((await get(token, "personal")).status).toBe(404)
        expect((await get(token, "everyone.ics")).status).toBe(404)
    })

    it("serves an empty calendar when there is no season", async () => {
        const user = await createUser()
        const token = await getOrCreateCalendarToken(user.id)

        const res = await get(token, "personal.ics")
        expect(res.status).toBe(200)
        const body = await unfolded(res)
        expect(body).toContain("BEGIN:VCALENDAR")
        expect(body).not.toContain("BEGIN:VEVENT")
    })

    it("serves the personal feed inline with caching headers", async () => {
        const owner = await createUser({
            first_name: "Joshua",
            preferred_name: "Josh"
        })
        const friend = await createUser({ first_name: "Sam" })
        const { match } = await seedMatchBetween(owner, friend)
        const token = await getOrCreateCalendarToken(owner.id)

        const res = await get(token, "personal.ics")
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toBe(
            "text/calendar; charset=utf-8"
        )
        expect(res.headers.get("content-disposition")).toMatch(
            /^inline; filename="bsd-schedule-fall-2026\.ics"$/
        )
        expect(res.headers.get("cache-control")).toBe("private, max-age=300")
        const body = await unfolded(res)
        expect(body).toContain(`UID:bsd-match-${match.id}@bsd-volleyball.com`)
        expect(body).toContain("SUMMARY:BSD: Spikers vs Diggers (Josh)")
        expect(body).toContain("X-WR-CALNAME:BSD Volleyball — Josh")
        expect(body).toContain("DTSTART;TZID=America/New_York:20261007T190000")
    })

    it("serves the friends feed with accepted friends only", async () => {
        const owner = await createUser({ first_name: "Josh" })
        const friend = await createUser({ first_name: "Sam" })
        const pending = await createUser({ first_name: "Pat" })
        const { season, division, match } = await seedMatchBetween(
            owner,
            friend
        )
        await db.insert(friendships).values([
            {
                requester: owner.id,
                addressee: friend.id,
                status: "accepted",
                responded_at: new Date()
            },
            { requester: pending.id, addressee: owner.id, status: "pending" }
        ])
        // The pending (non-)friend refs the same match — must not appear.
        await db.insert(matchReferees).values({
            match_id: match.id,
            referee_id: pending.id,
            season_id: season.id
        })
        void division
        const token = await getOrCreateCalendarToken(owner.id)

        const res = await get(token, "friends.ics")
        expect(res.status).toBe(200)
        expect(res.headers.get("content-disposition")).toMatch(
            /bsd-friends-fall-2026\.ics/
        )
        const body = await unfolded(res)
        expect(body).toContain("SUMMARY:BSD: Josh vs Sam")
        expect(body).toContain(
            `UID:bsd-friends-${owner.id}-20261007-1900@bsd-volleyball.com`
        )
        expect(body).toContain(
            "Josh — Spikers vs Diggers (Rec\\, Wk 4) — Court 2"
        )
        expect(body).toContain(
            "Sam — Diggers vs Spikers (Rec\\, Wk 4) — Court 2"
        )
        expect(body).not.toContain("Pat")
        expect(body).toContain("X-WR-CALNAME:BSD Volleyball — Friends")
    })

    it("holds placeholders for every season night once signed up", async () => {
        const user = await createUser({ first_name: "Josh" })
        const { season, tryout, regular, playoff } = await seedSeasonNights()
        await createSignup({ season: season.id, player: user.id })
        const token = await getOrCreateCalendarToken(user.id)

        const body = await unfolded(await get(token, "personal.ics"))
        // Tryout night: full block, own slots (21:00 last slot + 90).
        expect(body).toContain(
            `UID:bsd-ph-${tryout.id}-${user.id}@bsd-volleyball.com`
        )
        expect(body).toContain("SUMMARY:BSD: Tryout 1")
        expect(body).toContain("DTSTART;TZID=America/New_York:20260902T190000")
        expect(body).toContain("DTEND;TZID=America/New_York:20260902T223000")
        // Regular-season night: shared season slots (21:20 + 90 = 22:50).
        expect(body).toContain(
            `UID:bsd-ph-${regular.id}-${user.id}@bsd-volleyball.com`
        )
        expect(body).toContain("SUMMARY:BSD: Week 1 Game")
        expect(body).toContain("DTEND;TZID=America/New_York:20260916T225000")
        // Playoff night has no own slots — borrows the season slot list.
        expect(body).toContain(
            `UID:bsd-ph-${playoff.id}-${user.id}@bsd-volleyball.com`
        )
        expect(body).toContain("SUMMARY:BSD: Playoff Week 1")
        expect(body).toContain("DTSTART;TZID=America/New_York:20261028T190000")
        expect(body).toContain("SEQUENCE:0")
    })

    it("hides a night the player marked themselves unavailable for", async () => {
        const user = await createUser({ first_name: "Josh" })
        const { season, tryout, regular } = await seedSeasonNights()
        await createSignup({ season: season.id, player: user.id })
        await db.insert(userUnavailability).values({
            user_id: user.id,
            event_id: tryout.id
        })
        const token = await getOrCreateCalendarToken(user.id)

        const body = await unfolded(await get(token, "personal.ics"))
        expect(body).not.toContain(`UID:bsd-ph-${tryout.id}-${user.id}`)
        expect(body).toContain(`UID:bsd-ph-${regular.id}-${user.id}`)
    })

    it("emits no placeholders without a signup", async () => {
        const user = await createUser()
        await seedSeasonNights()
        const token = await getOrCreateCalendarToken(user.id)

        const body = await unfolded(await get(token, "personal.ics"))
        expect(body).not.toContain("UID:bsd-ph-")
        expect(body).not.toContain("BEGIN:VEVENT")
    })

    it("swaps the tryout placeholder for the real session once the roster posts", async () => {
        const rostered = await createUser({ first_name: "Josh" })
        const benched = await createUser({ first_name: "Sam" })
        const { season, tryout } = await seedSeasonNights()
        await createSignup({ season: season.id, player: rostered.id })
        await createSignup({ season: season.id, player: benched.id })
        await db.insert(week1Rosters).values({
            season: season.id,
            user: rostered.id,
            session_number: 2,
            court_number: 1
        })

        const rosteredBody = await unfolded(
            await get(
                await getOrCreateCalendarToken(rostered.id),
                "personal.ics"
            )
        )
        expect(rosteredBody).toContain("SUMMARY:BSD: Tryout 1 — Session 2")
        expect(rosteredBody).toContain(
            "DTSTART;TZID=America/New_York:20260902T200000"
        )
        expect(rosteredBody).not.toContain(
            `UID:bsd-ph-${tryout.id}-${rostered.id}`
        )

        // A posted roster without you on it means you're not playing.
        const benchedBody = await unfolded(
            await get(
                await getOrCreateCalendarToken(benched.id),
                "personal.ics"
            )
        )
        expect(benchedBody).not.toContain(
            `UID:bsd-ph-${tryout.id}-${benched.id}`
        )
        // Game/playoff nights are still held (no draft yet).
        expect(benchedBody).toContain("SUMMARY:BSD: Week 1 Game")
    })

    it("stops serving a rotated token", async () => {
        const user = await createUser()
        const oldToken = await getOrCreateCalendarToken(user.id)
        expect((await get(oldToken, "personal.ics")).status).toBe(200)

        const newToken = await rotateCalendarToken(user.id)
        expect((await get(oldToken, "personal.ics")).status).toBe(404)
        expect((await get(newToken, "personal.ics")).status).toBe(200)
    })
})
