import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    draftCaptRounds,
    draftHomework,
    draftPairDiffs,
    drafts,
    emailTemplates,
    individual_divisions,
    playerRatings
} from "@/database/schema"
import { normalizeEmailTemplateContent } from "@/lib/email-template-content"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import {
    createDivision,
    createSeason,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getPrepareForDraftData } from "./data"

// Characterization test: pins the full payload of getPrepareForDraftData for a
// small but varied fixture (co-captains, a ghost captain, incomplete homework,
// tab mismatches, weighted draft history over the 3 most recent prior
// seasons, pair picks in both directions and to a non-signup, saved rounds and
// diffs, the captain email template, and the "considered but undrafted" list
// across its states). User ids are fixed so the expected values are literal.

function person(
    id: string,
    firstName: string,
    lastName: string,
    extra: { male?: boolean; preferredName?: string } = {}
) {
    return createUser({
        id,
        first_name: firstName,
        last_name: lastName,
        preferred_name: extra.preferredName ?? null,
        male: extra.male ?? null,
        email: `${id}@example.test`
    })
}

async function seed() {
    const old = await createSeason({ year: 2023, season: "fall" })
    const s1 = await createSeason({ year: 2024, season: "fall" })
    const s2 = await createSeason({ year: 2025, season: "fall" })
    const cur = await createSeason({ year: 2026, season: "fall" })

    const high = await createDivision({ name: "AA", level: 1 })
    const mid = await createDivision({ name: "A", level: 2 })
    const low = await createDivision({ name: "BB", level: 3 })
    await db.insert(individual_divisions).values([
        { season: cur.id, division: high.id, gender_split: "5-3", teams: 2 },
        {
            season: cur.id,
            division: mid.id,
            gender_split: "1-1",
            teams: 2,
            coaches: true
        },
        { season: cur.id, division: low.id, gender_split: "5-3", teams: 2 }
    ])

    const admin = await createUserWithRoles([{ role: "admin" }], {
        id: "admin",
        email: "admin@example.test"
    })

    await person(GHOST_CAPTAIN_ID, "Ghost", "Captain")
    await person("c1", "Cap", "One", { male: true, preferredName: "Cappy" })
    await person("c2", "Cora", "Two", { male: false })
    await person("c3", "Carl", "Three", { male: true })
    await person("hc", "Hank", "High", { male: true })
    await person("hc2", "Hope", "Higher", { male: false })
    await person("p1", "Pat", "Alpha", { male: true })
    await person("p2", "Pam", "Bravo", { male: false, preferredName: "Pammy" })
    await person("p3", "Pete", "Charlie", { male: true })
    await person("p4", "Pia", "Delta", { male: false })
    await person("p5", "Paul", "Echo", { male: true })
    await person("p6", "Phil", "Foxtrot", { male: true })
    await person("p7", "Quinn", "Golf", { male: false })
    await person("x", "Xavier", "Outsider", { male: true })

    const pairPicks: Record<string, string | null> = {
        c1: null,
        c2: null,
        c3: null,
        p1: "p2",
        p2: "p1",
        p3: "c3",
        p4: "x",
        p5: "p4",
        p6: null,
        p7: null
    }
    for (const [player, pairPick] of Object.entries(pairPicks)) {
        await createSignup({ season: cur.id, player, pair_pick: pairPick })
    }

    // Current-season teams in the target (mid) division
    const t1 = await createTeam({
        season: cur.id,
        division: mid.id,
        captain: "c1",
        captain2: "c2",
        name: "Mid One",
        number: 1
    })
    const t2 = await createTeam({
        season: cur.id,
        division: mid.id,
        captain: "c3",
        captain2: GHOST_CAPTAIN_ID,
        name: "Mid Two",
        number: 2
    })
    await createTeam({
        season: cur.id,
        division: mid.id,
        captain: GHOST_CAPTAIN_ID,
        name: "Ghost Team",
        number: 3
    })

    // Mid homework. Threshold = 2 teams × (1 + 1) = 4 rows per captain.
    let slot = 0
    const hw = (
        captain: string,
        player: string,
        round: number,
        isMaleTab: boolean,
        division = mid.id
    ) =>
        db.insert(draftHomework).values({
            season: cur.id,
            division,
            captain,
            player,
            round,
            slot: ++slot,
            is_male_tab: isMaleTab
        })
    // c1: complete (5 rows)
    await hw("c1", "p1", 1, true)
    await hw("c1", "p3", 2, true)
    await hw("c1", "p2", 1, false)
    await hw("c1", "p4", 2, false)
    await hw("c1", "c3", 3, true)
    // c2: incomplete (2 rows); p2 sits on the wrong tab
    await hw("c2", "p1", 2, true)
    await hw("c2", "p2", 1, true)
    // c3: complete (4 rows, one duplicate of the same pick)
    await hw("c3", "p1", 1, true)
    await hw("c3", "p1", 1, true)
    await hw("c3", "p3", 1, true)
    await hw("c3", "p4", 3, false)

    // Prior-season draft history in the mid division (old is beyond the
    // 3-season window) plus one in another division (ignored for history).
    const priorTeam = async (seasonId: number, divisionId: number) =>
        createTeam({ season: seasonId, division: divisionId, captain: "hc" })
    const tOld = await priorTeam(old.id, mid.id)
    const tS1 = await priorTeam(s1.id, mid.id)
    const tS2 = await priorTeam(s2.id, mid.id)
    const tS2Low = await priorTeam(s2.id, low.id)
    await db.insert(drafts).values([
        { team: tOld.id, user: "p1", round: 8, overall: 80 },
        { team: tS1.id, user: "p1", round: 4, overall: 30 },
        { team: tS2.id, user: "p1", round: 2, overall: 12 },
        { team: tS1.id, user: "p3", round: 5, overall: 40 },
        { team: tS2Low.id, user: "p2", round: 1, overall: 3 },
        { team: tS2Low.id, user: "p5", round: 3, overall: 77 }
    ])

    // The higher division has drafted this season; p6 went there.
    const tHigh = await createTeam({
        season: cur.id,
        division: high.id,
        captain: "hc",
        name: "High One",
        number: 1
    })
    await db
        .insert(drafts)
        .values({ team: tHigh.id, user: "p6", round: 1, overall: 5 })
    await hw("hc", "p5", 1, true, high.id)
    await hw("hc", "p4", 2, false, high.id)
    await hw("hc", "p6", 1, true, high.id)
    await hw("hc", "p7", 3, false, high.id)
    await hw("hc2", "p5", 2, true, high.id)
    await hw("hc2", "p7", 1, false, high.id)

    // p4 has no draft history, so her score comes from ratings (admin ×2).
    await db.insert(playerRatings).values({
        season: cur.id,
        player: "p4",
        evaluator: admin.id,
        overall: 3
    })

    await db.insert(draftCaptRounds).values([
        {
            season: cur.id,
            division: mid.id,
            saved_by: admin.id,
            captain: "c1",
            round: 1
        },
        {
            season: cur.id,
            division: mid.id,
            saved_by: admin.id,
            captain: "c3",
            round: 2
        },
        {
            season: cur.id,
            division: low.id,
            saved_by: admin.id,
            captain: "c1",
            round: 5
        }
    ])
    await db.insert(draftPairDiffs).values([
        {
            season: cur.id,
            division: mid.id,
            saved_by: admin.id,
            player1: "p1",
            player2: "p2",
            diff: 2
        },
        {
            season: cur.id,
            division: mid.id,
            saved_by: admin.id,
            player1: "p4",
            player2: "x",
            diff: 3
        },
        {
            season: cur.id,
            division: low.id,
            saved_by: admin.id,
            player1: "p3",
            player2: "c3",
            diff: 1
        }
    ])

    const templateContent = normalizeEmailTemplateContent(
        "Hello captains\nSee you at the draft"
    )
    await db.insert(emailTemplates).values({
        name: "predraft to captains",
        subject: "Draft prep",
        content: templateContent as unknown as Record<string, unknown>
    })

    return { cur, high, mid, low, t1, t2, tHigh, templateContent }
}

