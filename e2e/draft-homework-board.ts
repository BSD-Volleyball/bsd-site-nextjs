import { desc, eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    draftHomework,
    drafts,
    divisions,
    individual_divisions,
    seasons,
    users
} from "@/database/schema"
import { createSignup, createTeam } from "@/test/factories"
import { PERSONAS } from "./helpers"

// Shared fixture for the captain draft-homework board: the e2e spec uses
// it in beforeAll, and scripts can call it to stand up a demo board on a
// local dev instance against bsd_e2e.

export const CONSIDERING = 9

export interface Seeded {
    captainId: string
    seasonId: number
    divisionId: number
    teamId: number
    playerIds: string[] // six males, ranked p1..p6
    nonMaleIds: string[] // two non-males
    userIds: string[]
}


export function playerName(i: number) {
    return `Homework Player${i}`
}

export async function seedBoard(): Promise<Seeded> {
    const [captain] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PERSONAS.captain.email))
    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    const [division] = await db
        .select({ id: divisions.id })
        .from(divisions)
        .where(eq(divisions.name, "AA"))

    // 2 teams, 2 male rounds + 1 non-male round
    await db.insert(individual_divisions).values({
        season: season.id,
        division: division.id,
        gender_split: "2-1",
        teams: 2
    })
    const team = await createTeam({
        season: season.id,
        captain: captain.id,
        division: division.id
    })

    const playerIds: string[] = []
    const nonMaleIds: string[] = []
    for (let i = 1; i <= 8; i++) {
        const id = `e2e-homework-player-${i}`
        const male = i <= 6
        await db.insert(users).values({
            id,
            first_name: "Homework",
            last_name: `Player${i}`,
            email: `e2e-homework-${i}@example.test`,
            male,
            onboarding_completed: true
        })
        await createSignup({ season: season.id, player: id })
        ;(male ? playerIds : nonMaleIds).push(id)
    }

    // Saved board: R1 = p1,p2 · R2 = p3,p4 · Considering = p5,p6 · F R1 = n1,n2
    const rows = [
        [1, 0, playerIds[0], true],
        [1, 1, playerIds[1], true],
        [2, 0, playerIds[2], true],
        [2, 1, playerIds[3], true],
        [CONSIDERING, 0, playerIds[4], true],
        [CONSIDERING, 1, playerIds[5], true],
        [1, 0, nonMaleIds[0], false],
        [1, 1, nonMaleIds[1], false]
    ] as const
    await db.insert(draftHomework).values(
        rows.map(([round, slot, player, isMale]) => ({
            season: season.id,
            captain: captain.id,
            division: division.id,
            round,
            slot,
            player,
            is_male_tab: isMale
        }))
    )

    // p2 gets drafted (by anyone in the season) before the captain returns
    await db
        .insert(drafts)
        .values({ team: team.id, user: playerIds[1], round: 1, overall: 1 })

    return {
        captainId: captain.id,
        seasonId: season.id,
        divisionId: division.id,
        teamId: team.id,
        playerIds,
        nonMaleIds,
        userIds: [...playerIds, ...nonMaleIds]
    }
}
