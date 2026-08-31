import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { draftHomework, drafts, individual_divisions } from "@/database/schema"
import {
    createDivision,
    createSeason,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    getDraftDivisionData,
    getDraftWatchlistData,
    submitDraft
} from "./actions"

async function seedDraftSeason() {
    const season = await createSeason()
    const divA = await createDivision({ name: "A", level: 2 })
    const divBB = await createDivision({ name: "BB", level: 6 })
    await db.insert(individual_divisions).values([
        {
            season: season.id,
            division: divA.id,
            gender_split: "5-3",
            teams: 4
        },
        {
            season: season.id,
            division: divBB.id,
            gender_split: "5-3",
            teams: 4
        }
    ])
    return { season, divA, divBB }
}

describe("getDraftDivisionData", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getDraftDivisionData()
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to access this page."
        })
    })

    it("rejects a signed-in player with no draft-page role", async () => {
        await seedDraftSeason()
        await createUserWithRoles([])
        const result = await getDraftDivisionData()
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to access this page."
        })
    })

    it("shows a division-scoped commissioner only their division", async () => {
        const { season, divA } = await seedDraftSeason()
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: season.id,
                divisionId: divA.id
            }
        ])

        const result = await getDraftDivisionData()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        expect(result.data.currentSeasonId).toBe(season.id)
        expect(result.data.divisions.map((d) => d.id)).toEqual([divA.id])
    })

    it("shows an admin every configured division and undrafted signups", async () => {
        const { season, divA, divBB } = await seedDraftSeason()
        const undrafted = await createUser()
        const drafted = await createUser()
        await createSignup({ season: season.id, player: undrafted.id })
        await createSignup({ season: season.id, player: drafted.id })
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: divA.id,
            number: 1
        })
        await db
            .insert(drafts)
            .values({ team: team.id, user: drafted.id, round: 1, overall: 1 })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getDraftDivisionData()
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        expect(result.data.divisions.map((d) => d.id)).toEqual([
            divA.id,
            divBB.id
        ])
        const userIds = result.data.users.map((u) => u.id)
        expect(userIds).toContain(undrafted.id)
        expect(userIds).not.toContain(drafted.id)
    })
})

describe("submitDraft", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await submitDraft(2, [
            { teamId: 1, teamNumber: 1, userId: "u", round: 1 }
        ])
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to perform this action."
        })
    })

    it("rejects an empty pick list", async () => {
        await seedDraftSeason()
        await createUserWithRoles([{ role: "admin" }])
        const result = await submitDraft(2, [])
        expect(result).toEqual({
            status: false,
            message: "No draft picks to submit."
        })
    })

    it("rejects a division-scoped commissioner drafting another division", async () => {
        const { season, divA, divBB } = await seedDraftSeason()
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: divA.id,
            number: 1
        })
        const player = await createUser()
        await createUserWithRoles([
            {
                role: "commissioner",
                seasonId: season.id,
                divisionId: divBB.id
            }
        ])

        const result = await submitDraft(2, [
            { teamId: team.id, teamNumber: 1, userId: player.id, round: 1 }
        ])
        expect(result).toEqual({
            status: false,
            message:
                "You don't have permission to submit this division's draft."
        })
    })

    it("inserts snake-draft picks with computed overall numbers", async () => {
        const { season, divA } = await seedDraftSeason()
        const cap1 = await createUser()
        const cap2 = await createUser()
        const team1 = await createTeam({
            season: season.id,
            captain: cap1.id,
            division: divA.id,
            name: "One",
            number: 1
        })
        const team2 = await createTeam({
            season: season.id,
            captain: cap2.id,
            division: divA.id,
            name: "Two",
            number: 2
        })
        const players = await Promise.all([
            createUser(),
            createUser(),
            createUser(),
            createUser()
        ])
        await createUserWithRoles([{ role: "admin" }])

        const result = await submitDraft(2, [
            {
                teamId: team1.id,
                teamNumber: 1,
                userId: players[0].id,
                round: 1
            },
            {
                teamId: team2.id,
                teamNumber: 2,
                userId: players[1].id,
                round: 1
            },
            {
                teamId: team1.id,
                teamNumber: 1,
                userId: players[2].id,
                round: 2
            },
            { teamId: team2.id, teamNumber: 2, userId: players[3].id, round: 2 }
        ])
        expect(result.status).toBe(true)
        expect(result.message).toBe("Successfully submitted 4 draft picks!")

        const rows = await db.select().from(drafts)
        expect(rows).toHaveLength(4)
        const overallFor = (userId: string) =>
            rows.find((r) => r.user === userId)?.overall
        // divisionLevel 2, 2 teams: base = 50 + (round-1)*2
        // round 1 (odd): position = teamNumber → 51, 52
        expect(overallFor(players[0].id)).toBe(51)
        expect(overallFor(players[1].id)).toBe(52)
        // round 2 (even): position = 3 - teamNumber → team1: 54, team2: 53
        expect(overallFor(players[2].id)).toBe(54)
        expect(overallFor(players[3].id)).toBe(53)
    })
})

