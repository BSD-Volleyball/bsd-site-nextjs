"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail, requireSeasonConfig } from "@/lib/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    users,
    signups,
    signupDrops,
    substitutions,
    draftHomework,
    drafts,
    teams,
    divisions,
    discounts,
    userUnavailability,
    seasonEvents
} from "@/database/schema"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { getSeasonConfig, formatEventDate } from "@/lib/site-config"
import { getSessionUser, isAdminOrDirectorBySession } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import {
    SIGNUP_DROP_CATEGORIES,
    type SignupDropCategory
} from "@/lib/signup-drops-display"
import { formatPlayerName } from "@/lib/utils"
import { getLastDraftInfoByUser, getCurrentDraftDivisions } from "@/lib/roster"
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

export async function getSeasonSignups(): Promise<{
    status: boolean
    message?: string
    signups: SignupEntry[]
    seasonLabel: string
    lateAmount: string
}> {
    const hasAccess = await isAdminOrDirectorBySession()
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
            (async () => {
                const map = new Map<number, string>()
                if (signupIds.length === 0) return map
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
                    map.set(sid, dates.join(", "))
                }
                return map
            })(),
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
            (async () => {
                if (pairPickIds.length === 0) return new Map<string, string>()
                const pairPickUsers = await db
                    .select({
                        id: users.id,
                        firstName: users.first_name,
                        lastName: users.last_name,
                        preferredName: users.preferred_name
                    })
                    .from(users)
                    .where(inArray(users.id, pairPickIds))

                return new Map(
                    pairPickUsers.map((u) => [
                        u.id,
                        formatPlayerName(
                            u.firstName,
                            u.lastName,
                            u.preferredName
                        )
                    ])
                )
            })(),
            // Last draft information for each user
            getLastDraftInfoByUser(userIds),
            // Current-season draft assignments
            getCurrentDraftDivisions(config.seasonId, userIds),
            // Current-season captain roles
            (async () => {
                const map = new Map<string, string>()
                if (userIds.length === 0) return map
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
                    map.set(team.captainId, team.divisionName)
                }
                return map
            })(),
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
                unavailableDates: unavailabilityMap.get(row.signupId) ?? null,
                lastDraftSeason: lastDraft?.seasonLabel ?? null,
                lastDraftDivision: lastDraft?.divisionName ?? null,
                lastDraftCaptain: lastDraft?.captainName ?? null,
                lastDraftOverall: lastDraft?.overall ?? null,
                discountCodeName:
                    usedDiscountBySignupId.get(row.signupId) ?? null,
                captainIn: captainDivisionMap.get(row.userId) ?? null,
                draftedIn: draftedInMap.get(row.userId)?.divisionName ?? null,
                seasonsList: row.seasonsList,
                notificationList: row.notificationList,
                droppedAt:
                    activeDropBySignupId.get(row.signupId)?.droppedAt ?? null,
                dropCategory:
                    activeDropBySignupId.get(row.signupId)?.category ?? null,
                subbedOut: subbedOutUserIds.has(row.userId)
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

const signupMirrorSelection = {
    id: signups.id,
    season: signups.season,
    player: signups.player,
    age: signups.age,
    captain: signups.captain,
    pair: signups.pair,
    pairPick: signups.pair_pick,
    pairReason: signups.pair_reason,
    refInterest: signups.ref_interest,
    tryoutHelp: signups.tryout_help,
    orderId: signups.order_id,
    amountPaid: signups.amount_paid,
    createdAt: signups.created_at
}

/**
 * Drops a player from the current season.
 *
 * Undrafted players (pre-draft): the signup row is archived into signup_drops
 * (with everything needed to restore it) and deleted. Drafted players
 * (post-draft): only a drop record is inserted — the signup and roster slot
 * stay until a permanent sub is locked in.
 */
