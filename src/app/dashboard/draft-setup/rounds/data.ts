import "server-only"

import { formatSeasonRowLabel } from "@/lib/season-utils"
import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm"
import { db } from "@/database/db"
import {
    divisions,
    draftCaptRounds,
    draftHomework,
    draftPairDiffs,
    drafts,
    emailTemplates,
    individual_divisions,
    seasons,
    signups,
    teams,
    users
} from "@/database/schema"
import { getSeasonConfig } from "@/lib/site-config"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent
} from "@/lib/email-template-content"
import { fetchPlayerScores } from "@/lib/player-score"
import { getSessionUser } from "@/next/session"
import { getCommissionerDivisionScope } from "@/lib/rbac"
import { parseGenderSplit } from "@/lib/utils"
import { buildHomeworkRoundMaps } from "@/lib/draft-round-maps"
import {
    type CaptainInfo,
    type Captain2User,
    type ConsideredButUndraftedPlayer,
    type DraftPrepSignup,
    type DraftPrepTeamRow,
    type PairDifferential,
    type PlayerRow,
    type TeamInfo,
    buildConsideredButUndrafted,
    buildPairDifferentials,
    buildPlayerRows,
    buildTeamInfos,
    captain2IdsToLoad,
    groupDraftHistory,
    indexHomework,
    resolveDivisionHierarchy
} from "@/lib/draft-prep"

export type {
    CaptainInfo,
    ConsideredButUndraftedPlayer,
    PairDifferential,
    PlayerRow,
    TeamInfo
} from "@/lib/draft-prep"

export interface DivisionOption {
    id: number
    name: string
}

export interface PrepareForDraftData {
    seasonId: number
    seasonLabel: string
    divisionId: number
    divisionName: string
    usesCoaches: boolean
    captains: CaptainInfo[]
    teams: TeamInfo[]
    players: PlayerRow[]
    pairDifferentials: PairDifferential[]
    availableDivisions: DivisionOption[]
    isLeagueWide: boolean
    savedCaptainRounds: Record<string, number>
    savedPairDiffs: Record<string, number>
    emailTemplate: string
    emailTemplateContent: LexicalEmailTemplateContent | null
    emailSubject: string
    consideredButUndrafted: {
        isRelevant: boolean
        message: string
        players: ConsideredButUndraftedPlayer[]
    }
}

type AccessResult =
    | {
          type: "allowed"
          availableDivisions: DivisionOption[]
          isLeagueWide: boolean
      }
    | { type: "denied" }

async function loadAvailableDivisions(
    seasonId: number
): Promise<DivisionOption[]> {
    return db
        .select({ id: divisions.id, name: divisions.name })
        .from(individual_divisions)
        .innerJoin(divisions, eq(individual_divisions.division, divisions.id))
        .where(eq(individual_divisions.season, seasonId))
        .orderBy(asc(divisions.level))
}

async function resolveCommissionerDivisionAccess(
    userId: string,
    seasonId: number
): Promise<AccessResult> {
    const scope = await getCommissionerDivisionScope(userId, seasonId)

    if (scope.type === "denied") {
        return { type: "denied" }
    }

    if (scope.type === "league_wide") {
        const availableDivisions = await loadAvailableDivisions(seasonId)
        return { type: "allowed", availableDivisions, isLeagueWide: true }
    }

    const availableDivisions = (await loadAvailableDivisions(seasonId)).filter(
        (division) => scope.divisionIds.includes(division.id)
    )
    return { type: "allowed", availableDivisions, isLeagueWide: false }
}

/**
 * The requested division when it is one the caller may see, else the first
 * available one; null when the caller has no divisions this season.
 */
function pickDivisionId(
    availableDivisions: DivisionOption[],
    divisionIdParam: number | undefined
): number | null {
    const validParam =
        divisionIdParam !== undefined &&
        Number.isInteger(divisionIdParam) &&
        divisionIdParam > 0
    if (
        validParam &&
        availableDivisions.some((division) => division.id === divisionIdParam)
    ) {
        return divisionIdParam
    }
    if (availableDivisions.length > 0) {
        return availableDivisions[0].id
    }
    return null
}

