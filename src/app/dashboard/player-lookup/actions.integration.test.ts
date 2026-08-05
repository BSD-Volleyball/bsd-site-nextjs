import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts, emailSuppressions, userRoles } from "@/database/schema"
import {
    createDivision,
    createMatch,
    createSeason,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import { getPlayerAnalytics, getPlayerDetails, getPlayerRoles } from "./actions"

// One recorded match: the target player's team sweeps 2-0, so career stats
// should read 1-0 in matches, 2-0 in sets, and the player should pick up an
// ELO history point.
async function seedOneMatch() {
    const season = await createSeason()
    const division = await createDivision({ name: "A", level: 2 })
    const winner = await createUser()
    const loser = await createUser()
    const captain = await createUser()

    const homeTeam = await createTeam({
        season: season.id,
        division: division.id,
        captain: captain.id,
        name: "Home"
    })
    const awayTeam = await createTeam({
        season: season.id,
        division: division.id,
        captain: captain.id,
        name: "Away"
    })
    await db.insert(drafts).values([
        { team: homeTeam.id, user: winner.id, round: 1, overall: 1 },
        { team: awayTeam.id, user: loser.id, round: 1, overall: 2 }
    ])
    await createMatch({
        season: season.id,
        division: division.id,
        week: 1,
        home_team: homeTeam.id,
        away_team: awayTeam.id,
        winner: homeTeam.id,
        home_set1_score: 25,
        away_set1_score: 18,
        home_set2_score: 25,
        away_set2_score: 20
    })

    return { winner, loser }
}

describe("getPlayerAnalytics", () => {
    it("returns career stats and rating history for an admin", async () => {
        const { winner } = await seedOneMatch()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerAnalytics(winner.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.careerStats.matchWins).toBe(1)
        expect(result.data.careerStats.matchLosses).toBe(0)
        expect(result.data.careerStats.setWins).toBe(2)
        expect(result.data.careerStats.setLosses).toBe(0)
        expect(result.data.eloHistory).toHaveLength(1)
        expect(result.data.currentRating).not.toBeNull()
        expect(result.data.allSeasons.length).toBeGreaterThan(0)
    })

    it("counts the losing side's record too", async () => {
        const { loser } = await seedOneMatch()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerAnalytics(loser.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.careerStats.matchWins).toBe(0)
        expect(result.data.careerStats.matchLosses).toBe(1)
        expect(result.data.careerStats.setLosses).toBe(2)
    })

    it("rejects an authenticated non-admin", async () => {
        const player = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerAnalytics(player.id)

        expect(result.status).toBe(false)
    })

    it("rejects an unauthenticated caller", async () => {
        const player = await createUser()
        logout()

        const result = await getPlayerAnalytics(player.id)

        expect(result.status).toBe(false)
    })
})

describe("getPlayerRoles", () => {
    it("returns role assignments with scope labels, global roles first", async () => {
        const season = await createSeason({ code: "F26" })
        await createUserWithRoles([{ role: "admin" }])
        const player = await createUser()
        await db.insert(userRoles).values([
            {
                user_id: player.id,
                role: "commissioner",
                season_id: season.id
            },
            { user_id: player.id, role: "leadership_group" }
        ])

        const roles = await getPlayerRoles(player.id)

        expect(roles).toHaveLength(2)
        expect(roles[0]).toMatchObject({
            role: "leadership_group",
            season_id: null,
            season_label: null,
            division_label: null
        })
        expect(roles[1]).toMatchObject({
            role: "commissioner",
            season_id: season.id,
            season_label: "F26 2026 fall"
        })
    })

    it("returns [] for commissioners (admin-only data)", async () => {
        const season = await createSeason()
        const player = await createUser()
        await db
            .insert(userRoles)
            .values([{ user_id: player.id, role: "leadership_group" }])
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        expect(await getPlayerRoles(player.id)).toEqual([])
    })

    it("returns [] for unauthenticated callers", async () => {
        const player = await createUser()
        await db
            .insert(userRoles)
            .values([{ user_id: player.id, role: "leadership_group" }])
        logout()

        expect(await getPlayerRoles(player.id)).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// Email deliverability — surfaced to admins so they can tell "never got the
// email" from "we stopped sending to them".
// ---------------------------------------------------------------------------

describe("getPlayerDetails — email suppressions", () => {
    async function seedSuppressedPlayer() {
        const player = await createUser({ email_status: "bounced" })
        await db.insert(emailSuppressions).values({
            user_id: player.id,
            email: player.email.toLowerCase(),
            stream_id: "outbound",
            reason: "HardBounce",
            origin: "Recipient"
        })
        return player
    }

    it("returns the player's suppressions to an admin", async () => {
        const player = await seedSuppressedPlayer()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.email_status).toBe("bounced")
        expect(result.data.emailSuppressions).toHaveLength(1)
        expect(result.data.emailSuppressions[0]).toMatchObject({
            streamId: "outbound",
            reason: "HardBounce",
            origin: "Recipient",
            canReactivate: true
        })
    })

    it("marks a spam complaint as non-reactivatable", async () => {
        const player = await createUser({ email_status: "spam_complaint" })
        await db.insert(emailSuppressions).values({
            user_id: player.id,
            email: player.email.toLowerCase(),
            stream_id: "broadcast",
            reason: "SpamComplaint",
            origin: "Recipient"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.emailSuppressions[0].canReactivate).toBe(false)
    })

    it("reports every suppressed stream separately", async () => {
        const player = await createUser({ email_status: "unsubscribed" })
        await db.insert(emailSuppressions).values([
            {
                user_id: player.id,
                email: player.email.toLowerCase(),
                stream_id: "broadcast",
                reason: "ManualSuppression",
                origin: "Customer"
            },
            {
                user_id: player.id,
                email: player.email.toLowerCase(),
                stream_id: "automated-reminders",
                reason: "ManualSuppression",
                origin: "Recipient"
            }
        ])
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(
            new Set(result.data.emailSuppressions.map((s) => s.streamId))
        ).toEqual(new Set(["broadcast", "automated-reminders"]))
    })

    it("returns an empty list for a deliverable address", async () => {
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.email_status).toBe("valid")
        expect(result.data.emailSuppressions).toEqual([])
    })

    // Commissioners already have the address itself redacted; deliverability
    // state must follow it rather than leaking around the redaction.
    it("hides suppressions and status from a non-admin commissioner", async () => {
        const season = await createSeason()
        const player = await seedSuppressedPlayer()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.email).toBe("")
        expect(result.data.player.email_status).toBe("")
        expect(result.data.emailSuppressions).toEqual([])
    })

    it("rejects callers with no commissioner access", async () => {
        const player = await seedSuppressedPlayer()
        await createUserWithRoles([{ role: "referee" }])

        const result = await getPlayerDetails(player.id)
        expect(result.status).toBe(false)
    })

    it("rejects unauthenticated callers", async () => {
        const player = await seedSuppressedPlayer()
        logout()

        const result = await getPlayerDetails(player.id)
        expect(result.status).toBe(false)
    })
})
