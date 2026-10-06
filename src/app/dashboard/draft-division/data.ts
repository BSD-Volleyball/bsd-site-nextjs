import "server-only"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    divisions,
    individual_divisions,
    teams,
    drafts,
    signups
} from "@/database/schema"
import { eq, and, or } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import {
    isAdminOrDirector,
    isCommissionerForCurrentSeason,
    getCommissionerDivisionScope
} from "@/lib/rbac"
import { type ActionResult, fail, ok, withAction } from "@/next/action-helpers"

export interface DivisionSplitConfig {
    divisionId: number
    genderSplit: string
}

export interface DivisionOption {
    id: number
    name: string
    level: number
}

export interface UserOption {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
    male: boolean | null
    picture: string | null
}

export async function hasDraftPageAccess(): Promise<{
    hasAccess: boolean
    isLeagueWideCommissioner: boolean
    accessibleDivisionIds: number[]
    divisionRoleById: Record<number, "commissioner" | "captain">
    captainTeamIdsByDivision: Record<number, number[]>
    defaultDivisionId: number | null
}> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return {
            hasAccess: false,
            isLeagueWideCommissioner: false,
            accessibleDivisionIds: [],
            divisionRoleById: {},
            captainTeamIdsByDivision: {},
            defaultDivisionId: null
        }
    }

    const userId = session.user.id
    const config = await getSeasonConfig()
    if (!config.seasonId) {
        return {
            hasAccess: false,
            isLeagueWideCommissioner: false,
            accessibleDivisionIds: [],
            divisionRoleById: {},
            captainTeamIdsByDivision: {},
            defaultDivisionId: null
        }
    }

    const seasonId = config.seasonId

    // Always check captain status and admin/commissioner status in parallel.
    // Captain role takes priority over admin/commissioner in divisions
    // where the user is a captain.
    const [isAdmin, isCommissioner, captainTeams] = await Promise.all([
        isAdminOrDirector(userId),
        isCommissionerForCurrentSeason(userId),
        db
            .select({ id: teams.id, division: teams.division })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    or(eq(teams.captain, userId), eq(teams.captain2, userId))
                )
            )
    ])

    const captainTeamIdsByDivision: Record<number, number[]> = {}
    for (const team of captainTeams) {
        captainTeamIdsByDivision[team.division] = [
            ...(captainTeamIdsByDivision[team.division] ?? []),
            team.id
        ]
    }

    const captainDivisionIds = Object.keys(captainTeamIdsByDivision)
        .map((divisionId) => Number(divisionId))
        .sort((a, b) => a - b)
    const divisionRoleById: Record<number, "commissioner" | "captain"> = {}
    for (const divisionId of captainDivisionIds) {
        divisionRoleById[divisionId] = "captain"
    }

    if (isAdmin) {
        return {
            hasAccess: true,
            isLeagueWideCommissioner: true,
            accessibleDivisionIds: captainDivisionIds,
            divisionRoleById,
            captainTeamIdsByDivision,
            defaultDivisionId: captainDivisionIds[0] ?? null
        }
    }

    if (isCommissioner) {
        const scope = await getCommissionerDivisionScope(userId, seasonId)

        if (scope.type === "league_wide") {
            return {
                hasAccess: true,
                isLeagueWideCommissioner: true,
                accessibleDivisionIds: captainDivisionIds,
                divisionRoleById,
                captainTeamIdsByDivision,
                defaultDivisionId: captainDivisionIds[0] ?? null
            }
        }

        if (scope.type === "division_specific") {
            for (const divisionId of scope.divisionIds) {
                // Captain role takes priority — only set commissioner for
                // divisions where the user is NOT a captain
                if (!captainDivisionIds.includes(divisionId)) {
                    divisionRoleById[divisionId] = "commissioner"
                }
            }

            const accessibleDivisionIds = [
                ...new Set([...scope.divisionIds, ...captainDivisionIds])
            ].sort((a, b) => a - b)

            return {
                hasAccess: true,
                isLeagueWideCommissioner: false,
                accessibleDivisionIds,
                divisionRoleById,
                captainTeamIdsByDivision,
                defaultDivisionId: accessibleDivisionIds[0] ?? null
            }
        }
    }

    if (captainDivisionIds.length > 0) {
        return {
            hasAccess: true,
            isLeagueWideCommissioner: false,
            accessibleDivisionIds: captainDivisionIds,
            divisionRoleById,
            captainTeamIdsByDivision,
            defaultDivisionId: captainDivisionIds[0] ?? null
        }
    }

    return {
        hasAccess: false,
        isLeagueWideCommissioner: false,
        accessibleDivisionIds: [],
        divisionRoleById: {},
        captainTeamIdsByDivision: {},
        defaultDivisionId: null
    }
}

