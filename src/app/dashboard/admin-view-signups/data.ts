import "server-only"

import { formatSeasonLabel } from "@/lib/season-utils"
import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import {
    users,
    signups,
    signupDrops,
    substitutions,
    drafts,
    discounts
} from "@/database/schema"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { getSeasonConfig } from "@/lib/site-config"
import { isAdminOrDirectorBySession } from "@/next/session"
import type { SignupDropCategory } from "@/lib/signup-drops-display"
import {
    getCaptainDivisionsByUser,
    getCurrentDraftDivisions,
    getLastDraftInfoByUser,
    getPlayerNamesById,
    getUnavailableDatesBySignup
} from "@/lib/roster"

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
    refInterest: boolean | null
    tryoutHelp: boolean | null
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
    /** Set when the player has an un-restored post-draft drop. */
    droppedAt: Date | null
    dropCategory: SignupDropCategory | null
    /** True once a permanent sub has replaced this player this season. */
    subbedOut: boolean
}

export interface SeasonSignupsData {
    signups: SignupEntry[]
    seasonLabel: string
    lateAmount: string
}

export const getSeasonSignups = withAction(
    async (): Promise<ActionResult<SeasonSignupsData>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const config = await getSeasonConfig()

            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const seasonLabel = formatSeasonLabel(config)

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
                    refInterest: signups.ref_interest,
                    tryoutHelp: signups.tryout_help,
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

            // The per-signup lookups below only depend on signupRows, so they
            // run in parallel instead of as a sequential waterfall.
            const userIds = signupRows.map((r) => r.userId)
            const signupIds = signupRows.map((r) => r.signupId)
            const pairPickIds = signupRows
                .map((r) => r.pairPickId)
                .filter((id): id is string => id !== null)

            const [
                draftedUserIds,
                unavailabilityMap,
                usedDiscountBySignupId,
                pairPickNames,
                lastDraftInfo,
                draftedInMap,
                captainDivisionMap,
                activeDropBySignupId,
                subbedOutUserIds
            ] = await Promise.all([
                // Which users are new (no entry in drafts table)
                (async () => {
                    if (userIds.length === 0) return new Set<string>()
                    const draftedUsers = await db
                        .select({ user: drafts.user })
                        .from(drafts)
                        .where(inArray(drafts.user, userIds))
                    return new Set(draftedUsers.map((d) => d.user))
                })(),
                // Player unavailability per signup
                getUnavailableDatesBySignup(signupIds),
                // Discounts consumed against *these* signups. Keying on
                // discounts.used alone would surface codes a player redeemed in an
                // earlier season, since `used` is a lifetime flag.
                (async () => {
                    const map = new Map<number, string>()
                    if (signupIds.length === 0) return map
                    const usedDiscountRows = await db
                        .select({
                            signupId: discounts.used_signup_id,
                            discountId: discounts.id,
                            reason: discounts.reason
                        })
                        .from(discounts)
                        .where(inArray(discounts.used_signup_id, signupIds))
                        .orderBy(desc(discounts.created_at), desc(discounts.id))

                    for (const discount of usedDiscountRows) {
                        if (discount.signupId === null) continue
                        if (!map.has(discount.signupId)) {
                            map.set(
                                discount.signupId,
                                discount.reason ||
                                    `Discount #${discount.discountId}`
                            )
                        }
                    }
                    return map
                })(),
                // Pair pick user names
                getPlayerNamesById(pairPickIds),
                // Last draft information for each user
                getLastDraftInfoByUser(userIds),
                // Current-season draft assignments
                getCurrentDraftDivisions(config.seasonId, userIds),
                // Current-season captain roles
                getCaptainDivisionsByUser(config.seasonId, userIds),
                // Un-restored drops for these signups (post-draft drops keep the
                // signup row alive, so they surface here as a badge)
                (async () => {
                    const map = new Map<
                        number,
                        { droppedAt: Date; category: SignupDropCategory }
                    >()
                    if (signupIds.length === 0) return map
                    const dropRows = await db
                        .select({
                            signupId: signupDrops.signup_id,
                            droppedAt: signupDrops.dropped_at,
                            category: signupDrops.reason_category
                        })
                        .from(signupDrops)
                        .where(
                            and(
                                eq(signupDrops.season, config.seasonId),
                                isNull(signupDrops.restored_at),
                                inArray(signupDrops.signup_id, signupIds)
                            )
                        )
                    for (const row of dropRows) {
                        map.set(row.signupId, {
                            droppedAt: row.droppedAt,
                            category: row.category
                        })
                    }
                    return map
                })(),
                // Users already replaced by a permanent sub this season
                (async () => {
                    if (userIds.length === 0) return new Set<string>()
                    const subRows = await db
                        .select({ originalUser: substitutions.original_user })
                        .from(substitutions)
                        .where(
                            and(
                                eq(substitutions.season, config.seasonId),
                                inArray(substitutions.original_user, userIds)
                            )
                        )
                    return new Set(subRows.map((r) => r.originalUser))
                })()
            ])

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
                    refInterest: row.refInterest,
                    tryoutHelp: row.tryoutHelp,
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
                    unavailableDates:
                        unavailabilityMap.get(row.signupId) ?? null,
                    lastDraftSeason: lastDraft?.seasonLabel ?? null,
                    lastDraftDivision: lastDraft?.divisionName ?? null,
                    lastDraftCaptain: lastDraft?.captainName ?? null,
                    lastDraftOverall: lastDraft?.overall ?? null,
                    discountCodeName:
                        usedDiscountBySignupId.get(row.signupId) ?? null,
                    captainIn: captainDivisionMap.get(row.userId) ?? null,
                    draftedIn:
                        draftedInMap.get(row.userId)?.divisionName ?? null,
                    seasonsList: row.seasonsList,
                    notificationList: row.notificationList,
                    droppedAt:
                        activeDropBySignupId.get(row.signupId)?.droppedAt ??
                        null,
                    dropCategory:
                        activeDropBySignupId.get(row.signupId)?.category ??
                        null,
                    subbedOut: subbedOutUserIds.has(row.userId)
                }
            })

            return ok({
                signups: entries,
                seasonLabel,
                lateAmount: config.lateAmount || ""
            })
        } catch (error) {
            logger.error("Error fetching season signups", undefined, error)
            return fail("Something went wrong.")
        }
    }
)

