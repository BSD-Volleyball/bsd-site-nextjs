import { formatSeasonLabel } from "@/lib/season-utils"
import "server-only"

import { db } from "@/database/db"
import { users, signups, seasons } from "@/database/schema"
import { eq, inArray, desc } from "drizzle-orm"
import { hasCaptainPagesAccessBySession } from "@/next/session"
import {
    type ActionResult,
    fail,
    ok,
    requireSeasonConfig,
    withAction
} from "@/next/action-helpers"
import { getLastDraftInfoByUser, getCurrentDraftDivisions } from "@/lib/roster"
import { formatDisplayName } from "@/lib/utils"

export interface SignupPlayer {
    userId: string
    displayName: string
    pairedWith: string | null
    pairedWithId: string | null
    gender: string
    age: string | null
    height: number | null
}

export interface SignupGroup {
    groupLabel: string
    seasonOrder: number
    players: SignupPlayer[]
}

export interface SeasonInfo {
    id: number
    year: number
    name: string
}

export const getSignupsData = withAction(
    async (): Promise<
        ActionResult<{
            undraftedGroups: SignupGroup[]
            draftedGroups: SignupGroup[]
            allSeasons: SeasonInfo[]
            seasonLabel: string
        }>
    > => {
        const hasAccess = await hasCaptainPagesAccessBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        const config = await requireSeasonConfig()

        const seasonLabel = formatSeasonLabel(config)

        // Fetch all signups for the current season
        const signupRows = await db
            .select({
                userId: signups.player,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                male: users.male,
                age: signups.age,
                height: users.height,
                pairPickId: signups.pair_pick
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))
            .orderBy(users.last_name, users.first_name)

        if (signupRows.length === 0) {
            return ok({
                undraftedGroups: [],
                draftedGroups: [],
                allSeasons: [],
                seasonLabel
            })
        }

        const userIds = signupRows.map((r) => r.userId)

        // These lookups only depend on signupRows — run them in parallel
        const pairPickIds = signupRows
            .map((r) => r.pairPickId)
            .filter((id): id is string => id !== null)

        const [lastDraftMap, pairPickUsers, draftedInMap, allSeasonRows] =
            await Promise.all([
                // Last draft information for each user
                getLastDraftInfoByUser(userIds),
                // Pair pick names
                pairPickIds.length > 0
                    ? db
                          .select({
                              id: users.id,
                              firstName: users.first_name,
                              lastName: users.last_name,
                              preferredName: users.preferred_name
                          })
                          .from(users)
                          .where(inArray(users.id, pairPickIds))
                    : Promise.resolve([]),
                // Current-season draft assignments with division level
                getCurrentDraftDivisions(config.seasonId, userIds),
                // All seasons for chart gap detection
                db
                    .select({
                        id: seasons.id,
                        year: seasons.year,
                        name: seasons.season
                    })
                    .from(seasons)
                    .orderBy(desc(seasons.id))
                    .limit(11)
            ])

        const pairPickNames = new Map<string, string>()
        for (const u of pairPickUsers) {
            const displayName = formatDisplayName(
                u.firstName,
                u.lastName,
                u.preferredName
            )
            pairPickNames.set(u.id, displayName)
        }

        // Group undrafted players by their last drafted division,
        // and drafted players by their current-season division
        const undraftedGroupMap = new Map<string, SignupPlayer[]>()
        const undraftedGroupOrderMap = new Map<string, number>()
        const draftedGroupMap = new Map<string, SignupPlayer[]>()
        const draftedGroupOrderMap = new Map<string, number>()

        function sortGroupPlayers(players: SignupPlayer[]) {
            players.sort((a, b) => {
                const genderOrder = { Male: 0, "Non-Male": 1, Unknown: 2 }
                const genderCompare =
                    genderOrder[a.gender as keyof typeof genderOrder] -
                    genderOrder[b.gender as keyof typeof genderOrder]
                if (genderCompare !== 0) return genderCompare
                const aLastName = a.displayName.split(" ").pop() || ""
                const bLastName = b.displayName.split(" ").pop() || ""
                return aLastName.localeCompare(bLastName)
            })
        }

        for (const row of signupRows) {
            const displayName = formatDisplayName(
                row.firstName,
                row.lastName,
                row.preferredName
            )

            const gender =
                row.male === null ? "Unknown" : row.male ? "Male" : "Non-Male"

            const player: SignupPlayer = {
                userId: row.userId,
                displayName,
                pairedWith: row.pairPickId
                    ? (pairPickNames.get(row.pairPickId) ?? null)
                    : null,
                pairedWithId: row.pairPickId,
                gender,
                age: row.age,
                height: row.height
            }

            const currentDraft = draftedInMap.get(row.userId)

            if (currentDraft) {
                const { divisionName, divisionLevel } = currentDraft
                if (!draftedGroupMap.has(divisionName)) {
                    draftedGroupMap.set(divisionName, [])
                    draftedGroupOrderMap.set(divisionName, divisionLevel)
                }
                draftedGroupMap.get(divisionName)!.push(player)
            } else {
                const lastDraft = lastDraftMap.get(row.userId)
                const groupLabel = lastDraft
                    ? lastDraft.divisionName
                    : "New Players"
                const divisionOrder = lastDraft ? lastDraft.divisionLevel : 999

                if (!undraftedGroupMap.has(groupLabel)) {
                    undraftedGroupMap.set(groupLabel, [])
                    undraftedGroupOrderMap.set(groupLabel, divisionOrder)
                }
                undraftedGroupMap.get(groupLabel)!.push(player)
            }
        }

        for (const group of undraftedGroupMap.values()) sortGroupPlayers(group)
        for (const group of draftedGroupMap.values()) sortGroupPlayers(group)

        const undraftedGroups: SignupGroup[] = Array.from(
            undraftedGroupMap.entries()
        ).map(([label, players]) => ({
            groupLabel: label,
            seasonOrder: undraftedGroupOrderMap.get(label)!,
            players
        }))
        undraftedGroups.sort((a, b) => {
            if (a.groupLabel === "New Players") return -1
            if (b.groupLabel === "New Players") return 1
            return a.seasonOrder - b.seasonOrder
        })

        const draftedGroups: SignupGroup[] = Array.from(
            draftedGroupMap.entries()
        ).map(([label, players]) => ({
            groupLabel: label,
            seasonOrder: draftedGroupOrderMap.get(label)!,
            players
        }))
        draftedGroups.sort((a, b) => a.seasonOrder - b.seasonOrder)

        return ok({
            undraftedGroups,
            draftedGroups,
            allSeasons: allSeasonRows.map((s) => ({
                id: s.id,
                year: s.year,
                name: s.name
            })),
            seasonLabel
        })
    }
)
