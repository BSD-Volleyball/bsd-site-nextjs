"use server"

import type { ActionResult } from "@/lib/action-helpers"
import { withAction, ok, fail } from "@/lib/action-helpers"
import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    champions,
    divisions,
    eventTimeSlots,
    individual_divisions,
    matches,
    seasonEvents,
    seasons,
    teams
} from "@/database/schema"
import { and, asc, eq, desc, inArray, isNull, or } from "drizzle-orm"
import { isAdminOrDirectorBySession, getSessionUserId } from "@/lib/rbac"
import { logAuditEntry } from "@/lib/audit-log"
import {
    type SeasonPhase,
    PHASE_CONFIG,
    isValidPhaseTransition,
    isValidPhaseRevert
} from "@/lib/season-phases"
import { cleanupSeasonRecipientGroups } from "@/lib/email-recipients"
import { getDivisionChampions } from "@/lib/playoff-champions"
import { seedPlayoffs } from "./seed-playoffs"

export const advanceSeasonPhase = withAction(
    async (
        seasonId: number,
        targetPhase: SeasonPhase
    ): Promise<ActionResult> => {
        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) {
            return fail("Unauthorized")
        }

        if (!seasonId || seasonId <= 0) {
            return fail("Invalid season ID")
        }

        try {
            const [season] = await db
                .select({ id: seasons.id, phase: seasons.phase })
                .from(seasons)
                .where(eq(seasons.id, seasonId))
                .limit(1)

            if (!season) {
                return fail("Season not found")
            }

            const currentPhase = season.phase as SeasonPhase
            if (!isValidPhaseTransition(currentPhase, targetPhase)) {
                return fail(
                    `Cannot advance from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
                )
            }

            let seedingSummary: string | null = null
            let championsSummary: string | null = null

            if (targetPhase === "complete") {
                const champs = await getDivisionChampions(seasonId)
                const missing = champs.filter((c) => c.teamId === null)
                if (missing.length > 0) {
                    return fail(
                        `Cannot advance to Complete: no champion determined for ${missing.map((m) => m.divisionName).join(", ")}. Finish the playoff bracket(s) first.`
                    )
                }

                const teamIds = champs
                    .map((c) => c.teamId)
                    .filter((id): id is number => id !== null)

                const teamRows = teamIds.length
                    ? await db
                          .select({
                              id: teams.id,
                              pictureUrl: teams.picture_url
                          })
                          .from(teams)
                          .where(inArray(teams.id, teamIds))
                    : []
                // teams.picture_url is an R2 object key (e.g.
                // "teamphotos/123/team45.jpg"). The Hall of Champions renders
                // champions.picture as an <img src> directly, so we need to
                // store an absolute URL — matching the historical convention
                // populated by scripts/archive/import-hoc-champions.ts.
                const picBase = (process.env.PLAYER_PIC_URL ?? "").replace(
                    /\/+$/,
                    ""
                )
                const pictureByTeam = new Map(
                    teamRows.map((t) => {
                        if (!t.pictureUrl) return [t.id, null] as const
                        const key = t.pictureUrl.replace(/^\/+/, "")
                        return [
                            t.id,
                            picBase ? `${picBase}/${key}` : `/${key}`
                        ] as const
                    })
                )

                for (const champ of champs) {
                    if (champ.teamId === null) continue
                    const picture = pictureByTeam.get(champ.teamId) ?? null

                    const [existing] = await db
                        .select({ id: champions.id })
                        .from(champions)
                        .where(
                            and(
                                eq(champions.season, seasonId),
                                eq(champions.division, champ.divisionId)
                            )
                        )
                        .limit(1)

                    if (existing) {
                        // Full upsert per user spec: overwrite team and refresh
                        // picture from teams.picture_url. picture2/caption are
                        // left in place so admin-curated extras survive re-runs.
                        await db
                            .update(champions)
                            .set({ team: champ.teamId, picture })
                            .where(eq(champions.id, existing.id))
                    } else {
                        await db.insert(champions).values({
                            season: seasonId,
                            division: champ.divisionId,
                            team: champ.teamId,
                            picture
                        })
                    }
                }

                championsSummary = ` Recorded champions for ${champs.length} division${champs.length === 1 ? "" : "s"}.`
            }

            if (targetPhase === "playoffs") {
                const incomplete = await db
                    .select({
                        week: matches.week,
                        divisionName: divisions.name
                    })
                    .from(matches)
                    .innerJoin(divisions, eq(matches.division, divisions.id))
                    .where(
                        and(
                            eq(matches.season, seasonId),
                            eq(matches.playoff, false),
                            or(
                                isNull(matches.home_set1_score),
                                isNull(matches.away_set1_score),
                                isNull(matches.home_set2_score),
                                isNull(matches.away_set2_score)
                            )
                        )
                    )
                    .orderBy(asc(divisions.level), asc(matches.week))

                if (incomplete.length > 0) {
                    const grouped = new Map<string, Set<number>>()
                    for (const row of incomplete) {
                        const set = grouped.get(row.divisionName) ?? new Set()
                        set.add(row.week)
                        grouped.set(row.divisionName, set)
                    }
                    const summary = [...grouped.entries()]
                        .map(
                            ([div, weeks]) =>
                                `${div} (week${weeks.size === 1 ? "" : "s"} ${[...weeks].sort((a, b) => a - b).join(", ")})`
                        )
                        .join("; ")
                    return fail(
                        `Cannot advance to Playoffs: ${incomplete.length} regular-season match${incomplete.length === 1 ? "" : "es"} missing scores — ${summary}.`
                    )
                }

                const seedResult = await seedPlayoffs(seasonId)
                if (!seedResult.status) {
                    return fail(seedResult.message)
                }
                seedingSummary = ` Seeded ${seedResult.divisionsSeeded} division${seedResult.divisionsSeeded === 1 ? "" : "s"}.`
            }

            await db
                .update(seasons)
                .set({ phase: targetPhase })
                .where(eq(seasons.id, seasonId))

            const userId = await getSessionUserId()
            await logAuditEntry({
                userId: userId!,
                action: "advance_season_phase",
                entityType: "season",
                entityId: seasonId,
                summary: `Advanced season phase from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"${seedingSummary ?? ""}${championsSummary ?? ""}`
            })

            // When season completes, clean up granular recipient groups (fire-and-forget)
            if (targetPhase === "complete") {
                cleanupSeasonRecipientGroups(seasonId).catch((err) =>
                    console.error(
                        "[season-control] Recipient group cleanup failed",
                        seasonId,
                        err
                    )
                )
            }

            revalidatePath("/dashboard/season-control")
            return ok(
                undefined,
                `Season advanced to "${PHASE_CONFIG[targetPhase].label}".${seedingSummary ?? ""}${championsSummary ?? ""}`
            )
        } catch (error) {
            console.error("Failed to advance season phase:", error)
            return fail("Failed to advance season phase")
        }
    }
)