/** Every lookup that depends only on seasonId/divisionId, run in parallel. */
async function loadDivisionBaseData(seasonId: number, divisionId: number) {
    const [
        [seasonRow],
        [divisionRow],
        seasonDivisionRows,
        [indivDiv],
        homeworkRows,
        signupRows,
        teamRows,
        priorSeasonRows
    ] = await Promise.all([
        // Season label
        db
            .select({ year: seasons.year, season: seasons.season })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1),
        // Division name
        db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, divisionId))
            .limit(1),
        db
            .select({
                id: divisions.id,
                name: divisions.name,
                level: divisions.level
            })
            .from(individual_divisions)
            .innerJoin(
                divisions,
                eq(individual_divisions.division, divisions.id)
            )
            .where(eq(individual_divisions.season, seasonId))
            .orderBy(asc(divisions.level)),
        // numTeams × total homework rounds (from gender_split) determines the completion threshold
        db
            .select({
                numTeams: individual_divisions.teams,
                coaches: individual_divisions.coaches,
                genderSplit: individual_divisions.gender_split
            })
            .from(individual_divisions)
            .where(
                and(
                    eq(individual_divisions.season, seasonId),
                    eq(individual_divisions.division, divisionId)
                )
            )
            .limit(1),
        // Query A: Draft homework entries for this season + division
        db
            .select({
                captainId: draftHomework.captain,
                playerId: draftHomework.player,
                round: draftHomework.round,
                isMaleTab: draftHomework.is_male_tab
            })
            .from(draftHomework)
            .where(
                and(
                    eq(draftHomework.season, seasonId),
                    eq(draftHomework.division, divisionId)
                )
            ),
        // Query B: All signups for the season with user info
        db
            .select({
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                male: users.male,
                pairPick: signups.pair_pick
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, seasonId)),
        // Query C: Teams with captains for this division+season
        db
            .select({
                teamId: teams.id,
                teamName: teams.name,
                teamNumber: teams.number,
                captainId: teams.captain,
                captain2Id: teams.captain2,
                c1FirstName: users.first_name,
                c1LastName: users.last_name,
                c1PreferredName: users.preferred_name,
                c1Email: users.email
            })
            .from(teams)
            .innerJoin(users, eq(teams.captain, users.id))
            .where(
                and(eq(teams.season, seasonId), eq(teams.division, divisionId))
            ),
        // Query D1: 3 most recent prior season IDs (weighted: index 0 = ×3, 1 = ×2, 2 = ×1)
        db
            .select({ id: seasons.id })
            .from(seasons)
            .where(lt(seasons.id, seasonId))
            .orderBy(desc(seasons.id))
            .limit(3)
    ])

    return {
        seasonRow,
        divisionRow,
        seasonDivisionRows,
        indivDiv,
        homeworkRows,
        signupRows,
        teamRows,
        priorSeasonIds: priorSeasonRows.map((r) => r.id)
    }
}

/** User info for the teams' (non-ghost) co-captains, by user id. */
async function loadCaptain2Users(
    teamRows: DraftPrepTeamRow[]
): Promise<Map<string, Captain2User>> {
    const captain2Ids = captain2IdsToLoad(teamRows)
    const captain2UserMap = new Map<string, Captain2User>()
    if (captain2Ids.length > 0) {
        const c2Rows = await db
            .select({
                id: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                email: users.email
            })
            .from(users)
            .where(inArray(users.id, captain2Ids))
        for (const row of c2Rows) {
            captain2UserMap.set(row.id, row)
        }
    }
    return captain2UserMap
}

/**
 * Query D2: draft picks for the prior seasons in this division for the
 * signed-up players, as userId → seasonId → draft round.
 */
