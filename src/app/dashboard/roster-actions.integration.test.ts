import { and, eq } from "drizzle-orm"
import { revalidateTag } from "next/cache"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    auditLog,
    drafts,
    teams,
    userRoles,
    waitlist,
    waiverAcceptances
} from "@/database/schema"
import {
    createDivision,
    createSeason,
    createTeam,
    createWaiver
} from "@/test/factories"
import { sentMessages, sentToAddresses } from "@/test/email"
import { createUser, createUserWithRoles, loginAs } from "@/test/session"
import { getCaptainWelcomeData } from "./roster-data"
import {
    expressWaitlistInterest,
    getTeamRoster,
    renameTeam
} from "./roster-actions"

// Seeds a past season and a current season, each with one team whose captain
// drafted one player. getSeasonConfig resolves the highest season id as
// "current", so creation order matters.
async function seedTwoSeasons() {
    const division = await createDivision()
    const pastSeason = await createSeason()
    const pastCaptain = await createUser()
    const pastPlayer = await createUser()
    const pastTeam = await createTeam({
        season: pastSeason.id,
        captain: pastCaptain.id,
        division: division.id,
        name: "Past Team"
    })
    await db.insert(drafts).values([
        { team: pastTeam.id, user: pastCaptain.id, round: 1, overall: 1 },
        { team: pastTeam.id, user: pastPlayer.id, round: 2, overall: 2 }
    ])

    const currentSeason = await createSeason()
    const captain = await createUser()
    const member = await createUser()
    const currentTeam = await createTeam({
        season: currentSeason.id,
        captain: captain.id,
        division: division.id,
        name: "Current Team"
    })
    await db
        .insert(drafts)
        .values({ team: currentTeam.id, user: member.id, round: 1, overall: 1 })

    return { pastTeam, currentTeam, captain, member }
}

describe("getTeamRoster", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getTeamRoster(1)
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("returns Team not found for an unknown team", async () => {
        await createUserWithRoles([])
        const result = await getTeamRoster(999999)
        expect(result).toEqual({ status: false, message: "Team not found." })
    })

    it("lets an admin view any current-season roster", async () => {
        const { currentTeam, member } = await seedTwoSeasons()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getTeamRoster(currentTeam.id)
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.teamName).toBe("Current Team")
        expect(result.data.players.map((p) => p.id)).toEqual([member.id])
    })

    it("lets any logged-in user view a past-season roster", async () => {
        const { pastTeam } = await seedTwoSeasons()
        await createUserWithRoles([]) // unrelated player, no roles

        const result = await getTeamRoster(pastTeam.id)
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.teamName).toBe("Past Team")
        expect(result.data.players).toHaveLength(2)
    })

    it("denies a current-season roster to a non-member", async () => {
        const { currentTeam } = await seedTwoSeasons()
        await createUserWithRoles([])

        const result = await getTeamRoster(currentTeam.id)
        expect(result).toEqual({
            status: false,
            message:
                "Current-season rosters are only visible to that team's players."
        })
    })

    it("allows a drafted member to view their current-season roster", async () => {
        const { currentTeam, member } = await seedTwoSeasons()
        loginAs(member)

        const result = await getTeamRoster(currentTeam.id)
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.players.map((p) => p.id)).toEqual([member.id])
    })

    it("allows the captain to view their current-season roster", async () => {
        const { currentTeam, captain } = await seedTwoSeasons()
        loginAs(captain)

        const result = await getTeamRoster(currentTeam.id)
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.teamName).toBe("Current Team")
    })
})

