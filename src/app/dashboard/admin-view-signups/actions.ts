"use server"

import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    teams,
    divisions,
    seasons,
    discounts
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export interface SignupEntry {
    signupId: number
    userId: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    phone: string | null
    male: boolean | null
    age: string | null
    captain: string | null
    amountPaid: string | null
    signupDate: Date
    isNew: boolean
    pairPickName: string | null
    pairReason: string | null
    experience: string | null
    assessment: string | null
    height: number | null
    picture: string | null
    skillPasser: boolean | null
    skillSetter: boolean | null
    skillHitter: boolean | null
    skillOther: boolean | null
    datesMissing: string | null
    playFirstWeek: boolean | null
    lastDraftSeason: string | null
    lastDraftDivision: string | null
    lastDraftCaptain: string | null
    lastDraftOverall: number | null
    discountCodeName: string | null
}

async function checkAdminAccess(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

export async function getSeasonSignups(): Promise<{
    status: boolean
    message?: string
    signups: SignupEntry[]
    seasonLabel: string
    lateAmount: string
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized",
            signups: [],
            seasonLabel: "",
            lateAmount: ""
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                signups: [],
                seasonLabel: "",
                lateAmount: ""
            }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const signupRows = await db
            .select({
                signupId: signups.id,
                userId: signups.player,
                oldId: users.old_id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preffered_name,
                email: users.email,
                phone: users.phone,
                male: users.male,
                age: signups.age,
                captain: signups.captain,
                amountPaid: signups.amount_paid,
                signupDate: signups.created_at,
                pairPickId: signups.pair_pick,
                pairReason: signups.pair_reason,
                experience: users.experience,
                assessment: users.assessment,
                height: users.height,
                picture: users.picture,
                skillPasser: users.skill_passer,
                skillSetter: users.skill_setter,
                skillHitter: users.skill_hitter,
                skillOther: users.skill_other,
                datesMissing: signups.dates_missing,
                playFirstWeek: signups.play_1st_week
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(eq(signups.season, config.seasonId))
            .orderBy(desc(signups.created_at), desc(signups.id))

        // Determine which users are new (no entry in drafts table)
        const userIds = signupRows.map((r) => r.userId)
        let draftedUserIds = new Set<string>()

        if (userIds.length > 0) {
            const draftedUsers = await db
                .select({ user: drafts.user })
                .from(drafts)
                .where(inArray(drafts.user, userIds))

            draftedUserIds = new Set(draftedUsers.map((d) => d.user))
        }

        // Fetch used discount codes for signup users and keep the most recent per user
        const usedDiscountByUserId = new Map<string, string>()

        if (userIds.length > 0) {
            const usedDiscountRows = await db
                .select({
                    userId: discounts.user,
                    discountId: discounts.id,
                    reason: discounts.reason
                })
                .from(discounts)
                .where(
                    and(
                        inArray(discounts.user, userIds),
                        eq(discounts.used, true)
                    )
                )
                .orderBy(desc(discounts.created_at), desc(discounts.id))

            for (const discount of usedDiscountRows) {
                if (!usedDiscountByUserId.has(discount.userId)) {
                    usedDiscountByUserId.set(
                        discount.userId,
                        discount.reason || `Discount #${discount.discountId}`
                    )
                }
            }
        }

        // Fetch pair pick user names
        const pairPickIds = signupRows
            .map((r) => r.pairPickId)
            .filter((id): id is string => id !== null)
        let pairPickNames = new Map<string, string>()

        if (pairPickIds.length > 0) {
            const pairPickUsers = await db
                .select({
                    id: users.id,
                    firstName: users.first_name,
                    lastName: users.last_name,
                    preferredName: users.preffered_name
                })
                .from(users)
                .where(inArray(users.id, pairPickIds))

            pairPickNames = new Map(
                pairPickUsers.map((u) => {
                    const preferred = u.preferredName
                        ? ` (${u.preferredName})`
                        : ""
                    return [u.id, `${u.firstName}${preferred} ${u.lastName}`]
                })
            )
        }

        // Fetch last draft information for each user
        const lastDraftInfo = new Map<
            string,
            {
                season: string
                division: string
                captain: string
                overall: number
            }
        >()

        if (userIds.length > 0) {
            const draftData = await db
                .select({
                    userId: drafts.user,
                    teamId: drafts.team,
                    overall: drafts.overall,
                    seasonYear: seasons.year,
                    seasonName: seasons.season,
                    divisionName: divisions.name,
                    captainId: teams.captain,
                    captainFirstName: users.first_name,
                    captainLastName: users.last_name,
                    captainPreferredName: users.preffered_name
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(seasons, eq(teams.season, seasons.id))
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .innerJoin(users, eq(teams.captain, users.id))
                .where(inArray(drafts.user, userIds))
                .orderBy(desc(seasons.year), desc(seasons.id))

            // Keep only the most recent draft for each user
            const processedUsers = new Set<string>()
            for (const draft of draftData) {
                if (!processedUsers.has(draft.userId)) {
                    const captainPreferred = draft.captainPreferredName
                        ? ` (${draft.captainPreferredName})`
                        : ""
                    const captainName = `${draft.captainFirstName}${captainPreferred} ${draft.captainLastName}`
                    const seasonLabel = `${draft.seasonName.charAt(0).toUpperCase() + draft.seasonName.slice(1)} ${draft.seasonYear}`

                    lastDraftInfo.set(draft.userId, {
                        season: seasonLabel,
                        division: draft.divisionName,
                        captain: captainName,
                        overall: draft.overall
                    })
                    processedUsers.add(draft.userId)
                }
            }
        }

        const entries: SignupEntry[] = signupRows.map((row) => {
            const lastDraft = lastDraftInfo.get(row.userId)
            return {
                signupId: row.signupId,
                userId: row.userId,
                oldId: row.oldId,
                firstName: row.firstName,
                lastName: row.lastName,
                preferredName: row.preferredName,
                email: row.email,
                phone: row.phone,
                male: row.male,
                age: row.age,
                captain: row.captain,
                amountPaid: row.amountPaid,
                signupDate: row.signupDate,
                isNew: !draftedUserIds.has(row.userId),
                pairPickName: row.pairPickId
                    ? (pairPickNames.get(row.pairPickId) ?? null)
                    : null,
                pairReason: row.pairReason,
                experience: row.experience,
                assessment: row.assessment,
                height: row.height,
                picture: row.picture,
                skillPasser: row.skillPasser,
                skillSetter: row.skillSetter,
                skillHitter: row.skillHitter,
                skillOther: row.skillOther,
                datesMissing: row.datesMissing,
                playFirstWeek: row.playFirstWeek,
                lastDraftSeason: lastDraft?.season ?? null,
                lastDraftDivision: lastDraft?.division ?? null,
                lastDraftCaptain: lastDraft?.captain ?? null,
                lastDraftOverall: lastDraft?.overall ?? null,
                discountCodeName: usedDiscountByUserId.get(row.userId) ?? null
            }
        })

        return {
            status: true,
            signups: entries,
            seasonLabel,
            lateAmount: config.lateAmount || ""
        }
    } catch (error) {
        console.error("Error fetching season signups:", error)
        return {
            status: false,
            message: "Something went wrong.",
            signups: [],
            seasonLabel: "",
            lateAmount: ""
        }
    }
}

export async function deleteSignupEntry(signupId: number): Promise<{
    status: boolean
    message: string
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "Unauthorized"
        }
    }

    if (!Number.isInteger(signupId) || signupId <= 0) {
        return {
            status: false,
            message: "Invalid signup id."
        }
    }

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return {
            status: false,
            message: "Not authenticated."
        }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found."
            }
        }

        const [signupRecord] = await db
            .select({
                id: signups.id,
                season: signups.season,
                player: signups.player,
                age: signups.age,
                captain: signups.captain,
                pair: signups.pair,
                pairPick: signups.pair_pick,
                pairReason: signups.pair_reason,
                datesMissing: signups.dates_missing,
                playFirstWeek: signups.play_1st_week,
                orderId: signups.order_id,
                amountPaid: signups.amount_paid,
                createdAt: signups.created_at
            })
            .from(signups)
            .where(
                and(
                    eq(signups.id, signupId),
                    eq(signups.season, config.seasonId)
                )
            )
            .limit(1)

        if (!signupRecord) {
            return {
                status: false,
                message: "Signup entry not found for the current season."
            }
        }

        await db
            .delete(signups)
            .where(
                and(
                    eq(signups.id, signupId),
                    eq(signups.season, config.seasonId)
                )
            )

        await logAuditEntry({
            userId: session.user.id,
            action: "delete",
            entityType: "signups",
            entityId: signupId,
            summary: `Deleted signup entry. Full deleted signup record: ${JSON.stringify(signupRecord)}`
        })

        return {
            status: true,
            message: "Signup entry deleted."
        }
    } catch (error) {
        console.error("Error deleting signup entry:", error)
        return {
            status: false,
            message: "Something went wrong."
        }
    }
}
