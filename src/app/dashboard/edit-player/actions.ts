"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import {
    users,
    signups,
    teams,
    drafts,
    waitlist,
    discounts,
    evaluations,
    commissioners,
    sessions,
    accounts
} from "@/database/schema"
import { eq, and } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { logAuditEntry } from "@/lib/audit-log"

async function checkAdminAccess(): Promise<boolean> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return false

    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export async function getUsers(): Promise<{ id: string; name: string }[]> {
    const allUsers = await db
        .select({
            id: users.id,
            first_name: users.first_name,
            last_name: users.last_name,
            preffered_name: users.preffered_name
        })
        .from(users)
        .orderBy(users.last_name, users.first_name)

    return allUsers.map((u) => {
        const preferredPart = u.preffered_name ? ` (${u.preffered_name})` : ""
        return {
            id: u.id,
            name: `${u.first_name}${preferredPart} ${u.last_name}`
        }
    })
}

export interface UserDetails {
    id: string
    name: string | null
    first_name: string
    last_name: string
    preffered_name: string | null
    email: string
    emailVerified: boolean
    image: string | null
    avatar: string | null
    avatarUrl: string | null
    createdAt: Date
    updatedAt: Date
    old_id: number | null
    picture: string | null
    phone: string | null
    experience: string | null
    assessment: string | null
    height: number | null
    skill_setter: boolean | null
    skill_hitter: boolean | null
    skill_passer: boolean | null
    skill_other: boolean | null
    emergency_contact: string | null
    referred_by: string | null
    pronouns: string | null
    role: string | null
    male: boolean | null
    onboarding_completed: boolean | null
    captain_eligible: boolean
}

export async function getUserDetails(
    userId: string
): Promise<{ status: boolean; message?: string; user?: UserDetails }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)

        if (!user) {
            return { status: false, message: "User not found" }
        }

        return { status: true, user: user as UserDetails }
    } catch (error) {
        console.error("Error fetching user details:", error)
        return { status: false, message: "Failed to load user details." }
    }
}

export async function updateUser(
    originalId: string,
    data: {
        id?: string
        name?: string | null
        first_name?: string
        last_name?: string
        preffered_name?: string | null
        email?: string
        emailVerified?: boolean
        image?: string | null
        avatar?: string | null
        avatarUrl?: string | null
        old_id?: number | null
        picture?: string | null
        phone?: string | null
        experience?: string | null
        assessment?: string | null
        height?: number | null
        skill_setter?: boolean | null
        skill_hitter?: boolean | null
        skill_passer?: boolean | null
        skill_other?: boolean | null
        emergency_contact?: string | null
        referred_by?: string | null
        pronouns?: string | null
        role?: string | null
        male?: boolean | null
        onboarding_completed?: boolean | null
        captain_eligible?: boolean
    }
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    const isIdChanging = data.id !== undefined && data.id !== originalId

    try {
        if (isIdChanging) {
            const newId = data.id as string

            if (!newId.trim()) {
                return { status: false, message: "ID cannot be empty." }
            }

            // Check if new ID already exists
            const [existing] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, newId))
                .limit(1)

            if (existing) {
                return {
                    status: false,
                    message: "A user with that ID already exists."
                }
            }

            // Update within a transaction to cascade ID changes
            await db.transaction(async (tx) => {
                // Update all referencing tables first
                await tx
                    .update(sessions)
                    .set({ userId: newId })
                    .where(eq(sessions.userId, originalId))
                await tx
                    .update(accounts)
                    .set({ userId: newId })
                    .where(eq(accounts.userId, originalId))
                await tx
                    .update(signups)
                    .set({ player: newId })
                    .where(eq(signups.player, originalId))
                await tx
                    .update(signups)
                    .set({ pair_pick: newId })
                    .where(eq(signups.pair_pick, originalId))
                await tx
                    .update(teams)
                    .set({ captain: newId })
                    .where(eq(teams.captain, originalId))
                await tx
                    .update(drafts)
                    .set({ user: newId })
                    .where(eq(drafts.user, originalId))
                await tx
                    .update(waitlist)
                    .set({ user: newId })
                    .where(eq(waitlist.user, originalId))
                await tx
                    .update(discounts)
                    .set({ user: newId })
                    .where(eq(discounts.user, originalId))
                await tx
                    .update(evaluations)
                    .set({ player: newId })
                    .where(eq(evaluations.player, originalId))
                await tx
                    .update(commissioners)
                    .set({ commissioner: newId })
                    .where(eq(commissioners.commissioner, originalId))

                // Now update the user record itself (including ID and other fields)
                const { id: _newId, ...otherFields } = data
                await tx
                    .update(users)
                    .set({
                        ...otherFields,
                        id: newId,
                        updatedAt: new Date()
                    })
                    .where(eq(users.id, originalId))
            })
        } else {
            // Normal update without ID change
            const { id: _id, ...updateFields } = data
            await db
                .update(users)
                .set({
                    ...updateFields,
                    updatedAt: new Date()
                })
                .where(eq(users.id, originalId))
        }

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            const effectiveId = isIdChanging ? data.id! : originalId
            const [updatedUser] = await db
                .select({
                    first_name: users.first_name,
                    last_name: users.last_name
                })
                .from(users)
                .where(eq(users.id, effectiveId))
                .limit(1)
            const userName = updatedUser
                ? `${updatedUser.first_name} ${updatedUser.last_name}`
                : originalId
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "users",
                entityId: effectiveId,
                summary: `Admin updated user ${userName} (${originalId})${isIdChanging ? ` (ID changed to ${data.id})` : ""}`
            })
        }

        return { status: true, message: "User updated successfully." }
    } catch (error) {
        console.error("Error updating user:", error)
        return { status: false, message: "Failed to update user." }
    }
}

