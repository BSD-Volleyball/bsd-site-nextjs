import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    drafts,
    playerRatings,
    substitutions,
    week1Rosters,
    week2Rosters,
    week3Rosters
} from "@/database/schema"
import {
    createDivision,
    createEventTimeSlot,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { type RatePlayerEntry, getRatePlayerData } from "./data"

// Characterization test: pins the full payload of getRatePlayerData for a
// small but varied fixture (new vs returning players, a non-signup rated
// player, week 1/2/3 tryout rosters with rows that must be dropped, tryout
// time slots with and without configured times, drafted teams with a
// permanent sub, and the viewer's own team). User ids are fixed so the
// expected values are literal.

let nextOldId = 100

function person(
    id: string,
    firstName: string,
    lastName: string,
    extra: {
        male?: boolean
        preferredName?: string
        oldId?: number
        height?: number
        picture?: string
    } = {}
) {
    return createUser({
        id,
        first_name: firstName,
        last_name: lastName,
        preferred_name: extra.preferredName ?? null,
        male: extra.male ?? null,
        old_id: extra.oldId ?? ++nextOldId,
        height: extra.height ?? null,
        picture: extra.picture ?? null,
        email: `${id}@example.test`
    })
}

async function seed() {
    const old = await createSeason({ year: 2024, season: "fall" })
    const prior = await createSeason({ year: 2025, season: "spring" })
    const cur = await createSeason({ year: 2026, season: "fall" })

    const aa = await createDivision({ name: "AA", level: 1 })
    const a = await createDivision({ name: "A", level: 2 })
    const bb = await createDivision({ name: "BB", level: 3 })

    // Tryouts long past: tryout 2 has two configured times, tryout 3 none.
    const t1 = await createSeasonEvent(cur.id, {
        event_date: "2020-09-01",
        sort_order: 0
    })
    await createEventTimeSlot(t1.id, { start_time: "18:00" })
    const t2 = await createSeasonEvent(cur.id, {
        event_date: "2020-09-08",
        sort_order: 1
    })
    await createEventTimeSlot(t2.id, { start_time: "18:00", sort_order: 0 })
    await createEventTimeSlot(t2.id, { start_time: "19:30", sort_order: 1 })
    await createSeasonEvent(cur.id, { event_date: "2020-09-15", sort_order: 2 })

    const ev = await createUserWithRoles([{ role: "admin" }], {
        id: "ev",
        first_name: "Eve",
        last_name: "Evaluator",
        old_id: 1,
        email: "ev@example.test"
    })
    await person("n1", "Nora", "Newbie", {
        male: false,
        oldId: 11,
        height: 66,
        picture: "n1.jpg"
    })
    await person("n2", "Ned", "Novice", { male: true, preferredName: "Neddy" })
    await person("r1", "Rita", "Return", { male: false })
    await person("r2", "Ron", "Repeat", { male: true, height: 72 })
    await person("s1", "Sam", "Sub", { male: true })
    await person("d1", "Dan", "Drafted", { male: true })
    await person("x", "Xena", "Elsewhere", { male: false })
    await person("cap", "Cass", "Captain", { male: false })
    await person("other", "Otto", "Other")

    for (const player of ["ev", "n1", "n2", "r1", "r2", "s1", "d1"]) {
        await createSignup({ season: cur.id, player })
    }

    // Prior draft history (newest season wins for lastDivisionName)
    const tOldA = await createTeam({
        season: old.id,
        division: a.id,
        captain: "cap"
    })
    const tPriorAA = await createTeam({
        season: prior.id,
        division: aa.id,
        captain: "cap"
    })
    const tPriorBB = await createTeam({
        season: prior.id,
        division: bb.id,
        captain: "cap"
    })
    await db.insert(drafts).values([
        { team: tOldA.id, user: "r2", round: 2, overall: 10 },
        { team: tPriorBB.id, user: "r2", round: 3, overall: 20 },
        { team: tPriorAA.id, user: "r1", round: 1, overall: 1 },
        { team: tPriorAA.id, user: "x", round: 2, overall: 2 }
    ])

    // Ratings: the viewer's across seasons, plus another evaluator's
    const rate = (
        player: string,
        season: number,
        values: Partial<typeof playerRatings.$inferInsert>,
        evaluator = ev.id
    ) =>
        db.insert(playerRatings).values({
            evaluator,
            player,
            season,
            ...values
        })
    await rate("n1", cur.id, {
        overall: 4,
        passing: 3,
        setting: 2.5,
        hitting: 4,
        serving: 3,
        blocking: 1,
        shared_notes: "Good hands",
        private_notes: "Watch serve",
        updated_at: new Date("2026-09-02T12:00:00Z")
    })
    await rate("r2", cur.id, {
        overall: 2,
        updated_at: new Date("2026-09-03T12:00:00Z")
    })
    await rate("r1", prior.id, {
        overall: 5,
        updated_at: new Date("2025-04-01T12:00:00Z")
    })
    await rate("x", prior.id, {
        overall: 3,
        updated_at: new Date("2025-04-01T12:00:00Z")
    })
    await rate(
        "n2",
        cur.id,
        { overall: 1, updated_at: new Date("2026-09-04T12:00:00Z") },
        "other"
    )

    // Week 1: invalid court / session rows and the viewer are dropped
    await db.insert(week1Rosters).values([
        { season: cur.id, user: "n1", session_number: 1, court_number: 1 },
        { season: cur.id, user: "n2", session_number: 1, court_number: 1 },
        { season: cur.id, user: "r1", session_number: 1, court_number: 3 },
        { season: cur.id, user: "r2", session_number: 2, court_number: 4 },
        { season: cur.id, user: "d1", session_number: 2, court_number: 5 },
        { season: cur.id, user: "s1", session_number: 0, court_number: 1 },
        { season: cur.id, user: "ev", session_number: 1, court_number: 2 }
    ])

    await db.insert(week2Rosters).values([
        { season: cur.id, user: "n1", division: a.id, team_number: 1 },
        { season: cur.id, user: "r2", division: a.id, team_number: 1 },
        { season: cur.id, user: "n2", division: a.id, team_number: 2 },
        { season: cur.id, user: "r1", division: aa.id, team_number: 3 },
        { season: cur.id, user: "d1", division: bb.id, team_number: 5 },
        { season: cur.id, user: "ev", division: bb.id, team_number: 5 }
    ])
    await db.insert(week3Rosters).values([
        { season: cur.id, user: "n2", division: aa.id, team_number: 1 },
        { season: cur.id, user: "n1", division: aa.id, team_number: 1 },
        { season: cur.id, user: "r1", division: bb.id, team_number: 6 }
    ])

    // Drafted season teams; the viewer captains one, d1 was replaced by s1
    const teamAA = await createTeam({
        season: cur.id,
        division: aa.id,
        captain: "cap",
        name: "Aces",
        number: 1
    })
    const teamA = await createTeam({
        season: cur.id,
        division: a.id,
        captain: "ev",
        captain2: "r1",
        name: "Bumpers",
        number: 1
    })
    const teamBB = await createTeam({
        season: cur.id,
        division: bb.id,
        captain: "r2",
        name: "Diggers",
        number: 2
    })
    const [dDraft] = await db
        .insert(drafts)
        .values([
            { team: teamA.id, user: "d1", round: 1, overall: 1 },
            { team: teamA.id, user: "n1", round: 2, overall: 2 },
            { team: teamAA.id, user: "n2", round: 1, overall: 3 },
            { team: teamBB.id, user: "x", round: 1, overall: 4 }
        ])
        .returning()
    await db.insert(substitutions).values({
        team: teamA.id,
        season: cur.id,
        original_draft: dDraft.id,
        original_user: "d1",
        sub_user: "s1",
        performed_by: ev.id
    })

    return { prior, cur, teamAA, teamA, teamBB }
}

/**
 * Replaces every player entry nested in the lookup groups with "P:<id>" so
 * the expected payload stays readable, after checking that each one is the
 * same entry the top-level players list carries.
 */
function collapsePlayers(
    value: unknown,
    playersById: Map<string, RatePlayerEntry>
): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => collapsePlayers(item, playersById))
    }
    if (value && typeof value === "object") {
        if ("lastDivisionName" in value && "oldId" in value) {
            const entry = value as RatePlayerEntry
            expect(entry).toEqual(playersById.get(entry.id))
            return `P:${entry.id}`
        }
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                collapsePlayers(item, playersById)
            ])
        )
    }
    return value
}

