import { and, eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    individual_divisions,
    matches,
    playoffMatchesMeta
} from "@/database/schema"
import {
    createDivision,
    createEventTimeSlot,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    getCreateScheduleData,
    writePlayoffSchedule,
    writeRegularSeasonSchedule
} from "./actions"
import { FOUR_TEAM_PLAYOFF, REGULAR_SEASON_WEEKS } from "./schedule-constants"

const REGULAR_DATES = [
    "2026-09-12",
    "2026-09-19",
    "2026-09-26",
    "2026-10-03",
    "2026-10-10",
    "2026-10-17"
]
const PLAYOFF_DATES = ["2026-10-24", "2026-10-31", "2026-11-07"]

/** A 4-team division with a full regular-season calendar. */
async function seedScheduleSeason(opts?: {
    teamsToCreate?: number
    withPlayoffDates?: boolean
}) {
    const teamsToCreate = opts?.teamsToCreate ?? 4
    const season = await createSeason()
    const division = await createDivision({ name: "A", level: 2 })
    await db.insert(individual_divisions).values({
        season: season.id,
        division: division.id,
        gender_split: "5-3",
        teams: 4
    })

    for (let i = 0; i < REGULAR_DATES.length; i++) {
        const event = await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: REGULAR_DATES[i],
            sort_order: i
        })
        if (i === 0) {
            const times = ["19:00", "20:10", "21:20"]
            for (let j = 0; j < times.length; j++) {
                await createEventTimeSlot(event.id, {
                    start_time: times[j],
                    sort_order: j
                })
            }
        }
    }

    if (opts?.withPlayoffDates) {
        for (let i = 0; i < PLAYOFF_DATES.length; i++) {
            await createSeasonEvent(season.id, {
                event_type: "playoff",
                event_date: PLAYOFF_DATES[i],
                sort_order: i
            })
        }
    }

    const teamIds: number[] = []
    for (let n = 1; n <= teamsToCreate; n++) {
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id,
            name: `Team ${n}`,
            number: n
        })
        teamIds.push(team.id)
    }

    return { season, division, teamIds }
}

describe("getCreateScheduleData", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getCreateScheduleData()
        expect(result.status).toBe(false)
        expect(result.message).toBe(
            "You don't have permission to access this page."
        )
    })

    it("returns divisions, teams and dates for an admin", async () => {
        const { season, division } = await seedScheduleSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getCreateScheduleData()
        expect(result.status).toBe(true)
        expect(result.seasonId).toBe(season.id)
        expect(result.divisions).toHaveLength(1)
        expect(result.divisions[0].divisionId).toBe(division.id)
        expect(result.divisions[0].teams).toHaveLength(4)
        expect(result.seasonDates).toEqual(REGULAR_DATES)
        // Postgres time columns round-trip as HH:MM:SS
        expect(result.seasonTimes).toEqual(["19:00:00", "20:10:00", "21:20:00"])
    })
})