export interface SignupDetails {
    id: number
    season: number
    seasonLabel: string
    age: string | null
    captain: string | null
    pair: boolean | null
    pair_pick: string | null
    pair_reason: string | null
    dates_missing: string | null
    play_1st_week: boolean | null
    order_id: string | null
    amount_paid: string | null
    created_at: Date
}

export async function getSignupForCurrentSeason(
    userId: string
): Promise<{ status: boolean; signup?: SignupDetails }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false }
    }

    try {
        const config = await getSeasonConfig()

        if (!config.seasonId) {
            return { status: true }
        }

        const seasonLabel = `${config.seasonName.charAt(0).toUpperCase() + config.seasonName.slice(1)} ${config.seasonYear}`

        const [signup] = await db
            .select()
            .from(signups)
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    eq(signups.player, userId)
                )
            )
            .limit(1)

        if (!signup) {
            return { status: true }
        }

        return {
            status: true,
            signup: {
                id: signup.id,
                season: signup.season,
                seasonLabel,
                age: signup.age,
                captain: signup.captain,
                pair: signup.pair,
                pair_pick: signup.pair_pick,
                pair_reason: signup.pair_reason,
                dates_missing: signup.dates_missing,
                play_1st_week: signup.play_1st_week,
                order_id: signup.order_id,
                amount_paid: signup.amount_paid,
                created_at: signup.created_at
            }
        }
    } catch (error) {
        console.error("Error fetching signup:", error)
        return { status: false }
    }
}

export async function updateSignup(
    signupId: number,
    data: {
        age?: string | null
        captain?: string | null
        pair?: boolean | null
        pair_pick?: string | null
        pair_reason?: string | null
        dates_missing?: string | null
        play_1st_week?: boolean | null
        amount_paid?: string | null
    }
): Promise<{ status: boolean; message: string }> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        await db.update(signups).set(data).where(eq(signups.id, signupId))

        const session = await auth.api.getSession({ headers: await headers() })
        if (session) {
            const [signup] = await db
                .select({ player: signups.player })
                .from(signups)
                .where(eq(signups.id, signupId))
                .limit(1)
            let playerName = `signup #${signupId}`
            if (signup) {
                const [player] = await db
                    .select({
                        first_name: users.first_name,
                        last_name: users.last_name
                    })
                    .from(users)
                    .where(eq(users.id, signup.player))
                    .limit(1)
                if (player) {
                    playerName = `${player.first_name} ${player.last_name}`
                }
            }
            await logAuditEntry({
                userId: session.user.id,
                action: "update",
                entityType: "signups",
                entityId: signupId,
                summary: `Admin updated signup #${signupId} for ${playerName}`
            })
        }

        return { status: true, message: "Signup updated successfully." }
    } catch (error) {
        console.error("Error updating signup:", error)
        return { status: false, message: "Failed to update signup." }
    }
}
