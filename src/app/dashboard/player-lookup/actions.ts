"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { users, signups, seasons } from "@/database/schema"
import { eq, desc } from "drizzle-orm"

export interface PlayerListItem {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preffered_name: string | null
}

export interface PlayerDetails {
    id: string
    old_id: number | null
    name: string | null
    first_name: string
    last_name: string
    preffered_name: string | null
    email: string
    emailVerified: boolean
    phone: string | null
    pronouns: string | null
    emergency_contact: string | null
    experience: string | null
    assessment: string | null
    height: number | null
    skill_setter: boolean | null
    skill_hitter: boolean | null
    skill_passer: boolean | null
    skill_other: boolean | null
    role: string | null
    male: boolean | null
    onboarding_completed: boolean | null
    picture: string | null
    createdAt: Date
    updatedAt: Date
}

export interface PlayerSignup {
    id: number
    seasonId: number
    seasonCode: string
    seasonYear: number
    seasonName: string
    age: string | null
    captain: string | null
    pair: boolean | null
    pairPickId: string | null
    pairPickName: string | null
    pairReason: string | null
    datesMissing: string | null
    play1stWeek: boolean | null
    orderId: string | null
    amountPaid: string | null
    createdAt: Date
}

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

export async function getPlayersForLookup(): Promise<{
    status: boolean
    message?: string
    players: PlayerListItem[]
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            players: []
        }
    }

    try {
        const allUsers = await db
            .select({
                id: users.id,
                old_id: users.old_id,
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name
            })
            .from(users)
            .orderBy(users.last_name, users.first_name)

        return {
            status: true,
            players: allUsers
        }
    } catch (error) {
        console.error("Error fetching players:", error)
        return {
            status: false,
            message: "Something went wrong.",
            players: []
        }
    }
}

export async function getPlayerDetails(playerId: string): Promise<{
    status: boolean
    message?: string
    player: PlayerDetails | null
    signupHistory: PlayerSignup[]
}> {
    const hasAccess = await checkAdminAccess()
    if (!hasAccess) {
        return {
            status: false,
            message: "You don't have permission to access this page.",
            player: null,
            signupHistory: []
        }
    }

    try {
        const [player] = await db
            .select({
                id: users.id,
                old_id: users.old_id,
                name: users.name,
                first_name: users.first_name,
                last_name: users.last_name,
                preffered_name: users.preffered_name,
                email: users.email,
                emailVerified: users.emailVerified,
                phone: users.phone,
                pronouns: users.pronouns,
                emergency_contact: users.emergency_contact,
                experience: users.experience,
                assessment: users.assessment,
                height: users.height,
                skill_setter: users.skill_setter,
                skill_hitter: users.skill_hitter,
                skill_passer: users.skill_passer,
                skill_other: users.skill_other,
                role: users.role,
                male: users.male,
                onboarding_completed: users.onboarding_completed,
                picture: users.picture,
                createdAt: users.createdAt,
                updatedAt: users.updatedAt
            })
            .from(users)
            .where(eq(users.id, playerId))
            .limit(1)

        if (!player) {
            return {
                status: false,
                message: "Player not found.",
                player: null,
                signupHistory: []
            }
        }

        // Fetch signup history with season info
        const signupData = await db
            .select({
                id: signups.id,
                seasonId: signups.season,
                seasonCode: seasons.code,
                seasonYear: seasons.year,
                seasonName: seasons.season,
                age: signups.age,
                captain: signups.captain,
                pair: signups.pair,
                pairPickId: signups.pair_pick,
                pairReason: signups.pair_reason,
                datesMissing: signups.dates_missing,
                play1stWeek: signups.play_1st_week,
                orderId: signups.order_id,
                amountPaid: signups.amount_paid,
                createdAt: signups.created_at
            })
            .from(signups)
            .innerJoin(seasons, eq(signups.season, seasons.id))
            .where(eq(signups.player, playerId))
            .orderBy(desc(seasons.id))

        // Fetch pair pick names for each signup that has one
        const signupHistory: PlayerSignup[] = await Promise.all(
            signupData.map(async (signup) => {
                let pairPickName: string | null = null
                if (signup.pairPickId) {
                    const [pairUser] = await db
                        .select({
                            first_name: users.first_name,
                            last_name: users.last_name
                        })
                        .from(users)
                        .where(eq(users.id, signup.pairPickId))
                        .limit(1)

                    if (pairUser) {
                        pairPickName = `${pairUser.first_name} ${pairUser.last_name}`
                    }
                }

                return {
                    ...signup,
                    pairPickName
                }
            })
        )

        return {
            status: true,
            player,
            signupHistory
        }
    } catch (error) {
        console.error("Error fetching player details:", error)
        return {
            status: false,
            message: "Something went wrong.",
            player: null,
            signupHistory: []
        }
    }
}
