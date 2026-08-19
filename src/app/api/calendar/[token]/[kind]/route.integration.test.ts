import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts, friendships, matchReferees } from "@/database/schema"
import {
    getOrCreateCalendarToken,
    rotateCalendarToken
} from "@/lib/calendar-token"
import {
    createDivision,
    createMatch,
    createSeason,
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

    it("stops serving a rotated token", async () => {
        const user = await createUser()
        const oldToken = await getOrCreateCalendarToken(user.id)
        expect((await get(oldToken, "personal.ics")).status).toBe(200)

        const newToken = await rotateCalendarToken(user.id)
        expect((await get(oldToken, "personal.ics")).status).toBe(404)
        expect((await get(newToken, "personal.ics")).status).toBe(200)
    })
})