describe("writeRegularSeasonSchedule", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await writeRegularSeasonSchedule(1)
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to perform this action."
        })
    })

    it("rejects a non-positive season ID", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await writeRegularSeasonSchedule(0)
        expect(result).toEqual({
            status: false,
            message: "Invalid season ID."
        })
    })

    it("fails when a division has fewer teams than configured", async () => {
        const { season } = await seedScheduleSeason({ teamsToCreate: 3 })
        await createUserWithRoles([{ role: "admin" }])

        const result = await writeRegularSeasonSchedule(season.id)
        expect(result.status).toBe(false)
        if (!result.status) {
            expect(result.message).toContain("expects 4 teams but has 3")
        }
        expect(await db.select().from(matches)).toHaveLength(0)
    })

    it("writes the full round-robin for a 4-team division", async () => {
        const { season, division, teamIds } = await seedScheduleSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await writeRegularSeasonSchedule(season.id)
        expect(result.status).toBe(true)

        const rows = await db
            .select()
            .from(matches)
            .where(eq(matches.season, season.id))
        // 4-team division: 2 matches per week for 6 weeks
        expect(rows).toHaveLength(REGULAR_SEASON_WEEKS * 2)
        for (const row of rows) {
            expect(row.playoff).toBe(false)
            expect(row.division).toBe(division.id)
            expect(row.court).toBe(2) // division level
            expect(teamIds).toContain(row.home_team)
            expect(teamIds).toContain(row.away_team)
            expect(row.date).toBe(REGULAR_DATES[row.week - 1])
        }
        const weeks = [...new Set(rows.map((r) => r.week))].sort(
            (a, b) => a - b
        )
        expect(weeks).toEqual([1, 2, 3, 4, 5, 6])
    })

    it("rejects a stale seasonId instead of tagging current-season teams with it", async () => {
        // The schedule is always built from the CURRENT season's divisions and
        // teams, so a stale season id from the client must be rejected rather
        // than writing matches whose season disagrees with their teams.
        const staleSeason = await createSeason()
        await seedScheduleSeason() // becomes the current season
        await createUserWithRoles([{ role: "admin" }])

        const result = await writeRegularSeasonSchedule(staleSeason.id)
        expect(result).toEqual({
            status: false,
            message: "Season mismatch — reload the page and try again."
        })

        const rows = await db
            .select()
            .from(matches)
            .where(eq(matches.season, staleSeason.id))
        expect(rows).toHaveLength(0)
    })
})

describe("writePlayoffSchedule", () => {
    it("rejects authenticated non-admins", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const result = await writePlayoffSchedule(1)
        expect(result).toEqual({
            status: false,
            message: "You don't have permission to perform this action."
        })
    })

    it("writes bracket matches plus aligned meta rows in one transaction", async () => {
        const { season, division } = await seedScheduleSeason({
            withPlayoffDates: true
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await writePlayoffSchedule(season.id)
        expect(result.status).toBe(true)

        const matchRows = await db
            .select()
            .from(matches)
            .where(
                and(eq(matches.season, season.id), eq(matches.playoff, true))
            )
        expect(matchRows).toHaveLength(FOUR_TEAM_PLAYOFF.length)

        const metaRows = await db
            .select()
            .from(playoffMatchesMeta)
            .where(eq(playoffMatchesMeta.season, season.id))
        expect(metaRows).toHaveLength(FOUR_TEAM_PLAYOFF.length)

        // Every meta row points at a real playoff match of the same week
        const matchById = new Map(matchRows.map((m) => [m.id, m]))
        for (const meta of metaRows) {
            expect(meta.division).toBe(division.id)
            const match = matchById.get(meta.match_id!)
            expect(match).toBeDefined()
            expect(match!.week).toBe(meta.week)
            expect(match!.date).toBe(PLAYOFF_DATES[meta.week - 1])
        }
        // Meta mirrors the template's bracket structure
        expect(new Set(metaRows.map((m) => m.match_num))).toEqual(
            new Set(FOUR_TEAM_PLAYOFF.map((t) => t.matchNum))
        )
    })

    it("rolls back the whole bracket when an insert fails (no playoff dates)", async () => {
        const { season } = await seedScheduleSeason({ withPlayoffDates: false })
        await createUserWithRoles([{ role: "admin" }])

        // With no playoff events every match gets an empty-string date, which
        // Postgres rejects — the transaction must leave no partial rows.
        const result = await writePlayoffSchedule(season.id)
        expect(result).toEqual({
            status: false,
            message: "Something went wrong while creating the playoff schedule."
        })

        const matchRows = await db
            .select()
            .from(matches)
            .where(
                and(eq(matches.season, season.id), eq(matches.playoff, true))
            )
        expect(matchRows).toHaveLength(0)
        expect(await db.select().from(playoffMatchesMeta)).toHaveLength(0)
    })
})
