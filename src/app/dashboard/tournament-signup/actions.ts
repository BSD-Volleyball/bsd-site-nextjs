"use server"

import { SquareClient, SquareEnvironment } from "square"
import { randomUUID } from "node:crypto"
import { db } from "@/database/db"
import {
    divisions,
    tournamentDivisions,
    tournamentRoster,
    tournamentTeams,
    tournamentWaitlist,
    users
} from "@/database/schema"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import {
    fail,
    ok,
    requireSession,
    withAction,
    type ActionResult
} from "@/lib/action-helpers"
import {
    getTournamentAvailability,
    getTournamentConfig,
    getCurrentTournamentCost,
    isRegistrationClosed,
    isUserOnTournamentRoster
} from "@/lib/tournament-config"
import { getActiveWaiver, recordWaiverAcceptance } from "@/lib/waivers"
import { logAuditEntry } from "@/lib/audit-log"
import {
    calculateDiscountedAmount,
    getActiveDiscountForUser,
    markDiscountAsUsed
} from "@/lib/discount"

const getSquareClient = () =>
    new SquareClient({
        token: process.env.SQUARE_ACCESS_TOKEN,
        environment:
            process.env.SQUARE_ENVIRONMENT === "production"
                ? SquareEnvironment.Production
                : SquareEnvironment.Sandbox
    })

export interface TournamentSignupFormData {
    teamName: string
    preferredDivisionId: number
    rosterUserIds: string[] // does NOT include captain — server adds them
}

export interface EligiblePlayer {
    id: string
    name: string
    male: boolean | null
}

/**
 * Players eligible to be rostered: not already on any team in this tournament.
 * Returned with gender so the client can group into male / non-male columns
 * and enforce per-division caps as the captain picks.
 */
export const getEligibleTournamentPlayers = withAction(
    async (tournamentId: number): Promise<ActionResult<EligiblePlayer[]>> => {
        await requireSession()

        const rostered = await db
            .select({ userId: tournamentRoster.user_id })
            .from(tournamentRoster)
            .where(eq(tournamentRoster.tournament_id, tournamentId))
        const exclude = rostered.map((r) => r.userId)

        const rows =
            exclude.length === 0
                ? await db
                      .select({
                          id: users.id,
                          first_name: users.first_name,
                          last_name: users.last_name,
                          preferred_name: users.preferred_name,
                          male: users.male
                      })
                      .from(users)
                      .orderBy(users.last_name, users.first_name)
                : await db
                      .select({
                          id: users.id,
                          first_name: users.first_name,
                          last_name: users.last_name,
                          preferred_name: users.preferred_name,
                          male: users.male
                      })
                      .from(users)
                      .where(notInArray(users.id, exclude))
                      .orderBy(users.last_name, users.first_name)

        return ok(
            rows.map((u) => ({
                id: u.id,
                name: `${u.first_name}${u.preferred_name ? ` (${u.preferred_name})` : ""} ${u.last_name}`,
                male: u.male
            }))
        )
    }
)

async function validateRosterAgainstDivision(
    tournamentId: number,
    captainUserId: string,
    preferredDivisionId: number,
    rosterUserIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
    const [division] = await db
        .select({
            id: tournamentDivisions.id,
            name: divisions.name,
            male_per_team: tournamentDivisions.male_per_team,
            non_male_per_team: tournamentDivisions.non_male_per_team
        })
        .from(tournamentDivisions)
        .innerJoin(divisions, eq(divisions.id, tournamentDivisions.division_id))
        .where(
            and(
                eq(tournamentDivisions.tournament_id, tournamentId),
                eq(tournamentDivisions.id, preferredDivisionId)
            )
        )
        .limit(1)
    if (!division)
        return { ok: false, message: "Preferred division not found." }

    const allIds = [...new Set([captainUserId, ...rosterUserIds])]
    if (new Set(allIds).size !== 1 + rosterUserIds.length) {
        return { ok: false, message: "Duplicate players in roster." }
    }

    // Check none are already on a team in this tournament.
    if (allIds.length > 0) {
        const existing = await db
            .select({ userId: tournamentRoster.user_id })
            .from(tournamentRoster)
            .where(
                and(
                    eq(tournamentRoster.tournament_id, tournamentId),
                    inArray(tournamentRoster.user_id, allIds)
                )
            )
        if (existing.length > 0) {
            return {
                ok: false,
                message:
                    "One or more selected players are already on a team in this tournament."
            }
        }
    }

    // Validate gender caps using users.male.
    const userRows = await db
        .select({ id: users.id, male: users.male })
        .from(users)
        .where(inArray(users.id, allIds))
    const males = userRows.filter((u) => u.male === true).length
    const nonMales = userRows.filter((u) => u.male === false).length
    if (males > division.male_per_team) {
        return {
            ok: false,
            message: `Roster exceeds male cap (${males} / ${division.male_per_team}) for ${division.name}.`
        }
    }
    if (nonMales > division.non_male_per_team) {
        return {
            ok: false,
            message: `Roster exceeds non-male cap (${nonMales} / ${division.non_male_per_team}) for ${division.name}.`
        }
    }
    return { ok: true }
}