function normalize(
    data: Record<string, unknown> & { players: RatePlayerEntry[] }
) {
    const playersById = new Map(data.players.map((p) => [p.id, p]))
    return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
            key,
            key === "players" || key === "ratedPlayers"
                ? value
                : collapsePlayers(value, playersById)
        ])
    )
}

describe("getRatePlayerData payload", () => {
    it("pins the full payload", async () => {
        const fx = await seed()
        const result = await getRatePlayerData()
        if (!result.status) throw new Error(result.message)
        expect(result.message).toBeUndefined()
        expect(normalize({ ...result.data })).toEqual({
            seasonLabel: "Fall 2026",
            players: [
                {
                    id: "s1",
                    oldId: 104,
                    firstName: "Sam",
                    lastName: "Sub",
                    preferredName: null,
                    male: true,
                    height: null,
                    picture: null,
                    lastDivisionName: null
                },
                {
                    id: "d1",
                    oldId: 105,
                    firstName: "Dan",
                    lastName: "Drafted",
                    preferredName: null,
                    male: true,
                    height: null,
                    picture: null,
                    lastDivisionName: "A"
                },
                {
                    id: "n2",
                    oldId: 101,
                    firstName: "Ned",
                    lastName: "Novice",
                    preferredName: "Neddy",
                    male: true,
                    height: null,
                    picture: null,
                    lastDivisionName: "AA"
                },
                {
                    id: "r2",
                    oldId: 103,
                    firstName: "Ron",
                    lastName: "Repeat",
                    preferredName: null,
                    male: true,
                    height: 72,
                    picture: null,
                    lastDivisionName: "BB"
                },
                {
                    id: "n1",
                    oldId: 11,
                    firstName: "Nora",
                    lastName: "Newbie",
                    preferredName: null,
                    male: false,
                    height: 66,
                    picture: "n1.jpg",
                    lastDivisionName: "A"
                },
                {
                    id: "r1",
                    oldId: 102,
                    firstName: "Rita",
                    lastName: "Return",
                    preferredName: null,
                    male: false,
                    height: null,
                    picture: null,
                    lastDivisionName: "AA"
                }
            ],
            tryout1Sessions: [
                {
                    sessionNumber: 1,
                    courts: [
                        {
                            courtNumber: 1,
                            players: ["P:n2", "P:n1"]
                        },
                        {
                            courtNumber: 2,
                            players: []
                        },
                        {
                            courtNumber: 3,
                            players: ["P:r1"]
                        },
                        {
                            courtNumber: 4,
                            players: []
                        }
                    ]
                },
                {
                    sessionNumber: 2,
                    courts: [
                        {
                            courtNumber: 1,
                            players: []
                        },
                        {
                            courtNumber: 2,
                            players: []
                        },
                        {
                            courtNumber: 3,
                            players: []
                        },
                        {
                            courtNumber: 4,
                            players: ["P:r2"]
                        }
                    ]
                }
            ],
            tryout2Divisions: [
                {
                    divisionName: "AA",
                    teams: [
                        {
                            teamNumber: 3,
                            players: ["P:r1"]
                        }
                    ]
                },
                {
                    divisionName: "A",
                    teams: [
                        {
                            teamNumber: 1,
                            players: ["P:r2", "P:n1"]
                        },
                        {
                            teamNumber: 2,
                            players: ["P:n2"]
                        }
                    ]
                },
                {
                    divisionName: "BB",
                    teams: [
                        {
                            teamNumber: 5,
                            players: ["P:d1"]
                        }
                    ]
                }
            ],
            tryout3Divisions: [
                {
                    divisionName: "AA",
                    teams: [
                        {
                            teamNumber: 1,
                            players: ["P:n2", "P:n1"]
                        }
                    ]
                },
                {
                    divisionName: "BB",
                    teams: [
                        {
                            teamNumber: 6,
                            players: ["P:r1"]
                        }
                    ]
                }
            ],
            tryout2TimeSlots: [
                {
                    sessionNumber: 1,
                    timeLabel: "6:00 PM",
                    divisions: [
                        {
                            divisionName: "A",
                            courtNumber: 2,
                            teams: [
                                {
                                    teamNumber: 1,
                                    players: ["P:r2", "P:n1"]
                                },
                                {
                                    teamNumber: 2,
                                    players: ["P:n2"]
                                }
                            ]
                        }
                    ]
                },
                {
                    sessionNumber: 2,
                    timeLabel: "7:30 PM",
                    divisions: [
                        {
                            divisionName: "AA",
                            courtNumber: 1,
                            teams: [
                                {
                                    teamNumber: 3,
                                    players: ["P:r1"]
                                }
                            ]
                        }
                    ]
                },
                {
                    sessionNumber: 3,
                    timeLabel: "Session 3",
                    divisions: [
                        {
                            divisionName: "BB",
                            courtNumber: 7,
                            teams: [
                                {
                                    teamNumber: 5,
                                    players: ["P:d1"]
                                }
                            ]
                        }
                    ]
                }
            ],
            tryout3TimeSlots: [
                {
                    sessionNumber: 1,
                    timeLabel: "Session 1",
                    divisions: [
                        {
                            divisionName: "AA",
                            courtNumber: 1,
                            teams: [
                                {
                                    teamNumber: 1,
                                    players: ["P:n2", "P:n1"]
                                }
                            ]
                        }
                    ]
                },
                {
                    sessionNumber: 3,
                    timeLabel: "Session 3",
                    divisions: [
                        {
                            divisionName: "BB",
                            courtNumber: 7,
                            teams: [
                                {
                                    teamNumber: 6,
                                    players: ["P:r1"]
                                }
                            ]
                        }
                    ]
                }
            ],
            byTeamDivisions: [
                {
                    divisionName: "AA",
                    teams: [
                        {
                            teamId: fx.teamAA.id,
                            teamName: "Aces",
                            teamNumber: 1,
                            players: ["P:n2"]
                        }
                    ]
                },
                {
                    divisionName: "A",
                    teams: [
                        {
                            teamId: fx.teamA.id,
                            teamName: "Bumpers",
                            teamNumber: 1,
                            players: ["P:s1", "P:n1", "P:r1"]
                        }
                    ]
                },
                {
                    divisionName: "BB",
                    teams: [
                        {
                            teamId: fx.teamBB.id,
                            teamName: "Diggers",
                            teamNumber: 2,
                            players: ["P:r2"]
                        }
                    ]
                }
            ],
            captainTeam: {
                divisionName: "A",
                teamId: fx.teamA.id
            },
            defaultLookupType: "byTeam",
            ratingsByPlayer: {
                n1: {
                    overall: 4,
                    passing: 3,
                    setting: 2.5,
                    hitting: 4,
                    serving: 3,
                    blocking: 1,
                    sharedNotes: "Good hands",
                    privateNotes: "Watch serve"
                },
                r2: {
                    overall: 2,
                    passing: null,
                    setting: null,
                    hitting: null,
                    serving: null,
                    blocking: null,
                    sharedNotes: null,
                    privateNotes: null
                }
            },
            ratedPlayers: [
                {
                    player: {
                        id: "r2",
                        oldId: 103,
                        firstName: "Ron",
                        lastName: "Repeat",
                        preferredName: null,
                        male: true,
                        height: 72,
                        picture: null,
                        lastDivisionName: "BB"
                    },
                    seasonId: fx.cur.id,
                    seasonLabel: "Fall 2026",
                    overall: 2,
                    ratedAt: "2026-09-03T12:00:00.000Z",
                    canRate: true
                },
                {
                    player: {
                        id: "n1",
                        oldId: 11,
                        firstName: "Nora",
                        lastName: "Newbie",
                        preferredName: null,
                        male: false,
                        height: 66,
                        picture: "n1.jpg",
                        lastDivisionName: "A"
                    },
                    seasonId: fx.cur.id,
                    seasonLabel: "Fall 2026",
                    overall: 4,
                    ratedAt: "2026-09-02T12:00:00.000Z",
                    canRate: true
                },
                {
                    player: {
                        id: "x",
                        oldId: 106,
                        firstName: "Xena",
                        lastName: "Elsewhere",
                        preferredName: null,
                        male: false,
                        height: null,
                        picture: null,
                        lastDivisionName: "BB"
                    },
                    seasonId: fx.prior.id,
                    seasonLabel: "Spring 2025",
                    overall: 3,
                    ratedAt: "2025-04-01T12:00:00.000Z",
                    canRate: false
                },
                {
                    player: {
                        id: "r1",
                        oldId: 102,
                        firstName: "Rita",
                        lastName: "Return",
                        preferredName: null,
                        male: false,
                        height: null,
                        picture: null,
                        lastDivisionName: "AA"
                    },
                    seasonId: fx.prior.id,
                    seasonLabel: "Spring 2025",
                    overall: 5,
                    ratedAt: "2025-04-01T12:00:00.000Z",
                    canRate: true
                }
            ],
            ratedSeasons: [
                {
                    seasonId: fx.cur.id,
                    label: "Fall 2026"
                },
                {
                    seasonId: fx.prior.id,
                    label: "Spring 2025"
                }
            ],
            currentSeasonId: fx.cur.id
        })
    })

    it("opens on the latest past tryout while no teams exist", async () => {
        const cur = await createSeason({ year: 2026, season: "fall" })
        for (const [i, date] of ["2020-09-01", "2020-09-08"].entries()) {
            await createSeasonEvent(cur.id, { event_date: date, sort_order: i })
        }
        await createUserWithRoles([{ role: "admin" }], {
            id: "ev",
            old_id: 1,
            email: "ev@example.test"
        })
        await person("n1", "Nora", "Newbie", { male: false, oldId: 11 })
        await createSignup({ season: cur.id, player: "n1" })
        await db.insert(week1Rosters).values({
            season: cur.id,
            user: "n1",
            session_number: 1,
            court_number: 2
        })

        const result = await getRatePlayerData()
        if (!result.status) throw new Error(result.message)
        const nora: RatePlayerEntry = {
            id: "n1",
            oldId: 11,
            firstName: "Nora",
            lastName: "Newbie",
            preferredName: null,
            male: false,
            height: null,
            picture: null,
            lastDivisionName: null
        }
        expect(result.data).toEqual({
            seasonLabel: "Fall 2026",
            players: [nora],
            tryout1Sessions: [
                {
                    sessionNumber: 1,
                    courts: [
                        { courtNumber: 1, players: [] },
                        { courtNumber: 2, players: [nora] },
                        { courtNumber: 3, players: [] },
                        { courtNumber: 4, players: [] }
                    ]
                }
            ],
            tryout2Divisions: [],
            tryout3Divisions: [],
            tryout2TimeSlots: [],
            tryout3TimeSlots: [],
            byTeamDivisions: [],
            captainTeam: null,
            defaultLookupType: "tryout2",
            ratingsByPlayer: {},
            ratedPlayers: [],
            ratedSeasons: [],
            currentSeasonId: cur.id
        })
    })
})