async function loadPriorDraftHistory(
    playerIds: string[],
    priorSeasonIds: number[],
    divisionId: number
): Promise<Map<string, Map<number, number>>> {
    if (priorSeasonIds.length === 0 || playerIds.length === 0) {
        return new Map()
    }
    const priorDraftRows = await db
        .select({
            userId: drafts.user,
            seasonId: teams.season,
            round: drafts.round
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(
            and(
                inArray(drafts.user, playerIds),
                inArray(teams.season, priorSeasonIds),
                eq(teams.division, divisionId)
            )
        )
    return groupDraftHistory(priorDraftRows)
}

/** Query E: saved captain rounds, keyed by captain user id. */
async function loadSavedCaptainRounds(
    seasonId: number,
    divisionId: number,
    captains: CaptainInfo[]
): Promise<Record<string, number>> {
    const captainIds = captains.map((c) => c.userId)
    const savedRoundRows =
        captainIds.length > 0
            ? await db
                  .select({
                      captain: draftCaptRounds.captain,
                      round: draftCaptRounds.round
                  })
                  .from(draftCaptRounds)
                  .where(
                      and(
                          eq(draftCaptRounds.season, seasonId),
                          eq(draftCaptRounds.division, divisionId),
                          inArray(draftCaptRounds.captain, captainIds)
                      )
                  )
            : []
    const savedCaptainRounds: Record<string, number> = {}
    for (const row of savedRoundRows) {
        savedCaptainRounds[row.captain] = row.round
    }
    return savedCaptainRounds
}

/** Query F: saved pair diffs, keyed by `${player1}:${player2}`. */
async function loadSavedPairDiffs(
    seasonId: number,
    divisionId: number,
    pairDifferentials: PairDifferential[]
): Promise<Record<string, number>> {
    const pairPlayerIds = [
        ...new Set(
            pairDifferentials.flatMap((p) => [p.player1UserId, p.player2UserId])
        )
    ]
    const savedDiffRows =
        pairPlayerIds.length > 0
            ? await db
                  .select({
                      player1: draftPairDiffs.player1,
                      player2: draftPairDiffs.player2,
                      diff: draftPairDiffs.diff
                  })
                  .from(draftPairDiffs)
                  .where(
                      and(
                          eq(draftPairDiffs.season, seasonId),
                          eq(draftPairDiffs.division, divisionId),
                          inArray(draftPairDiffs.player1, pairPlayerIds)
                      )
                  )
            : []
    const savedPairDiffs: Record<string, number> = {}
    for (const row of savedDiffRows) {
        savedPairDiffs[`${row.player1}:${row.player2}`] = row.diff
    }
    return savedPairDiffs
}

/**
 * The "predraft to captains" email template. A failed lookup is logged and
 * yields empty values rather than failing the page.
 */
async function loadCaptainEmailTemplate(): Promise<
    Pick<
        PrepareForDraftData,
        "emailTemplate" | "emailTemplateContent" | "emailSubject"
    >
> {
    let emailTemplate = ""
    let emailTemplateContent: LexicalEmailTemplateContent | null = null
    let emailSubject = ""

    try {
        const [template] = await db
            .select({
                content: emailTemplates.content,
                subject: emailTemplates.subject
            })
            .from(emailTemplates)
            .where(eq(emailTemplates.name, "predraft to captains"))
            .limit(1)

        if (template) {
            emailTemplateContent = normalizeEmailTemplateContent(
                template.content
            )
            emailTemplate = extractPlainTextFromEmailTemplateContent(
                template.content
            )
            emailSubject = template.subject || ""
        }
    } catch (templateError) {
        logger.error(
            "Error fetching predraft to captains template",
            undefined,
            templateError
        )
    }

    return { emailTemplate, emailTemplateContent, emailSubject }
}

/** Whether any player has been drafted onto a team in this season+division. */
async function hasDivisionDrafted(
    seasonId: number,
    divisionId: number
): Promise<boolean> {
    const rows = await db
        .select({ id: drafts.id })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))
        .limit(1)
    return rows.length > 0
}

/**
 * The "considered but undrafted" section. It is only relevant in the window
 * after the immediately higher division has drafted and before this one has.
 */
async function loadConsideredButUndrafted(
    seasonId: number,
    divisionId: number,
    hierarchy: ReturnType<typeof resolveDivisionHierarchy>,
    signupRows: DraftPrepSignup[]
): Promise<PrepareForDraftData["consideredButUndrafted"]> {
    const {
        currentDivisionConfig,
        higherDivisionRows,
        immediatelyHigherDivision
    } = hierarchy

    if (!currentDivisionConfig || !immediatelyHigherDivision) {
        return {
            isRelevant: false,
            message:
                "This section is not relevant for this division right now.",
            players: []
        }
    }

    const [isCurrentDivisionDrafted, isImmediatelyHigherDivisionDrafted] =
        await Promise.all([
            hasDivisionDrafted(seasonId, divisionId),
            hasDivisionDrafted(seasonId, immediatelyHigherDivision.id)
        ])

    if (!isImmediatelyHigherDivisionDrafted) {
        return {
            isRelevant: false,
            message:
                "This section will become relevant after the next higher division has drafted.",
            players: []
        }
    }
    if (isCurrentDivisionDrafted) {
        return {
            isRelevant: false,
            message:
                "This section is no longer relevant because this division has already drafted.",
            players: []
        }
    }

    const higherDivisionIds = higherDivisionRows.map((row) => row.id)

    // fetchPlayerScores reads only drafts/ratings/evaluations for the
    // signups, so it runs alongside the homework and drafted-player reads.
    const [higherHomeworkRows, draftedThisSeasonRows, scoreByUser] =
        await Promise.all([
            higherDivisionIds.length > 0
                ? db
                      .select({
                          userId: users.id,
                          firstName: users.first_name,
                          lastName: users.last_name,
                          preferredName: users.preferred_name,
                          divisionId: draftHomework.division
                      })
                      .from(draftHomework)
                      .innerJoin(users, eq(draftHomework.player, users.id))
                      .where(
                          and(
                              eq(draftHomework.season, seasonId),
                              inArray(draftHomework.division, higherDivisionIds)
                          )
                      )
                : Promise.resolve([]),
            db
                .select({ userId: drafts.user })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .where(eq(teams.season, seasonId)),
            fetchPlayerScores(
                signupRows.map((row) => row.userId),
                seasonId
            )
        ])

    const players = buildConsideredButUndrafted(higherHomeworkRows, {
        draftedThisSeason: new Set(
            draftedThisSeasonRows.map((row) => row.userId)
        ),
        higherDivisionRows,
        signupRows,
        scoreByUser
    })

    return {
        isRelevant: true,
        message:
            players.length > 0
                ? "Players from higher-division draft homework who are still undrafted this season."
                : "No players from higher-division draft homework remain undrafted right now.",
        players
    }
}