export const revertSeasonPhase = withAction(
    async (
        seasonId: number,
        targetPhase: SeasonPhase
    ): Promise<ActionResult> => {
        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) {
            return fail("Unauthorized")
        }

        if (!seasonId || seasonId <= 0) {
            return fail("Invalid season ID")
        }

        try {
            const [season] = await db
                .select({ id: seasons.id, phase: seasons.phase })
                .from(seasons)
                .where(eq(seasons.id, seasonId))
                .limit(1)

            if (!season) {
                return fail("Season not found")
            }

            const currentPhase = season.phase as SeasonPhase
            if (!isValidPhaseRevert(currentPhase, targetPhase)) {
                return fail(
                    `Cannot revert from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
                )
            }

            await db
                .update(seasons)
                .set({ phase: targetPhase })
                .where(eq(seasons.id, seasonId))

            const userId = await getSessionUserId()
            await logAuditEntry({
                userId: userId!,
                action: "revert_season_phase",
                entityType: "season",
                entityId: seasonId,
                summary: `Reverted season phase from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
            })

            revalidatePath("/dashboard/season-control")
            return ok(
                undefined,
                `Season reverted to "${PHASE_CONFIG[targetPhase].label}"`
            )
        } catch (error) {
            console.error("Failed to revert season phase:", error)
            return fail("Failed to revert season phase")
        }
    }
)

const seasonLabel = (season: string, year: number) =>
    `${season.charAt(0).toUpperCase() + season.slice(1)} ${year}`

