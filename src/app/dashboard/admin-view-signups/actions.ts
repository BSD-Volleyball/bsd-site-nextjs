"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    users,
    signups,
    deletedSignups,
    draftHomework,
    drafts,
    teams,
    divisions,
    seasons,
    discounts,
    userUnavailability,
    seasonEvents
} from "@/database/schema"
import { and, desc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { getSeasonConfig, formatEventDate } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export interface SignupEntry {
    signupId: number
    userId: string
    oldId: number
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
    unavailableDates: string | null
    lastDraftSeason: string | null
    lastDraftDivision: string | null
    lastDraftCaptain: string | null
    lastDraftOverall: number | null
    discountCodeName: string | null
    captainIn: string | null
    draftedIn: string | null
    seasonsList: string
    notificationList: string
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
                preferredName: users.preferred_name,
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
                seasonsList: users.seasons_list,
                notificationList: users.notification_list
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

        // Fetch player unavailability per signup
        const signupIds = signupRows.map((r) => r.signupId)
        const unavailabilityMap = new Map<number, string>()

        if (signupIds.length > 0) {
            const unavailRows = await db
                .select({
                    signupId: userUnavailability.signup_id,
                    eventDate: seasonEvents.event_date
                })
                .from(userUnavailability)
                .innerJoin(
                    seasonEvents,
                    eq(seasonEvents.id, userUnavailability.event_id)
                )
                .where(inArray(userUnavailability.signup_id, signupIds))

            const bySignup = new Map<number, string[]>()
            for (const row of unavailRows) {
                const dates = bySignup.get(row.signupId!) || []
                dates.push(formatEventDate(row.eventDate))
                bySignup.set(row.signupId!, dates)
            }
            for (const [sid, dates] of bySignup) {
                unavailabilityMap.set(sid, dates.join(", "))
            }
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
                    preferredName: users.preferred_name
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
                    captainPreferredName: users.preferred_name
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

        // Fetch current-season draft assignments
        const draftedInMap = new Map<string, string>()

        if (userIds.length > 0) {
            const draftedRows = await db
                .select({
                    userId: drafts.user,
                    divisionName: divisions.name
                })
                .from(drafts)
                .innerJoin(teams, eq(drafts.team, teams.id))
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(
                    and(
                        eq(teams.season, config.seasonId),
                        inArray(drafts.user, userIds)
                    )
                )

            for (const draft of draftedRows) {
                draftedInMap.set(draft.userId, draft.divisionName)
            }
        }

        // Fetch current-season captain roles
        const captainDivisionMap = new Map<string, string>()

        if (userIds.length > 0) {
            const captainTeams = await db
                .select({
                    captainId: teams.captain,
                    divisionName: divisions.name
                })
                .from(teams)
                .innerJoin(divisions, eq(teams.division, divisions.id))
                .where(
                    and(
                        eq(teams.season, config.seasonId),
                        inArray(teams.captain, userIds)
                    )
                )

            for (const team of captainTeams) {
                captainDivisionMap.set(team.captainId, team.divisionName)
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
                unavailableDates: unavailabilityMap.get(row.signupId) ?? null,
                lastDraftSeason: lastDraft?.season ?? null,
                lastDraftDivision: lastDraft?.division ?? null,
                lastDraftCaptain: lastDraft?.captain ?? null,
                lastDraftOverall: lastDraft?.overall ?? null,
                discountCodeName: usedDiscountByUserId.get(row.userId) ?? null,
                captainIn: captainDivisionMap.get(row.userId) ?? null,
                draftedIn: draftedInMap.get(row.userId) ?? null,
                seasonsList: row.seasonsList,
                notificationList: row.notificationList
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

export async function deleteSignupEntry(
    signupId: number,
    reason: string
): Promise<{
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

    const trimmedReason = reason?.trim() ?? ""
    if (!trimmedReason) {
        return {
            status: false,
            message: "A reason for deletion is required."
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

        // Archive the signup record before deletion
        await db.insert(deletedSignups).values({
            id: signupRecord.id,
            season: signupRecord.season,
            player: signupRecord.player,
            age: signupRecord.age,
            captain: signupRecord.captain,
            pair: signupRecord.pair,
            pair_pick: signupRecord.pairPick,
            pair_reason: signupRecord.pairReason,
            order_id: signupRecord.orderId,
            amount_paid: signupRecord.amountPaid,
            created_at: signupRecord.createdAt,
            deleted_at: new Date(),
            deleted_by: session.user.id,
            reason: trimmedReason
        })

        // Delete the signup (cascades to userUnavailability)
        await db
            .delete(signups)
            .where(
                and(
                    eq(signups.id, signupId),
                    eq(signups.season, config.seasonId)
                )
            )

        // Remove this player from any captain's draft homework for the season
        await db
            .delete(draftHomework)
            .where(
                and(
                    eq(draftHomework.season, config.seasonId),
                    eq(draftHomework.player, signupRecord.player)
                )
            )

        await logAuditEntry({
            userId: session.user.id,
            action: "delete",
            entityType: "signups",
            entityId: signupId,
            summary: `Deleted signup entry. Reason: ${trimmedReason}. Full deleted signup record: ${JSON.stringify(signupRecord)}`
        })

        revalidatePath("/dashboard/admin-view-signups")
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

export async function logAdminCsvDownload(): Promise<void> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return

    const config = await getSeasonConfig()

    await logAuditEntry({
        userId: session.user.id,
        action: "read",
        entityType: "signups",
        summary: `Downloaded admin signups CSV for season ${config.seasonId ?? "unknown"}`
    })
}

export interface DeletedSignupEntry {
    signupId: number
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    age: string | null
    captain: string | null
    amountPaid: string | null
    signupDate: Date
    deletedAt: Date
    deletedByName: string
    reason: string | null
}

export async function getDeletedSignups(): Promise<{
    status: boolean
    message: string
    entries: DeletedSignupEntry[]
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized", entries: [] }
    }

    try {
        const config = await getSeasonConfig()
        if (!config.seasonId) {
            return {
                status: false,
                message: "No current season found.",
                entries: []
            }
        }

        const playerUser = alias(users, "player_user")
        const deletedByUser = alias(users, "deleted_by_user")

        const rows = await db
            .select({
                signupId: deletedSignups.id,
                userId: deletedSignups.player,
                age: deletedSignups.age,
                captain: deletedSignups.captain,
                amountPaid: deletedSignups.amount_paid,
                signupDate: deletedSignups.created_at,
                deletedAt: deletedSignups.deleted_at,
                reason: deletedSignups.reason,
                playerFirstName: playerUser.first_name,
                playerLastName: playerUser.last_name,
                playerPreferredName: playerUser.preferred_name,
                playerEmail: playerUser.email,
                deletedByName: deletedByUser.name
            })
            .from(deletedSignups)
            .innerJoin(playerUser, eq(deletedSignups.player, playerUser.id))
            .innerJoin(
                deletedByUser,
                eq(deletedSignups.deleted_by, deletedByUser.id)
            )
            .where(eq(deletedSignups.season, config.seasonId))
            .orderBy(desc(deletedSignups.deleted_at))

        const entries: DeletedSignupEntry[] = rows.map((row) => ({
            signupId: row.signupId,
            userId: row.userId,
            firstName: row.playerFirstName,
            lastName: row.playerLastName,
            preferredName: row.playerPreferredName,
            email: row.playerEmail,
            age: row.age,
            captain: row.captain,
            amountPaid: row.amountPaid,
            signupDate: row.signupDate,
            deletedAt: row.deletedAt,
            deletedByName: row.deletedByName ?? "Unknown",
            reason: row.reason
        }))

        return { status: true, message: "", entries }
    } catch (error) {
        console.error("Error fetching deleted signups:", error)
        return {
            status: false,
            message: "Failed to load deleted signups.",
            entries: []
        }
    }
}