export const dropSignup = withAction(
    async (
        signupId: number,
        category: SignupDropCategory,
        note: string
    ): Promise<ActionResult<{ stage: "pre_draft" | "post_draft" }>> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (!Number.isInteger(signupId) || signupId <= 0) {
            return fail("Invalid signup id.")
        }

        if (!SIGNUP_DROP_CATEGORIES.includes(category)) {
            return fail("Invalid drop reason category.")
        }

        const trimmedNote = note?.trim() || null

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return fail("Not authenticated.")
        }

        const config = await requireSeasonConfig()

        try {
            const [signupRecord] = await db
                .select(signupMirrorSelection)
                .from(signups)
                .where(
                    and(
                        eq(signups.id, signupId),
                        eq(signups.season, config.seasonId)
                    )
                )
                .limit(1)

            if (!signupRecord) {
                return fail("Signup entry not found for the current season.")
            }

            const [existingDrop] = await db
                .select({ id: signupDrops.id })
                .from(signupDrops)
                .where(
                    and(
                        eq(signupDrops.season, config.seasonId),
                        eq(signupDrops.player, signupRecord.player),
                        isNull(signupDrops.restored_at)
                    )
                )
                .limit(1)
            if (existingDrop) {
                return fail("This player already has an active drop record.")
            }

            const mirrorValues = {
                signup_id: signupRecord.id,
                season: signupRecord.season,
                player: signupRecord.player,
                age: signupRecord.age,
                captain: signupRecord.captain,
                pair: signupRecord.pair,
                pair_pick: signupRecord.pairPick,
                pair_reason: signupRecord.pairReason,
                ref_interest: signupRecord.refInterest,
                tryout_help: signupRecord.tryoutHelp,
                order_id: signupRecord.orderId,
                amount_paid: signupRecord.amountPaid,
                created_at: signupRecord.createdAt,
                reason_category: category,
                reason_note: trimmedNote,
                dropped_by: session.user.id
            }

            const draftedInMap = await getCurrentDraftDivisions(
                config.seasonId,
                [signupRecord.player]
            )

            if (draftedInMap.has(signupRecord.player)) {
                // POST-DRAFT: record the drop only. The signup and the drafts
                // row stay so the roster slot remains visible until a
                // permanent sub is locked in.
                const [teamRow] = await db
                    .select({
                        teamName: teams.name,
                        divisionName: divisions.name
                    })
                    .from(drafts)
                    .innerJoin(teams, eq(drafts.team, teams.id))
                    .innerJoin(divisions, eq(teams.division, divisions.id))
                    .where(
                        and(
                            eq(drafts.user, signupRecord.player),
                            eq(teams.season, config.seasonId)
                        )
                    )
                    .limit(1)

                await db.transaction(async (tx) => {
                    await tx.insert(signupDrops).values({
                        ...mirrorValues,
                        stage: "post_draft",
                        team_name: teamRow?.teamName ?? null,
                        division_name: teamRow?.divisionName ?? null
                    })

                    await logAuditEntry(
                        {
                            userId: session.user.id,
                            action: "drop",
                            entityType: "signups",
                            entityId: signupId,
                            summary: `Dropped drafted player (post-draft, signup and roster slot kept). Category: ${category}.${trimmedNote ? ` Note: ${trimmedNote}.` : ""} Signup record: ${JSON.stringify(signupRecord)}`
                        },
                        tx
                    )
                })

                revalidatePath("/dashboard/admin-view-signups")
                return ok(
                    { stage: "post_draft" },
                    "Player marked as dropped. Their signup and roster slot are kept until a permanent sub is locked in."
                )
            }

            // PRE-DRAFT: archive everything the delete would destroy, then
            // delete the signup.
            await db.transaction(async (tx) => {
                const unavailRows = await tx
                    .select({ eventId: userUnavailability.event_id })
                    .from(userUnavailability)
                    .where(eq(userUnavailability.signup_id, signupId))
                const eventIds = unavailRows.map((r) => r.eventId)

                const homeworkRows = await tx
                    .select()
                    .from(draftHomework)
                    .where(
                        and(
                            eq(draftHomework.season, config.seasonId),
                            eq(draftHomework.player, signupRecord.player)
                        )
                    )

                // Captured before the delete: signups deletion sets
                // discounts.used_signup_id to NULL via FK.
                const [usedDiscount] = await tx
                    .select({ id: discounts.id })
                    .from(discounts)
                    .where(eq(discounts.used_signup_id, signupId))
                    .limit(1)

                await tx.insert(signupDrops).values({
                    ...mirrorValues,
                    stage: "pre_draft",
                    unavailability_event_ids: eventIds,
                    draft_homework_snapshot: homeworkRows,
                    discount_id: usedDiscount?.id ?? null
                })

                // Cascades to userUnavailability, nulls discounts.used_signup_id
                await tx.delete(signups).where(eq(signups.id, signupId))

                // Remove this player from any captain's draft homework board
                await tx
                    .delete(draftHomework)
                    .where(
                        and(
                            eq(draftHomework.season, config.seasonId),
                            eq(draftHomework.player, signupRecord.player)
                        )
                    )

                await logAuditEntry(
                    {
                        userId: session.user.id,
                        action: "drop",
                        entityType: "signups",
                        entityId: signupId,
                        summary: `Dropped signup (pre-draft, signup archived and deleted). Category: ${category}.${trimmedNote ? ` Note: ${trimmedNote}.` : ""} Signup record: ${JSON.stringify(signupRecord)}`
                    },
                    tx
                )
            })

            revalidatePath("/dashboard/admin-view-signups")
            return ok({ stage: "pre_draft" }, "Signup dropped.")
        } catch (error) {
            console.error("Error dropping signup:", error)
            return fail("Something went wrong.")
        }
    }
)

/**
 * Reverses a drop. Post-draft drops (signup still live) are simply marked
 * restored. Pre-draft drops re-insert the signup with its original id and
 * bring back the archived availability, discount link, and draft homework.
 */
