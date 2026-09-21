/**
 * generate.ts — the two ways a night's score sheets leave the system.
 *
 * `generateScoreSheetsPdf` serves the download on the Coverage page and
 * enforces its own authorization, following the convention that the route
 * handler only resolves the session (see AGENTS.md "Layering").
 * `buildScoreSheetsPdfBytes` is the system path used by the coverage digest
 * cron, which has no acting user.
 */

import { desc } from "drizzle-orm"

import { db } from "@/database/db"
import { seasons } from "@/database/schema"
import { logAuditEntry } from "@/lib/audit-log"
import {
    pdfDownloadResponse,
    pdfErrorResponse
} from "@/lib/pdf/tryout-sheet-shared"
import { isAdminOrDirector } from "@/lib/rbac"

import { loadScoreSheetNight } from "./load"
import { renderScoreSheetsPdf } from "./render"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function scoreSheetsFileName(date: string): string {
    return `scoresheets-${date}.pdf`
}

async function currentSeasonId(): Promise<number | null> {
    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)
    return season?.id ?? null
}

/**
 * Render a night's sheets, or null when the night has no matches. Used by the
 * digest; callers that need authorization use `generateScoreSheetsPdf`.
 */
export async function buildScoreSheetsPdfBytes(
    date: string
): Promise<{ bytes: Uint8Array; fileName: string } | null> {
    if (!DATE_RE.test(date)) return null

    const seasonId = await currentSeasonId()
    if (seasonId === null) return null

    const night = await loadScoreSheetNight(seasonId, date)
    if (!night || night.courts.length === 0) return null

    return {
        bytes: await renderScoreSheetsPdf(night),
        fileName: scoreSheetsFileName(date)
    }
}

export async function generateScoreSheetsPdf(
    date: string,
    userId: string
): Promise<Response> {
    // Matches who can open the Coverage page the download is linked from.
    const allowed = await isAdminOrDirector(userId)
    if (!allowed) {
        return pdfErrorResponse("Access denied", 403)
    }

    if (!DATE_RE.test(date)) {
        return pdfErrorResponse("Invalid date.", 400)
    }

    try {
        const result = await buildScoreSheetsPdfBytes(date)
        if (!result) {
            return pdfErrorResponse(
                "No matches are scheduled for that date.",
                404
            )
        }

        await logAuditEntry({
            userId,
            action: "score_sheets.download",
            entityType: "match_date",
            entityId: date,
            summary: `Downloaded score sheets for ${date}`
        })

        return pdfDownloadResponse(result.bytes, result.fileName)
    } catch (error) {
        return pdfErrorResponse(
            error instanceof Error
                ? error.message
                : "Failed to build score sheets.",
            500
        )
    }
}