export const createSeason = withAction(
    async (input: {
        season: string
        year: number
        code: string
    }): Promise<ActionResult<{ seasonId: number }>> => {
        const isAdmin = await isAdminOrDirectorBySession()
        if (!isAdmin) {
            return fail("Unauthorized")
        }

        const season = (input?.season ?? "").trim().toLowerCase()
        const code = (input?.code ?? "").trim()
        const year = input?.year

        if (!season) {
            return fail("Season name is required")
        }
        if (!code) {
            return fail("Season code is required")
        }
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            return fail("Enter a valid year")
        }

        const label = seasonLabel(season, year)

        try {
            // Reject a duplicate of the same year + season name
            const [dup] = await db
                .select({ id: seasons.id })
                .from(seasons)
                .where(and(eq(seasons.year, year), eq(seasons.season, season)))
                .limit(1)

            if (dup) {
                return fail(`A ${label} season already exists`)
            }

            // Clone source = the current latest season (highest id)
            const [source] = await db
                .select()
                .from(seasons)
                .orderBy(desc(seasons.id))
                .limit(1)

            const newSeasonId = await db.transaction(async (tx) => {
                // phase omitted -> schema $defaultFn sets "off_season"
                const [created] = await tx
                    .insert(seasons)
                    .values({
                        code,
                        year,
                        season,
                        season_amount: source?.season_amount ?? null,
                        late_amount: source?.late_amount ?? null,
                        max_players: source?.max_players ?? null,
                        certified_ref_rate: source?.certified_ref_rate ?? null,
                        uncertified_ref_rate:
                            source?.uncertified_ref_rate ?? null
                    })
                    .returning({ id: seasons.id })

                const newId = created.id

                if (source) {
                    // Clone per-season division configuration
                    const sourceDivisions = await tx
                        .select()
                        .from(individual_divisions)
                        .where(eq(individual_divisions.season, source.id))

                    if (sourceDivisions.length > 0) {
                        await tx.insert(individual_divisions).values(
                            sourceDivisions.map((d) => ({
                                season: newId,
                                division: d.division,
                                coaches: d.coaches,
                                gender_split: d.gender_split,
                                teams: d.teams
                            }))
                        )
                    }

                    // Clone season events + their time slots (dates copied
                    // verbatim; admin edits them in Season Configuration)
                    const sourceEvents = await tx
                        .select()
                        .from(seasonEvents)
                        .where(eq(seasonEvents.season_id, source.id))
                        .orderBy(asc(seasonEvents.sort_order))

                    for (const event of sourceEvents) {
                        const [insertedEvent] = await tx
                            .insert(seasonEvents)
                            .values({
                                season_id: newId,
                                event_type: event.event_type,
                                event_date: event.event_date,
                                sort_order: event.sort_order,
                                label: event.label
                            })
                            .returning({ id: seasonEvents.id })

                        const sourceSlots = await tx
                            .select()
                            .from(eventTimeSlots)
                            .where(eq(eventTimeSlots.event_id, event.id))
                            .orderBy(asc(eventTimeSlots.sort_order))

                        if (sourceSlots.length > 0) {
                            await tx.insert(eventTimeSlots).values(
                                sourceSlots.map((s) => ({
                                    event_id: insertedEvent.id,
                                    start_time: s.start_time,
                                    slot_label: s.slot_label,
                                    sort_order: s.sort_order
                                }))
                            )
                        }
                    }
                }

                return newId
            })

            const userId = await getSessionUserId()
            await logAuditEntry({
                userId: userId!,
                action: "create_season",
                entityType: "season",
                entityId: newSeasonId,
                summary: source
                    ? `Created ${label} season (cloned config from ${seasonLabel(source.season, source.year)})`
                    : `Created ${label} season`
            })

            revalidatePath("/dashboard/season-control")
            revalidatePath("/dashboard/season-config")
            revalidatePath("/dashboard")
            // Public season surfaces that display the current season
            revalidatePath("/season-info")
            revalidatePath("/")

            return ok(
                { seasonId: newSeasonId },
                `${label} season created. Edit dates and pricing in Season Configuration.`
            )
        } catch (error) {
            console.error("Failed to create season:", error)
            return fail("Failed to create season")
        }
    }
)

export async function getCurrentSeasonPhaseData(): Promise<{
    status: boolean
    message?: string
    data?: {
        seasonId: number
        seasonLabel: string
        phase: SeasonPhase
    }
}> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) {
        return { status: false, message: "Unauthorized" }
    }

    try {
        const [season] = await db
            .select({
                id: seasons.id,
                year: seasons.year,
                season: seasons.season,
                phase: seasons.phase
            })
            .from(seasons)
            .orderBy(desc(seasons.id))
            .limit(1)

        if (!season) {
            return { status: false, message: "No seasons found" }
        }

        return {
            status: true,
            data: {
                seasonId: season.id,
                seasonLabel: `${season.season.charAt(0).toUpperCase() + season.season.slice(1)} ${season.year}`,
                phase: season.phase as SeasonPhase
            }
        }
    } catch (error) {
        console.error("Failed to get season phase:", error)
        return { status: false, message: "Failed to load season data" }
    }
}
