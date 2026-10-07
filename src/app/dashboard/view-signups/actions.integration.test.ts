import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts, substitutions } from "@/database/schema"
import {
    addToWaitlist,
    createDivision,
    createSeason,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import { getPlayerDetailsPublic } from "./actions"

// Contact info (email/phone) is revealed server-side only to current-season
// commissioners; captains and court managers share this action but must keep
// receiving the redacted sentinels.
describe("getPlayerDetailsPublic — contact info redaction", () => {
    async function seedPlayer(seasonId: number) {
        const player = await createUser({
            phone: "555-123-4567",
            emergency_contact: "Jane Doe 555-999-0000"
        })
        await createSignup({ season: seasonId, player: player.id })
        return player
    }

    it("returns phone and email to a current-season commissioner", async () => {
        const season = await createSeason()
        const player = await seedPlayer(season.id)
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        const result = await getPlayerDetailsPublic(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.phone).toBe("555-123-4567")
        expect(result.data.player.email).toBe(player.email)
        // The rest of the contact/account block stays redacted for everyone.
        expect(result.data.player.emergency_contact).toBeNull()
        expect(result.data.player.email_status).toBe("")
    })

    it("keeps phone and email redacted for a captain", async () => {
        const season = await createSeason()
        const player = await seedPlayer(season.id)
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerDetailsPublic(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.phone).toBeNull()
        expect(result.data.player.email).toBe("")
    })

    it("keeps phone and email redacted for a court manager", async () => {
        const season = await createSeason()
        const player = await seedPlayer(season.id)
        await createUserWithRoles([{ role: "court_manager" }])

        const result = await getPlayerDetailsPublic(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.phone).toBeNull()
        expect(result.data.player.email).toBe("")
    })

    it("rejects an authenticated user with no captain-pages access", async () => {
        const season = await createSeason()
        const player = await seedPlayer(season.id)
        await createUserWithRoles([{ role: "referee" }])

        const result = await getPlayerDetailsPublic(player.id)
        expect(result.status).toBe(false)
    })

    it("rejects unauthenticated callers", async () => {
        const season = await createSeason()
        const player = await seedPlayer(season.id)
        logout()

        const result = await getPlayerDetailsPublic(player.id)
        expect(result.status).toBe(false)
    })

    it("refuses a player who is not in the current season", async () => {
        const oldSeason = await createSeason()
        await createSeason()
        const formerPlayer = await createUser()
        await createSignup({ season: oldSeason.id, player: formerPlayer.id })
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerDetailsPublic(formerPlayer.id)

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toBe(
            "Player not found."
        )
    })

    it("serves a current-season waitlist member (sub-finder candidates)", async () => {
        const season = await createSeason()
        const waiting = await createUser()
        await addToWaitlist({ season: season.id, user: waiting.id })
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerDetailsPublic(waiting.id)

        expect(result.status).toBe(true)
    })

    // People on a current-season roster without a signup or waitlist row: a
    // permanent sub locked in from the waitlist (the lock-in consumes the
    // waitlist row) and a coach who captains without signing up. Captains
    // open their details from the team card.
    it("serves a permanent sub and a coach captain with no signup row", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const coach = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: coach.id,
            division: division.id
        })
        const original = await createUser()
        await createSignup({ season: season.id, player: original.id })
        const [draft] = await db
            .insert(drafts)
            .values({ team: team.id, user: original.id, round: 1, overall: 1 })
            .returning()
        const sub = await createUser()
        await db.insert(substitutions).values({
            team: team.id,
            season: season.id,
            original_draft: draft.id,
            original_user: original.id,
            sub_user: sub.id,
            performed_by: coach.id
        })
        await createUserWithRoles([{ role: "captain" }])

        expect((await getPlayerDetailsPublic(sub.id)).status).toBe(true)
        expect((await getPlayerDetailsPublic(coach.id)).status).toBe(true)
    })
})