export interface DraftDivisionData {
    currentSeasonId: number
    divisionSplits: DivisionSplitConfig[]
    divisions: DivisionOption[]
    users: UserOption[]
}

export const getDraftDivisionData = withAction(
    async (): Promise<ActionResult<DraftDivisionData>> => {
        // Division scope is derived server-side. This action used to accept
        // the caller's accessibleDivisionIds, which let a direct request pass
        // `undefined` and read every division plus the undrafted-player list,
        // bypassing commissioner division scoping.
        const access = await hasDraftPageAccess()
        if (!access.hasAccess) {
            return fail("You don't have permission to access this page.")
        }
        const accessibleDivisionIds = access.isLeagueWideCommissioner
            ? undefined
            : access.accessibleDivisionIds

        const config = await getSeasonConfig()
        const seasonId = config.seasonId || 0

        const [allDivisions, allUsers, splitRows, draftedRows] =
            await Promise.all([
                db
                    .select({
                        id: divisions.id,
                        name: divisions.name,
                        level: divisions.level
                    })
                    .from(divisions)
                    .orderBy(divisions.level),
                seasonId > 0
                    ? db
                          .select({
                              id: users.id,
                              old_id: users.old_id,
                              first_name: users.first_name,
                              last_name: users.last_name,
                              preferred_name: users.preferred_name,
                              male: users.male,
                              picture: users.picture
                          })
                          .from(users)
                          .innerJoin(
                              signups,
                              and(
                                  eq(signups.player, users.id),
                                  eq(signups.season, seasonId)
                              )
                          )
                          .orderBy(users.last_name, users.first_name)
                    : Promise.resolve([]),
                seasonId > 0
                    ? db
                          .select({
                              divisionId: individual_divisions.division,
                              genderSplit: individual_divisions.gender_split
                          })
                          .from(individual_divisions)
                          .where(eq(individual_divisions.season, seasonId))
                    : Promise.resolve([]),
                seasonId > 0
                    ? db
                          .selectDistinct({ userId: drafts.user })
                          .from(drafts)
                          .innerJoin(teams, eq(drafts.team, teams.id))
                          .where(eq(teams.season, seasonId))
                    : Promise.resolve([])
            ])

        const draftedUserIds = new Set(draftedRows.map((r) => r.userId))
        const undraftedUsers = allUsers.filter((u) => !draftedUserIds.has(u.id))

        const configuredDivisionIds = new Set(
            splitRows
                .filter((r) => r.divisionId !== null)
                .map((r) => r.divisionId as number)
        )

        const filteredDivisions = allDivisions.filter(
            (d) =>
                configuredDivisionIds.has(d.id) &&
                (accessibleDivisionIds === undefined ||
                    accessibleDivisionIds.includes(d.id))
        )

        return ok({
            currentSeasonId: seasonId,
            divisionSplits: splitRows
                .filter((r) => r.divisionId !== null)
                .map((r) => ({
                    divisionId: r.divisionId as number,
                    genderSplit: r.genderSplit ?? "5-3"
                })),
            divisions: filteredDivisions,
            users: undraftedUsers
        })
    }
)
