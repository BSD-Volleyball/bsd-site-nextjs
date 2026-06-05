"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/database/db"
import {
    champions,
    divisions,
    matches,
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

export async function advanceSeasonPhase(
    seasonId: number,
    targetPhase: SeasonPhase
): Promise<{ status: boolean; message: string }> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) {
        return { status: false, message: "Unauthorized" }
    }

    if (!seasonId || seasonId <= 0) {
        return { status: false, message: "Invalid season ID" }
    }

    try {
        const [season] = await db
            .select({ id: seasons.id, phase: seasons.phase })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!season) {
            return { status: false, message: "Season not found" }
        }

        const currentPhase = season.phase as SeasonPhase
        if (!isValidPhaseTransition(currentPhase, targetPhase)) {
            return {
                status: false,
                message: `Cannot advance from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
            }
        }

        let seedingSummary: string | null = null
        let championsSummary: string | null = null

        if (targetPhase === "complete") {
            const champs = await getDivisionChampions(seasonId)
            const missing = champs.filter((c) => c.teamId === null)
            if (missing.length > 0) {
                return {
                    status: false,
                    message: `Cannot advance to Complete: no champion determined for ${missing
                        .map((m) => m.divisionName)
                        .join(", ")}. Finish the playoff bracket(s) first.`
                }
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
            // populated by scripts/import-hoc-champions.ts.
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
                return {
                    status: false,
                    message: `Cannot advance to Playoffs: ${incomplete.length} regular-season match${incomplete.length === 1 ? "" : "es"} missing scores — ${summary}.`
                }
            }

            const seedResult = await seedPlayoffs(seasonId)
            if (!seedResult.status) {
                return { status: false, message: seedResult.message }
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
        return {
            status: true,
            message: `Season advanced to "${PHASE_CONFIG[targetPhase].label}".${seedingSummary ?? ""}${championsSummary ?? ""}`
        }
    } catch (error) {
        console.error("Failed to advance season phase:", error)
        return { status: false, message: "Failed to advance season phase" }
    }
}

export async function revertSeasonPhase(
    seasonId: number,
    targetPhase: SeasonPhase
): Promise<{ status: boolean; message: string }> {
    const isAdmin = await isAdminOrDirectorBySession()
    if (!isAdmin) {
        return { status: false, message: "Unauthorized" }
    }

    if (!seasonId || seasonId <= 0) {
        return { status: false, message: "Invalid season ID" }
    }

    try {
        const [season] = await db
            .select({ id: seasons.id, phase: seasons.phase })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!season) {
            return { status: false, message: "Season not found" }
        }

        const currentPhase = season.phase as SeasonPhase
        if (!isValidPhaseRevert(currentPhase, targetPhase)) {
            return {
                status: false,
                message: `Cannot revert from "${PHASE_CONFIG[currentPhase].label}" to "${PHASE_CONFIG[targetPhase].label}"`
            }
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
        return {
            status: true,
            message: `Season reverted to "${PHASE_CONFIG[targetPhase].label}"`
        }
    } catch (error) {
        console.error("Failed to revert season phase:", error)
        return { status: false, message: "Failed to revert season phase" }
    }
}

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