export const restoreDrop = withAction(
    async (dropId: number): Promise<ActionResult> => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        if (!Number.isInteger(dropId) || dropId <= 0) {
            return fail("Invalid drop id.")
        }

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user) {
            return fail("Not authenticated.")
        }

        try {
            const [drop] = await db
                .select()
                .from(signupDrops)
                .where(eq(signupDrops.id, dropId))
                .limit(1)

            if (!drop) {
                return fail("Drop record not found.")
            }
            if (drop.restored_at !== null) {
                return fail("This drop has already been restored.")
            }

            const restoredFields = {
                restored_at: new Date(),
                restored_by: session.user.id
            }

            if (drop.stage === "post_draft") {
                // Signup and roster slot were never removed.
                await db.transaction(async (tx) => {
                    await tx
                        .update(signupDrops)
                        .set(restoredFields)
                        .where(eq(signupDrops.id, dropId))

                    await logAuditEntry(
                        {
                            userId: session.user.id,
                            action: "restore",
                            entityType: "signups",
                            entityId: drop.signup_id,
                            summary: `Restored post-draft drop #${dropId} for player ${drop.player} (season ${drop.season}).`
                        },
                        tx
                    )
                })

                revalidatePath("/dashboard/admin-view-signups")
                return ok(undefined, "Drop restored.")
            }

            // PRE-DRAFT: the signup row must come back.
            const [liveSignup] = await db
                .select({ id: signups.id })
                .from(signups)
                .where(
                    and(
                        eq(signups.season, drop.season),
                        eq(signups.player, drop.player)
                    )
                )
                .limit(1)
            if (liveSignup) {
                return fail(
                    "This player already has a live signup for that season."
                )
            }

            await db.transaction(async (tx) => {
                // Original id is safe to reuse: the sequence already allocated
                // it, so future serial inserts cannot collide.
                await tx.insert(signups).values({
                    id: drop.signup_id,
                    season: drop.season,
                    player: drop.player,
                    age: drop.age,
                    captain: drop.captain,
                    pair: drop.pair,
                    pair_pick: drop.pair_pick,
                    pair_reason: drop.pair_reason,
                    ref_interest: drop.ref_interest,
                    tryout_help: drop.tryout_help,
                    order_id: drop.order_id,
                    amount_paid: drop.amount_paid,
                    created_at: drop.created_at
                })

                const eventIds = drop.unavailability_event_ids ?? []
                if (eventIds.length > 0) {
                    await tx
                        .insert(userUnavailability)
                        .values(
                            eventIds.map((eventId) => ({
                                user_id: drop.player,
                                signup_id: drop.signup_id,
                                event_id: eventId
                            }))
                        )
                        .onConflictDoNothing()
                }

                // Re-link the discount redemption only if the discount has not
                // been pointed at another signup since.
                if (drop.discount_id !== null) {
                    await tx
                        .update(discounts)
                        .set({ used_signup_id: drop.signup_id })
                        .where(
                            and(
                                eq(discounts.id, drop.discount_id),
                                isNull(discounts.used_signup_id)
                            )
                        )
                }

                const homeworkRows = drop.draft_homework_snapshot ?? []
                if (homeworkRows.length > 0) {
                    await tx
                        .insert(draftHomework)
                        .values(
                            homeworkRows.map((row) => ({
                                season: row.season as number,
                                captain: row.captain as string,
                                division: row.division as number,
                                round: row.round as number,
                                slot: row.slot as number,
                                player: row.player as string,
                                is_male_tab: row.is_male_tab as boolean
                            }))
                        )
                        .onConflictDoNothing()
                }

                await tx
                    .update(signupDrops)
                    .set(restoredFields)
                    .where(eq(signupDrops.id, dropId))

                await logAuditEntry(
                    {
                        userId: session.user.id,
                        action: "restore",
                        entityType: "signups",
                        entityId: drop.signup_id,
                        summary: `Restored pre-draft drop #${dropId}: re-created signup ${drop.signup_id} for player ${drop.player} (season ${drop.season}) with ${(drop.unavailability_event_ids ?? []).length} availability rows.`
                    },
                    tx
                )
            })

            revalidatePath("/dashboard/admin-view-signups")
            return ok(undefined, "Drop restored. The signup is live again.")
        } catch (error) {
            console.error("Error restoring drop:", error)
            return fail("Something went wrong.")
        }
    }
)

export async function logAdminCsvDownload(): Promise<void> {
    const user = await getSessionUser()
    if (!user) return

    const config = await getSeasonConfig()

    await logAuditEntry({
        userId: user.id,
        action: "read",
        entityType: "signups",
        summary: `Downloaded admin signups CSV for season ${config.seasonId ?? "unknown"}`
    })
}

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

export async function getSeasonDrops(): Promise<{
    status: boolean
    message: string
    entries: SignupDropEntry[]
}> {
    const hasAccess = await isAdminOrDirectorBySession()
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

        return { status: true, message: "", entries }
    } catch (error) {
        console.error("Error fetching season drops:", error)
        return {
            status: false,
            message: "Failed to load dropped players.",
            entries: []
        }
    }
}