describe("expressWaitlistInterest", () => {
    it("rejects unauthenticated callers", async () => {
        const season = await createSeason()
        const waiver = await createWaiver()

        const result = await expressWaitlistInterest(season.id, waiver.id, true)
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("records the waitlist row and the waiver acceptance", async () => {
        const season = await createSeason()
        const waiver = await createWaiver()
        const player = await createUserWithRoles([])

        const result = await expressWaitlistInterest(season.id, waiver.id, true)
        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(waitlist)
            .where(
                and(
                    eq(waitlist.season, season.id),
                    eq(waitlist.user, player.id)
                )
            )
        expect(rows).toHaveLength(1)
        expect(rows[0].approved).toBe(false)

        const acceptances = await db
            .select()
            .from(waiverAcceptances)
            .where(
                and(
                    eq(waiverAcceptances.user_id, player.id),
                    eq(waiverAcceptances.waiver_id, waiver.id)
                )
            )
        expect(acceptances).toHaveLength(1)
    })

    it("rejects a join without waiver agreement", async () => {
        const season = await createSeason()
        const waiver = await createWaiver()
        const player = await createUserWithRoles([])

        const result = await expressWaitlistInterest(
            season.id,
            waiver.id,
            false
        )
        expect(result.status).toBe(false)
        expect(result.message).toBe(
            "You must agree to the waiver to join the waitlist."
        )

        const rows = await db
            .select()
            .from(waitlist)
            .where(eq(waitlist.user, player.id))
        expect(rows).toHaveLength(0)
    })

    it("rejects a stale waiver version", async () => {
        const season = await createSeason()
        const oldWaiver = await createWaiver({ active: false })
        await createWaiver({ content: "Republished waiver", active: true })
        await createUserWithRoles([])

        const result = await expressWaitlistInterest(
            season.id,
            oldWaiver.id,
            true
        )
        expect(result.status).toBe(false)
        expect(result.message).toContain("reload")
    })

    it("rejects a duplicate join for the same season", async () => {
        const season = await createSeason()
        const waiver = await createWaiver()
        await createUserWithRoles([])

        const first = await expressWaitlistInterest(season.id, waiver.id, true)
        expect(first.status).toBe(true)

        const second = await expressWaitlistInterest(season.id, waiver.id, true)
        expect(second).toEqual({
            status: false,
            message: "You've already expressed interest for this season."
        })
    })
})

describe("renameTeam", () => {
    // A current regular-season division with two teams: Net Results
    // (captain + co-captain) and Block Party. Optionally a division
    // commissioner, a league-wide one, and one for another division.
    async function seedRenameSeason(phase = "regular_season") {
        const division = await createDivision({ name: "AA" })
        const otherDivision = await createDivision({ name: "BB", level: 2 })
        const season = await createSeason({ phase })
        const captain = await createUser({ first_name: "Casey" })
        const coCaptain = await createUser()
        const otherCaptain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            captain2: coCaptain.id,
            division: division.id,
            name: "Net Results",
            number: 1
        })
        const otherTeam = await createTeam({
            season: season.id,
            captain: otherCaptain.id,
            division: division.id,
            name: "Block Party",
            number: 2
        })
        return {
            season,
            division,
            otherDivision,
            captain,
            coCaptain,
            otherCaptain,
            team,
            otherTeam
        }
    }

    async function teamName(teamId: number) {
        const [row] = await db
            .select({ name: teams.name })
            .from(teams)
            .where(eq(teams.id, teamId))
        return row?.name
    }

    it("rejects unauthenticated callers", async () => {
        const { team } = await seedRenameSeason()
        const result = await renameTeam(team.id, "New Name")
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
        expect(await teamName(team.id)).toBe("Net Results")
    })

    it("lets the captain rename, audits it and emails the division's commissioners", async () => {
        const { season, division, otherDivision, captain, team } =
            await seedRenameSeason()
        const divisionCommish = await createUser({
            email: "div-commish@example.test"
        })
        const leagueCommish = await createUser({
            email: "league-commish@example.test"
        })
        const otherCommish = await createUser({
            email: "other-commish@example.test"
        })
        await db.insert(userRoles).values([
            {
                user_id: divisionCommish.id,
                role: "commissioner",
                season_id: season.id,
                division_id: division.id
            },
            {
                user_id: leagueCommish.id,
                role: "commissioner",
                season_id: season.id,
                division_id: null
            },
            {
                user_id: otherCommish.id,
                role: "commissioner",
                season_id: season.id,
                division_id: otherDivision.id
            }
        ])
        loginAs(captain)

        const result = await renameTeam(team.id, "  Spike   Lee ")
        expect(result.status).toBe(true)
        expect(await teamName(team.id)).toBe("Spike Lee")

        const audits = await db
            .select({ summary: auditLog.summary, user: auditLog.user })
            .from(auditLog)
            .where(
                and(
                    eq(auditLog.entity_type, "teams"),
                    eq(auditLog.entity_id, String(team.id))
                )
            )
        expect(audits).toHaveLength(1)
        expect(audits[0].user).toBe(captain.id)
        expect(audits[0].summary).toContain('"Net Results" to "Spike Lee"')

        expect(sentToAddresses().sort()).toEqual([
            "div-commish@example.test",
            "league-commish@example.test"
        ])
        expect(sentMessages()[0].subject).toBe(
            '[BSD] AA: "Net Results" is now "Spike Lee"'
        )
        expect(revalidateTag).toHaveBeenCalled()
    })

    it("lets the co-captain (captain2) rename", async () => {
        const { coCaptain, team } = await seedRenameSeason("draft")
        loginAs(coCaptain)
        const result = await renameTeam(team.id, "Dig Deep")
        expect(result.status).toBe(true)
        expect(await teamName(team.id)).toBe("Dig Deep")
    })

    it("refuses another team's captain", async () => {
        const { otherCaptain, team } = await seedRenameSeason()
        loginAs(otherCaptain)
        const result = await renameTeam(team.id, "Hijacked")
        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(await teamName(team.id)).toBe("Net Results")
    })

    it("refuses a commissioner who is not on the team (they use Select Captains)", async () => {
        const { team } = await seedRenameSeason()
        await createUserWithRoles([{ role: "admin" }])
        const result = await renameTeam(team.id, "Admin Name")
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("refuses a team from a past season", async () => {
        const { captain, team } = await seedRenameSeason()
        await createSeason({ phase: "regular_season" })
        loginAs(captain)
        const result = await renameTeam(team.id, "Old News")
        expect(result).toEqual({ status: false, message: "Team not found." })
    })

    it("is locked during playoffs", async () => {
        const { captain, team } = await seedRenameSeason("playoffs")
        loginAs(captain)
        const result = await renameTeam(team.id, "Late Change")
        expect(result.status).toBe(false)
        expect(await teamName(team.id)).toBe("Net Results")
    })

    it("refuses a blank name and a name another team in the division has", async () => {
        const { captain, team } = await seedRenameSeason()
        loginAs(captain)

        expect((await renameTeam(team.id, "   ")).status).toBe(false)
        expect(await renameTeam(team.id, "block party")).toEqual({
            status: false,
            message: "Another team in your division already has that name."
        })
        expect(await teamName(team.id)).toBe("Net Results")
        expect(sentMessages()).toHaveLength(0)
    })

    it("never emails the renamer, even when they are a commissioner", async () => {
        const { season, division, captain, team } = await seedRenameSeason()
        await db.insert(userRoles).values({
            user_id: captain.id,
            role: "commissioner",
            season_id: season.id,
            division_id: division.id
        })
        loginAs(captain)
        const result = await renameTeam(team.id, "Self Serve")
        expect(result.status).toBe(true)
        expect(sentMessages()).toHaveLength(0)
    })
})

describe("getCaptainWelcomeData", () => {
    it("finds the team for a co-captain in a standard division", async () => {
        const division = await createDivision()
        const season = await createSeason({ phase: "regular_season" })
        const captain = await createUser()
        const coCaptain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            captain2: coCaptain.id,
            division: division.id,
            name: "Two Heads"
        })
        loginAs(coCaptain)

        const data = await getCaptainWelcomeData()
        expect(data?.teamId).toBe(team.id)
        expect(data?.teamName).toBe("Two Heads")
    })
})