export interface SignupDropEntry {
    dropId: number
    signupId: number
    userId: string
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    stage: "pre_draft" | "post_draft"
    reasonCategory: SignupDropCategory
    reasonNote: string | null
    age: string | null
    amountPaid: string | null
    signupDate: Date
    droppedAt: Date
    droppedByName: string
    teamName: string | null
    divisionName: string | null
    restoredAt: Date | null
}

export const getSeasonDrops = withAction(
    async (): Promise<ActionResult<SignupDropEntry[]>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const config = await getSeasonConfig()
            if (!config.seasonId) {
                return fail("No current season found.")
            }

            const playerUser = alias(users, "player_user")
            const droppedByUser = alias(users, "dropped_by_user")

            const rows = await db
                .select({
                    dropId: signupDrops.id,
                    signupId: signupDrops.signup_id,
                    userId: signupDrops.player,
                    stage: signupDrops.stage,
                    reasonCategory: signupDrops.reason_category,
                    reasonNote: signupDrops.reason_note,
                    age: signupDrops.age,
                    amountPaid: signupDrops.amount_paid,
                    signupDate: signupDrops.created_at,
                    droppedAt: signupDrops.dropped_at,
                    teamName: signupDrops.team_name,
                    divisionName: signupDrops.division_name,
                    restoredAt: signupDrops.restored_at,
                    playerFirstName: playerUser.first_name,
                    playerLastName: playerUser.last_name,
                    playerPreferredName: playerUser.preferred_name,
                    playerEmail: playerUser.email,
                    droppedByName: droppedByUser.name
                })
                .from(signupDrops)
                .innerJoin(playerUser, eq(signupDrops.player, playerUser.id))
                .innerJoin(
                    droppedByUser,
                    eq(signupDrops.dropped_by, droppedByUser.id)
                )
                .where(eq(signupDrops.season, config.seasonId))
                .orderBy(desc(signupDrops.dropped_at))

            const entries: SignupDropEntry[] = rows.map((row) => ({
                dropId: row.dropId,
                signupId: row.signupId,
                userId: row.userId,
                firstName: row.playerFirstName,
                lastName: row.playerLastName,
                preferredName: row.playerPreferredName,
                email: row.playerEmail,
                stage: row.stage,
                reasonCategory: row.reasonCategory,
                reasonNote: row.reasonNote,
                age: row.age,
                amountPaid: row.amountPaid,
                signupDate: row.signupDate,
                droppedAt: row.droppedAt,
                droppedByName: row.droppedByName ?? "Unknown",
                teamName: row.teamName,
                divisionName: row.divisionName,
                restoredAt: row.restoredAt
            }))

            return ok(entries)
        } catch (error) {
            logger.error("Error fetching season drops", undefined, error)
            return fail("Failed to load dropped players.")
        }
    }
)