export const submitTournamentSignup = withAction(
    async (
        sourceId: string | null,
        formData: TournamentSignupFormData,
        waiverId: number,
        discountId?: number
    ): Promise<
        ActionResult<{
            paymentId?: string
            receiptUrl?: string
        }>
    > => {
        const session = await requireSession()
        const userId = session.user.id

        const config = await getTournamentConfig()
        if (!config) return fail("No active tournament.")
        if (isRegistrationClosed(config)) {
            return fail("Registration is closed for this tournament.")
        }

        const activeWaiver = await getActiveWaiver()
        if (!activeWaiver || activeWaiver.id !== waiverId) {
            return fail(
                "The waiver was updated. Please reload and re-confirm the current waiver."
            )
        }

        if (!formData.teamName.trim()) return fail("Team name is required.")
        if (!Number.isInteger(formData.preferredDivisionId)) {
            return fail("Preferred division is required.")
        }

        if (await isUserOnTournamentRoster(config.tournamentId, userId)) {
            return fail("You are already on a team in this tournament.")
        }

        const validation = await validateRosterAgainstDivision(
            config.tournamentId,
            userId,
            formData.preferredDivisionId,
            formData.rosterUserIds
        )
        if (!validation.ok) return fail(validation.message)

        // Final capacity check right before payment — guards against the race
        // where another captain claims the last spot while this user has the
        // signup page loaded. Mirrors validateFinalSignupAvailability on the
        // season side.
        const availability = await getTournamentAvailability(config)
        const target = availability.divisions.find(
            (d) => d.divisionId === formData.preferredDivisionId
        )
        if (!target) {
            return fail("Preferred division not found.")
        }
        if (target.full) {
            return fail(
                `${target.divisionName} just filled up. Please reload and pick a different division.`
            )
        }
        if (availability.allDivisionsFull) {
            return fail(
                "All divisions are now full. Please join the waitlist instead."
            )
        }

        const originalAmount = getCurrentTournamentCost(config)
        if (BigInt(Math.round(parseFloat(originalAmount) * 100)) <= BigInt(0)) {
            return fail("Tournament cost is not configured.")
        }

        let finalAmount = originalAmount
        let discountInfo:
            | { id: number; percentage: string; originalAmount: string }
            | undefined
        if (discountId !== undefined) {
            const discount = await getActiveDiscountForUser(
                userId,
                "tournament"
            )
            if (discount && discount.id === discountId) {
                finalAmount = calculateDiscountedAmount(
                    originalAmount,
                    discount.percentage
                )
                discountInfo = {
                    id: discount.id,
                    percentage: discount.percentage,
                    originalAmount
                }
            }
        }

        const amountCents = BigInt(Math.round(parseFloat(finalAmount) * 100))
        const isFree = amountCents <= BigInt(0)

        let paymentId: string | undefined
        let receiptUrl: string | undefined

        if (!isFree) {
            if (!sourceId) {
                return fail("Payment information is required.")
            }
            try {
                const client = getSquareClient()
                const response = await client.payments.create({
                    idempotencyKey: randomUUID(),
                    sourceId,
                    amountMoney: { currency: "USD", amount: amountCents },
                    buyerEmailAddress: session.user.email,
                    note: `Volleyball Tournament ${config.name} (${config.year})`
                })
                if (!response.payment) return fail("Payment processing failed.")
                paymentId = response.payment.id ?? undefined
                receiptUrl = response.payment.receiptUrl ?? undefined
            } catch (error) {
                console.error("Tournament signup payment error:", error)
                return fail("Payment failed. Please try again.")
            }
        }

        await recordWaiverAcceptance(userId, activeWaiver.id)

        const [team] = await db
            .insert(tournamentTeams)
            .values({
                tournament_id: config.tournamentId,
                preferred_division_id: formData.preferredDivisionId,
                captain_user_id: userId,
                name: formData.teamName.trim(),
                order_id: paymentId ?? null,
                amount_paid: finalAmount
            })
            .returning({ id: tournamentTeams.id })

        const rosterIds = [userId, ...formData.rosterUserIds]
        await db.insert(tournamentRoster).values(
            rosterIds.map((rid) => ({
                tournament_id: config.tournamentId,
                team_id: team.id,
                user_id: rid,
                added_by_user_id: userId
            }))
        )

        // Mark any waitlist row for rostered users as placed on this team —
        // we keep the row (it's the historical record of the player's
        // pre-acceptance of the waiver) rather than delete it.
        await db
            .update(tournamentWaitlist)
            .set({ placed_team_id: team.id, approved: true })
            .where(
                and(
                    eq(tournamentWaitlist.tournament_id, config.tournamentId),
                    inArray(tournamentWaitlist.user_id, rosterIds)
                )
            )

        if (discountInfo) {
            await markDiscountAsUsed(discountInfo.id)
        }

        await logAuditEntry({
            userId,
            action: "create_tournament_signup",
            entityType: "tournament",
            entityId: config.tournamentId,
            summary: `Captain signed up team "${formData.teamName.trim()}" for ${config.name} ($${finalAmount}, ${rosterIds.length} players)${discountInfo ? ` (${discountInfo.percentage}% discount applied)` : ""}`
        })

        return ok({ paymentId, receiptUrl })
    }
)
