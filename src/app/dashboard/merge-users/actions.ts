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
    commissioners
} from "@/database/schema"
import { eq, lt, gt } from "drizzle-orm"
import { logAuditEntry } from "@/lib/audit-log"

const OLD_USER_CUTOFF = new Date("2026-02-01T00:00:01")
const NEW_USER_CUTOFF = new Date("2026-02-01T00:00:02")

export interface UserOption {
    id: string
    name: string
    email: string
    phone: string | null
    createdAt: Date
}

async function checkAdminAccess(userId: string): Promise<boolean> {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export async function getOldUsers(): Promise<UserOption[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return []
    }

    const hasAccess = await checkAdminAccess(session.user.id)
    if (!hasAccess) {
        return []
    }

    const results = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            email: users.email,
            phone: users.phone,
            createdAt: users.createdAt
        })
        .from(users)
        .where(lt(users.createdAt, OLD_USER_CUTOFF))
        .orderBy(users.last_name, users.first_name)

    return results.map((u) => ({
        id: u.id,
        name: `${u.preferredName || u.firstName} ${u.lastName}`,
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt
    }))
}

export async function getNewUsers(): Promise<UserOption[]> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return []
    }

    const hasAccess = await checkAdminAccess(session.user.id)
    if (!hasAccess) {
        return []
    }

    const results = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preffered_name,
            email: users.email,
            phone: users.phone,
            createdAt: users.createdAt
        })
        .from(users)
        .where(gt(users.createdAt, NEW_USER_CUTOFF))
        .orderBy(users.last_name, users.first_name)

    return results.map((u) => ({
        id: u.id,
        name: `${u.preferredName || u.firstName} ${u.lastName}`,
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt
    }))
}

export async function mergeUsers(
    oldUserId: string,
    newUserId: string
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
        return { status: false, message: "Not authenticated." }
    }

    const hasAccess = await checkAdminAccess(session.user.id)
    if (!hasAccess) {
        return { status: false, message: "Access denied." }
    }

    if (oldUserId === newUserId) {
        return {
            status: false,
            message: "Cannot merge a user with themselves."
        }
    }

    try {
        // Fetch old user data
        const [oldUser] = await db
            .select({
                old_id: users.old_id,
                picture: users.picture
            })
            .from(users)
            .where(eq(users.id, oldUserId))
            .limit(1)

        if (!oldUser) {
            return { status: false, message: "Old user not found." }
        }

        // Verify new user exists
        const [newUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, newUserId))
            .limit(1)

        if (!newUser) {
            return { status: false, message: "New user not found." }
        }

        // Copy old_id and picture to new user
        await db
            .update(users)
            .set({
                old_id: oldUser.old_id,
                picture: oldUser.picture,
                updatedAt: new Date()
            })
            .where(eq(users.id, newUserId))

        // Update signups:player
        await db
            .update(signups)
            .set({ player: newUserId })
            .where(eq(signups.player, oldUserId))

        // Update signups:pair_pick
        await db
            .update(signups)
            .set({ pair_pick: newUserId })
            .where(eq(signups.pair_pick, oldUserId))

        // Update teams:captain
        await db
            .update(teams)
            .set({ captain: newUserId })
            .where(eq(teams.captain, oldUserId))

        // Update drafts:user
        await db
            .update(drafts)
            .set({ user: newUserId })
            .where(eq(drafts.user, oldUserId))

        // Update waitlist:user
        await db
            .update(waitlist)
            .set({ user: newUserId })
            .where(eq(waitlist.user, oldUserId))

        // Update discounts:user
        await db
            .update(discounts)
            .set({ user: newUserId })
            .where(eq(discounts.user, oldUserId))

        // Update evaluations:player
        await db
            .update(evaluations)
            .set({ player: newUserId })
            .where(eq(evaluations.player, oldUserId))

        // Update commissioners:commissioner
        await db
            .update(commissioners)
            .set({ commissioner: newUserId })
            .where(eq(commissioners.commissioner, oldUserId))

        // Delete old user record
        await db.delete(users).where(eq(users.id, oldUserId))

        await logAuditEntry({
            userId: session.user.id,
            action: "merge",
            entityType: "users",
            entityId: newUserId,
            summary: `Merged user ${oldUserId} into ${newUserId} (old user deleted)`
        })

        return {
            status: true,
            message: "Users merged successfully."
        }
    } catch (error) {
        console.error("Error merging users:", error)
        return {
            status: false,
            message: "Something went wrong while merging users."
        }
    }
}