const EMAIL_TEMPLATE_TEXT = "Hello captains\nSee you at the draft"
const EMAIL_SUBJECT = "Draft prep"

describe("getPrepareForDraftData payload", () => {
    it("pins the full payload for each division state", async () => {
        const fx = await seed()
        const allDivisions = [
            { id: fx.high.id, name: "AA" },
            { id: fx.mid.id, name: "A" },
            { id: fx.low.id, name: "BB" }
        ]

        // Mid: the higher division has drafted, this one has not.
        const mid = await getPrepareForDraftData(fx.mid.id)
        expect(mid).toEqual({
            status: true,
            message: "Success",
            data: {
                seasonId: fx.cur.id,
                seasonLabel: "Fall 2026",
                divisionId: fx.mid.id,
                divisionName: "A",
                usesCoaches: true,
                captains: [
                    {
                        userId: "c1",
                        displayName: "Cappy",
                        lastName: "One",
                        email: "c1@example.test",
                        teamId: fx.t1.id
                    },
                    {
                        userId: "c2",
                        displayName: "Cora",
                        lastName: "Two",
                        email: "c2@example.test",
                        teamId: fx.t1.id
                    },
                    {
                        userId: "c3",
                        displayName: "Carl",
                        lastName: "Three",
                        email: "c3@example.test",
                        teamId: fx.t2.id
                    }
                ],
                teams: [
                    {
                        teamId: fx.t1.id,
                        teamName: "Mid One",
                        teamNumber: 1,
                        captain1: {
                            userId: "c1",
                            displayName: "Cappy",
                            lastName: "One",
                            email: "c1@example.test",
                            teamId: fx.t1.id
                        },
                        captain1Completed: true,
                        captain2: {
                            userId: "c2",
                            displayName: "Cora",
                            lastName: "Two",
                            email: "c2@example.test",
                            teamId: fx.t1.id
                        },
                        captain2Completed: false,
                        coachesTotal: 2,
                        coachesCompleted: 1
                    },
                    {
                        teamId: fx.t2.id,
                        teamName: "Mid Two",
                        teamNumber: 2,
                        captain1: {
                            userId: "c3",
                            displayName: "Carl",
                            lastName: "Three",
                            email: "c3@example.test",
                            teamId: fx.t2.id
                        },
                        captain1Completed: true,
                        captain2: null,
                        captain2Completed: false,
                        coachesTotal: 1,
                        coachesCompleted: 1
                    }
                ],
                players: [
                    {
                        userId: "p1",
                        displayName: "Pat",
                        lastName: "Alpha",
                        isMale: true,
                        isPairPick: true,
                        teamRounds: [
                            {
                                teamId: fx.t1.id,
                                mappedRound: 1,
                                teamCompletedHomework: true
                            },
                            {
                                teamId: fx.t2.id,
                                mappedRound: 1,
                                teamCompletedHomework: true
                            }
                        ],
                        captainAverage: 1,
                        draftHistoryAverage: 3.6666666666666665,
                        recommendedRound: 2.066666666666667
                    },
                    {
                        userId: "p3",
                        displayName: "Pete",
                        lastName: "Charlie",
                        isMale: true,
                        isPairPick: false,
                        teamRounds: [
                            {
                                teamId: fx.t1.id,
                                mappedRound: 2,
                                teamCompletedHomework: true
                            },
                            {
                                teamId: fx.t2.id,
                                mappedRound: 1,
                                teamCompletedHomework: true
                            }
                        ],
                        captainAverage: 1.5,
                        draftHistoryAverage: 5,
                        recommendedRound: 2.9
                    },
                    {
                        userId: "p2",
                        displayName: "Pammy",
                        lastName: "Bravo",
                        isMale: false,
                        isPairPick: true,
                        teamRounds: [
                            {
                                teamId: fx.t1.id,
                                mappedRound: 3,
                                teamCompletedHomework: true
                            },
                            {
                                teamId: fx.t2.id,
                                mappedRound: 9,
                                teamCompletedHomework: true
                            }
                        ],
                        captainAverage: 6,
                        draftHistoryAverage: null,
                        recommendedRound: 6
                    },
                    {
                        userId: "p4",
                        displayName: "Pia",
                        lastName: "Delta",
                        isMale: false,
                        isPairPick: true,
                        teamRounds: [
                            {
                                teamId: fx.t1.id,
                                mappedRound: 5,
                                teamCompletedHomework: true
                            },
                            {
                                teamId: fx.t2.id,
                                mappedRound: 8,
                                teamCompletedHomework: true
                            }
                        ],
                        captainAverage: 6.5,
                        draftHistoryAverage: null,
                        recommendedRound: 6.5
                    },
                    {
                        userId: "c3",
                        displayName: "Carl",
                        lastName: "Three",
                        isMale: true,
                        isPairPick: true,
                        teamRounds: [
                            {
                                teamId: fx.t1.id,
                                mappedRound: 4,
                                teamCompletedHomework: true
                            },
                            {
                                teamId: fx.t2.id,
                                mappedRound: 9,
                                teamCompletedHomework: true
                            }
                        ],
                        captainAverage: 6.5,
                        draftHistoryAverage: null,
                        recommendedRound: 6.5
                    }
                ],
                pairDifferentials: [
                    {
                        player1UserId: "p1",
                        player1DisplayName: "Pat",
                        player1LastName: "Alpha",
                        player1Round: 2.066666666666667,
                        player2UserId: "p2",
                        player2DisplayName: "Pammy",
                        player2LastName: "Bravo",
                        player2Round: 6,
                        captainIsLower: false
                    },
                    {
                        player1UserId: "p3",
                        player1DisplayName: "Pete",
                        player1LastName: "Charlie",
                        player1Round: 2.9,
                        player2UserId: "c3",
                        player2DisplayName: "Carl",
                        player2LastName: "Three",
                        player2Round: 6.5,
                        captainIsLower: true
                    }
                ],
                availableDivisions: allDivisions,
                isLeagueWide: true,
                savedCaptainRounds: {
                    c1: 1,
                    c3: 2
                },
                savedPairDiffs: {
                    "p1:p2": 2
                },
                emailTemplate: EMAIL_TEMPLATE_TEXT,
                emailTemplateContent: fx.templateContent,
                emailSubject: EMAIL_SUBJECT,
                consideredButUndrafted: {
                    isRelevant: true,
                    message:
                        "Players from higher-division draft homework who are still undrafted this season.",
                    players: [
                        {
                            userId: "p5",
                            displayName: "Paul",
                            lastName: "Echo",
                            pairDisplayName: "Pia Delta",
                            score: 77,
                            consideredInDivisions: ["AA"],
                            considerationCount: 2
                        },
                        {
                            userId: "p7",
                            displayName: "Quinn",
                            lastName: "Golf",
                            pairDisplayName: null,
                            score: 200,
                            consideredInDivisions: ["AA"],
                            considerationCount: 2
                        },
                        {
                            userId: "p4",
                            displayName: "Pia",
                            lastName: "Delta",
                            pairDisplayName: null,
                            score: 151,
                            consideredInDivisions: ["AA"],
                            considerationCount: 1
                        }
                    ]
                }
            }
        })

        // High: no higher division, so the considered list is not relevant.
        const high = await getPrepareForDraftData(fx.high.id)
        expect(high).toEqual({
            status: true,
            message: "Success",
            data: {
                seasonId: fx.cur.id,
                seasonLabel: "Fall 2026",
                divisionId: fx.high.id,
                divisionName: "AA",
                usesCoaches: false,
                captains: [
                    {
                        userId: "hc",
                        displayName: "Hank",
                        lastName: "High",
                        email: "hc@example.test",
                        teamId: fx.tHigh.id
                    }
                ],
                teams: [
                    {
                        teamId: fx.tHigh.id,
                        teamName: "High One",
                        teamNumber: 1,
                        captain1: {
                            userId: "hc",
                            displayName: "Hank",
                            lastName: "High",
                            email: "hc@example.test",
                            teamId: fx.tHigh.id
                        },
                        captain1Completed: false,
                        captain2: null,
                        captain2Completed: false,
                        coachesTotal: 1,
                        coachesCompleted: 0
                    }
                ],
                players: [
                    {
                        userId: "p4",
                        displayName: "Pia",
                        lastName: "Delta",
                        isMale: false,
                        isPairPick: true,
                        teamRounds: [
                            {
                                teamId: fx.tHigh.id,
                                mappedRound: 5,
                                teamCompletedHomework: false
                            }
                        ],
                        captainAverage: 9,
                        draftHistoryAverage: null,
                        recommendedRound: 9
                    },
                    {
                        userId: "p5",
                        displayName: "Paul",
                        lastName: "Echo",
                        isMale: true,
                        isPairPick: false,
                        teamRounds: [
                            {
                                teamId: fx.tHigh.id,
                                mappedRound: 1,
                                teamCompletedHomework: false
                            }
                        ],
                        captainAverage: 9,
                        draftHistoryAverage: null,
                        recommendedRound: 9
                    },
                    {
                        userId: "p6",
                        displayName: "Phil",
                        lastName: "Foxtrot",
                        isMale: true,
                        isPairPick: false,
                        teamRounds: [
                            {
                                teamId: fx.tHigh.id,
                                mappedRound: 1,
                                teamCompletedHomework: false
                            }
                        ],
                        captainAverage: 9,
                        draftHistoryAverage: null,
                        recommendedRound: 9
                    },
                    {
                        userId: "p7",
                        displayName: "Quinn",
                        lastName: "Golf",
                        isMale: false,
                        isPairPick: false,
                        teamRounds: [
                            {
                                teamId: fx.tHigh.id,
                                mappedRound: 8,
                                teamCompletedHomework: false
                            }
                        ],
                        captainAverage: 9,
                        draftHistoryAverage: null,
                        recommendedRound: 9
                    }
                ],
                pairDifferentials: [
                    {
                        player1UserId: "p4",
                        player1DisplayName: "Pia",
                        player1LastName: "Delta",
                        player1Round: 9,
                        player2UserId: "p5",
                        player2DisplayName: "Paul",
                        player2LastName: "Echo",
                        player2Round: 9,
                        captainIsLower: false
                    }
                ],
                availableDivisions: allDivisions,
                isLeagueWide: true,
                savedCaptainRounds: {},
                savedPairDiffs: {},
                emailTemplate: EMAIL_TEMPLATE_TEXT,
                emailTemplateContent: fx.templateContent,
                emailSubject: EMAIL_SUBJECT,
                consideredButUndrafted: {
                    isRelevant: false,
                    message:
                        "This section is not relevant for this division right now.",
                    players: []
                }
            }
        })

        // Low: the next higher division (mid) has not drafted yet.
        const low = await getPrepareForDraftData(fx.low.id)
        expect(low).toEqual({
            status: true,
            message: "Success",
            data: {
                seasonId: fx.cur.id,
                seasonLabel: "Fall 2026",
                divisionId: fx.low.id,
                divisionName: "BB",
                usesCoaches: false,
                captains: [],
                teams: [],
                players: [],
                pairDifferentials: [],
                availableDivisions: allDivisions,
                isLeagueWide: true,
                savedCaptainRounds: {},
                savedPairDiffs: {},
                emailTemplate: EMAIL_TEMPLATE_TEXT,
                emailTemplateContent: fx.templateContent,
                emailSubject: EMAIL_SUBJECT,
                consideredButUndrafted: {
                    isRelevant: false,
                    message:
                        "This section will become relevant after the next higher division has drafted.",
                    players: []
                }
            }
        })

        // Once mid itself has drafted, its considered list is closed.
        await db
            .insert(drafts)
            .values({ team: fx.t1.id, user: "p1", round: 1, overall: 9 })
        const drafted = await getPrepareForDraftData(fx.mid.id)
        if (!drafted.status) throw new Error(drafted.message)
        expect(drafted.data.consideredButUndrafted).toEqual({
            isRelevant: false,
            message:
                "This section is no longer relevant because this division has already drafted.",
            players: []
        })
    })
})