export const getPrepareForDraftData = withAction(
    async (
        divisionIdParam?: number
    ): Promise<ActionResult<PrepareForDraftData>> => {
        // 1. Auth check
        const user = await getSessionUser()
        if (!user) {
            return fail("Not authenticated")
        }

        // 2. Season check
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return fail("No active season found")
        }
        const seasonId = config.seasonId

        // 3. Resolve access
        const access = await resolveCommissionerDivisionAccess(
            user.id,
            seasonId
        )
        if (access.type === "denied") {
            return fail("You are not authorized to access this page.")
        }

        // 4. Resolve divisionId and league-wide state
        const isLeagueWide =
            access.isLeagueWide || access.availableDivisions.length > 1
        const availableDivisions = access.availableDivisions
        const divisionId = pickDivisionId(availableDivisions, divisionIdParam)
        if (divisionId === null) {
            return fail("No divisions found for this season.")
        }

        // 5. Base lookups, then the homework and team model built from them
        const base = await loadDivisionBaseData(seasonId, divisionId)
        const { signupRows, indivDiv, priorSeasonIds } = base

        const { malePerTeam, nonMalePerTeam } = parseGenderSplit(
            indivDiv?.genderSplit
        )
        const homework = indexHomework(
            base.homeworkRows,
            (indivDiv?.numTeams ?? 0) * (malePerTeam + nonMalePerTeam)
        )

        // Co-captain users (keyed off the team rows) and prior draft history
        // (keyed off the signups and prior seasons) do not depend on each other.
        const [captain2UserMap, draftHistory] = await Promise.all([
            loadCaptain2Users(base.teamRows),
            loadPriorDraftHistory(
                signupRows.map((r) => r.userId),
                priorSeasonIds,
                divisionId
            )
        ])

        const { teams: teamInfos, captains } = buildTeamInfos(
            base.teamRows,
            captain2UserMap,
            homework.captainsFullyCompleted
        )

        // 6. Recommended rounds and pair differentials
        const players = buildPlayerRows(signupRows, {
            teams: teamInfos,
            homework,
            roundMaps: buildHomeworkRoundMaps(indivDiv?.genderSplit),
            draftHistory,
            priorSeasonIds
        })
        const pairDifferentials = buildPairDifferentials(
            players,
            signupRows,
            captains
        )

        // 7. Saved rounds/diffs, the captain email and the considered list
        // each read different tables and depend only on what is built above.
        const [
            savedCaptainRounds,
            savedPairDiffs,
            { emailTemplate, emailTemplateContent, emailSubject },
            consideredButUndrafted
        ] = await Promise.all([
            loadSavedCaptainRounds(seasonId, divisionId, captains),
            loadSavedPairDiffs(seasonId, divisionId, pairDifferentials),
            loadCaptainEmailTemplate(),
            loadConsideredButUndrafted(
                seasonId,
                divisionId,
                resolveDivisionHierarchy(base.seasonDivisionRows, divisionId),
                signupRows
            )
        ])

        return ok(
            {
                seasonId,
                seasonLabel: base.seasonRow
                    ? formatSeasonRowLabel(base.seasonRow)
                    : String(seasonId),
                divisionId,
                divisionName: base.divisionRow?.name ?? "",
                usesCoaches: indivDiv?.coaches ?? false,
                captains,
                teams: teamInfos,
                players,
                pairDifferentials,
                availableDivisions,
                isLeagueWide,
                savedCaptainRounds,
                savedPairDiffs,
                emailTemplate,
                emailTemplateContent,
                emailSubject,
                consideredButUndrafted
            },
            "Success"
        )
    }
)