describe("getDraftWatchlistData (commissioner view)", () => {
    async function seedWatchlistSeason() {
        const priorSeason = await createSeason()
        const season = await createSeason({ phase: "draft" })
        const divAA = await createDivision({ name: "AA", level: 1 })
        const divB = await createDivision({ name: "B", level: 8 })
        await db.insert(individual_divisions).values([
            {
                season: season.id,
                division: divAA.id,
                gender_split: "5-3",
                teams: 2
            },
            {
                season: season.id,
                division: divB.id,
                gender_split: "5-3",
                teams: 2
            }
        ])
        const captain = await createUser()
        await createTeam({
            season: season.id,
            captain: captain.id,
            division: divAA.id
        })
        const priorCaptain = await createUser()
        const priorAATeam = await createTeam({
            season: priorSeason.id,
            captain: priorCaptain.id,
            division: divAA.id
        })
        const priorBTeam = await createTeam({
            season: priorSeason.id,
            captain: priorCaptain.id,
            division: divB.id
        })
        return { season, divAA, captain, priorAATeam, priorBTeam }
    }

    it("ranks criteria players first, then division-below risers by score", async () => {
        const { season, divAA, captain, priorAATeam, priorBTeam } =
            await seedWatchlistSeason()

        const noSignal = await createUser({ male: true })
        const riser = await createUser({ male: true })
        const considering = await createUser({ male: true })
        const history = await createUser({ male: true })
        const placed = await createUser({ male: true })

        // Scrambled signup order so insertion order can't mask ranking
        for (const player of [noSignal, riser, considering, history, placed]) {
            await createSignup({ season: season.id, player: player.id })
        }

        await db.insert(draftHomework).values([
            {
                season: season.id,
                captain: captain.id,
                division: divAA.id,
                round: 1,
                slot: 0,
                player: placed.id,
                is_male_tab: true
            },
            {
                season: season.id,
                captain: captain.id,
                division: divAA.id,
                round: 9,
                slot: 0,
                player: considering.id,
                is_male_tab: true
            }
        ])
        await db.insert(drafts).values([
            // AA history → criteria; blended round = 9*0.6 + 3*0.4 = 6.6 → 7
            {
                team: priorAATeam.id,
                user: history.id,
                round: 3,
                overall: 10
            },
            // division-below draft history only → score signal, no AA criteria
            { team: priorBTeam.id, user: riser.id, round: 1, overall: 55 },
            {
                team: priorBTeam.id,
                user: considering.id,
                round: 5,
                overall: 120
            }
        ])

        await createUserWithRoles([{ role: "admin" }])
        const result = await getDraftWatchlistData(season.id, divAA.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        expect(result.data.view).toBe("commissioner")
        expect(result.data.malePlayers.map((p) => p.userId)).toEqual([
            placed.id, // homework round 1
            history.id, // AA history, blended round 7
            riser.id, // score 55 — best remaining by score
            considering.id, // score 120
            noSignal.id // default score 200
        ])
        expect(result.data.malePlayers.map((p) => p.round)).toEqual([
            1, 7, 9, 9, 9
        ])
    })

    it("caps score-only suggestions at the 10 best per gender", async () => {
        const { season, divAA, captain, priorBTeam } =
            await seedWatchlistSeason()

        const placed = await createUser({ male: true })
        await createSignup({ season: season.id, player: placed.id })
        await db.insert(draftHomework).values({
            season: season.id,
            captain: captain.id,
            division: divAA.id,
            round: 2,
            slot: 0,
            player: placed.id,
            is_male_tab: true
        })

        // 12 score-only players (overalls 60..71) plus one with no signal at all
        const scoreOnly = []
        for (let i = 0; i < 12; i++) {
            const user = await createUser({ male: true })
            await createSignup({ season: season.id, player: user.id })
            await db.insert(drafts).values({
                team: priorBTeam.id,
                user: user.id,
                round: 1,
                overall: 60 + i
            })
            scoreOnly.push(user)
        }
        const noSignal = await createUser({ male: true })
        await createSignup({ season: season.id, player: noSignal.id })

        await createUserWithRoles([{ role: "admin" }])
        const result = await getDraftWatchlistData(season.id, divAA.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        const ids = result.data.malePlayers.map((p) => p.userId)
        expect(ids).toEqual([
            placed.id,
            ...scoreOnly.slice(0, 10).map((u) => u.id)
        ])
        expect(ids).not.toContain(noSignal.id)
    })

    it("does not let players drafted earlier this season consume riser slots", async () => {
        const { season, divAA, priorBTeam } = await seedWatchlistSeason()

        // A division drafted before this one (higher level number irrelevant;
        // what matters is the drafts row in the current season)
        const divDoneCaptain = await createUser()
        const divDone = await createDivision({ name: "Done", level: 0 })
        const divDoneTeam = await createTeam({
            season: season.id,
            captain: divDoneCaptain.id,
            division: divDone.id
        })
        const alreadyDrafted = await createUser({ male: true })
        await createSignup({ season: season.id, player: alreadyDrafted.id })
        await db.insert(drafts).values({
            team: divDoneTeam.id,
            user: alreadyDrafted.id,
            round: 1,
            overall: 1 // best score in the pool
        })

        // 11 undrafted score-only players (overalls 60..70)
        const scoreOnly = []
        for (let i = 0; i < 11; i++) {
            const user = await createUser({ male: true })
            await createSignup({ season: season.id, player: user.id })
            await db.insert(drafts).values({
                team: priorBTeam.id,
                user: user.id,
                round: 1,
                overall: 60 + i
            })
            scoreOnly.push(user)
        }

        await createUserWithRoles([{ role: "admin" }])
        const result = await getDraftWatchlistData(season.id, divAA.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        const ids = result.data.malePlayers.map((p) => p.userId)
        expect(ids).not.toContain(alreadyDrafted.id)
        expect(ids).toEqual(scoreOnly.slice(0, 10).map((u) => u.id))
    })

    it("does not cap suggestions for the last division", async () => {
        const { season, priorBTeam } = await seedWatchlistSeason()

        // Configure a lowest division; it becomes the season's last division
        const divLast = await createDivision({ name: "Last", level: 9 })
        await db.insert(individual_divisions).values({
            season: season.id,
            division: divLast.id,
            gender_split: "5-3",
            teams: 2
        })
        const lastCaptain = await createUser()
        await createTeam({
            season: season.id,
            captain: lastCaptain.id,
            division: divLast.id
        })

        // 12 score-only players — none with signal in the last division
        const scoreOnly = []
        for (let i = 0; i < 12; i++) {
            const user = await createUser({ male: true })
            await createSignup({ season: season.id, player: user.id })
            await db.insert(drafts).values({
                team: priorBTeam.id,
                user: user.id,
                round: 1,
                overall: 60 + i
            })
            scoreOnly.push(user)
        }

        await createUserWithRoles([{ role: "admin" }])
        const result = await getDraftWatchlistData(season.id, divLast.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        expect(result.data.malePlayers.map((p) => p.userId)).toEqual(
            scoreOnly.map((u) => u.id)
        )
    })
})

describe("getDraftWatchlistData (captain view)", () => {
    async function seedCaptainSeason() {
        const season = await createSeason({ phase: "draft" })
        const divAA = await createDivision({ name: "AA", level: 1 })
        await db.insert(individual_divisions).values({
            season: season.id,
            division: divAA.id,
            gender_split: "5-3",
            teams: 2
        })
        return { season, divAA }
    }

    it("orders suggestions by the captain's own slot ranking within a round", async () => {
        const { season, divAA } = await seedCaptainSeason()
        const captain = await createUserWithRoles([
            { role: "captain", seasonId: season.id }
        ])
        await createTeam({
            season: season.id,
            captain: captain.id,
            division: divAA.id
        })

        const playerA = await createUser({ male: true })
        const playerB = await createUser({ male: true })
        const playerC = await createUser({ male: true })
        // Insert slot 1 before slot 0 so query order can't mask ranking
        await db.insert(draftHomework).values([
            {
                season: season.id,
                captain: captain.id,
                division: divAA.id,
                round: 1,
                slot: 1,
                player: playerB.id,
                is_male_tab: true
            },
            {
                season: season.id,
                captain: captain.id,
                division: divAA.id,
                round: 1,
                slot: 0,
                player: playerA.id,
                is_male_tab: true
            },
            {
                season: season.id,
                captain: captain.id,
                division: divAA.id,
                round: 2,
                slot: 0,
                player: playerC.id,
                is_male_tab: true
            }
        ])

        const result = await getDraftWatchlistData(season.id, divAA.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        expect(result.data.view).toBe("captain")
        expect(result.data.malePlayers.map((p) => p.userId)).toEqual([
            playerA.id,
            playerB.id,
            playerC.id
        ])
        expect(result.data.malePlayers.map((p) => p.round)).toEqual([1, 1, 2])
    })

    it("merges both co-captains' homework for a shared team", async () => {
        const { season, divAA } = await seedCaptainSeason()
        const captain1 = await createUser()
        const captain2 = await createUserWithRoles([
            { role: "captain", seasonId: season.id }
        ])
        await createTeam({
            season: season.id,
            captain: captain1.id,
            captain2: captain2.id,
            division: divAA.id
        })

        const player1 = await createUser({ male: true })
        const player2 = await createUser({ male: true })
        await db.insert(draftHomework).values([
            // captain1's homework
            {
                season: season.id,
                captain: captain1.id,
                division: divAA.id,
                round: 1,
                slot: 0,
                player: player1.id,
                is_male_tab: true
            },
            {
                season: season.id,
                captain: captain1.id,
                division: divAA.id,
                round: 2,
                slot: 0,
                player: player2.id,
                is_male_tab: true
            },
            // captain2 ranks player2 higher — the better round wins
            {
                season: season.id,
                captain: captain2.id,
                division: divAA.id,
                round: 1,
                slot: 1,
                player: player2.id,
                is_male_tab: true
            }
        ])

        // Logged in as captain2, who only placed one player themselves
        const result = await getDraftWatchlistData(season.id, divAA.id)
        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected data")
        expect(result.data.view).toBe("captain")
        expect(result.data.malePlayers.map((p) => p.userId)).toEqual([
            player1.id,
            player2.id
        ])
        expect(result.data.malePlayers.map((p) => p.round)).toEqual([1, 1])
    })
})
