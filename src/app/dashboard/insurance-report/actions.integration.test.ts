import { db } from "@/database/db"
import {
    drafts,
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    tournaments
} from "@/database/schema"
import {
    createDivision,
    createSeason,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { describe, expect, it } from "vitest"
import { getInsuranceReport } from "./actions"
import type { InsuranceGroup } from "./report-logic"

function group(groups: InsuranceGroup[], value: string): InsuranceGroup {
    const found = groups.find((g) => g.value === value)
    if (!found) throw new Error(`missing group ${value}`)
    return found
}

describe("getInsuranceReport", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getInsuranceReport(2026)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await getInsuranceReport(2026)
        expect(result).toEqual({ status: false, message: "Unauthorized." })
    })

    it("rejects a non-positive year", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await getInsuranceReport(0)
        expect(result).toEqual({ status: false, message: "Invalid year." })
    })

    it("buckets rostered players and tournament-only players for the year", async () => {
        const season = await createSeason({ year: 2026, season: "spring" })
        const division = await createDivision()
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id
        })

        // Youth player: registered 15-14, rostered in the season AND on a
        // tournament roster the same year -> counts once in 15-14 with both events.
        const youth = await createUser({
            first_name: "Youth",
            last_name: "One"
        })
        await createSignup({
            season: season.id,
            player: youth.id,
            age: "15-14"
        })
        await db
            .insert(drafts)
            .values({ team: team.id, user: youth.id, round: 1, overall: 1 })

        // Tournament setup: one division + one team, in 2026.
        const [tournament] = await db
            .insert(tournaments)
            .values({
                code: `INS-${crypto.randomUUID().slice(0, 8)}`,
                year: 2026,
                name: "Beach Bash",
                phase: "registration_open",
                tournament_date: "2026-08-01",
                tournament_type: "coed",
                pool_size: 3,
                elimination_format: "single"
            })
            .returning({ id: tournaments.id })
        const [tDivision] = await db
            .insert(tournamentDivisions)
            .values({
                tournament_id: tournament.id,
                division_id: division.id,
                team_count: 1,
                male_per_team: 3,
                non_male_per_team: 3,
                sort_order: 0
            })
            .returning({ id: tournamentDivisions.id })
        const [tTeam] = await db
            .insert(tournamentTeams)
            .values({
                tournament_id: tournament.id,
                division_id: tDivision.id,
                preferred_division_id: tDivision.id,
                captain_user_id: captain.id,
                name: "Spikers"
            })
            .returning({ id: tournamentTeams.id })

        // Tournament-only player with no season signup -> defaults to adult.
        const walkOn = await createUser({
            first_name: "Walk",
            last_name: "On"
        })
        await db.insert(tournamentRoster).values([
            {
                tournament_id: tournament.id,
                team_id: tTeam.id,
                user_id: youth.id,
                added_by_user_id: captain.id
            },
            {
                tournament_id: tournament.id,
                team_id: tTeam.id,
                user_id: walkOn.id,
                added_by_user_id: captain.id
            }
        ])

        await createUserWithRoles([{ role: "admin" }])

        const result = await getInsuranceReport(2026)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected report")
        const { groups } = result.data

        const youthGroup = group(groups, "15-14")
        expect(youthGroup.total).toBe(1)
        expect(youthGroup.users[0].userId).toBe(youth.id)
        expect(youthGroup.users[0].events).toEqual([
            "Beach Bash 2026",
            "Spring 2026"
        ])

        const adults = group(groups, "20+")
        expect(adults.total).toBe(1)
        expect(adults.users[0].userId).toBe(walkOn.id)
        expect(adults.users[0].events).toEqual(["Beach Bash 2026"])

        expect(group(groups, "17-16").total).toBe(0)
        expect(group(groups, "19-18").total).toBe(0)
    })
})
