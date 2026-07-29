// Helpers shared by the week-1 and week-2/3 tryout-sheet generators. The
// page layouts differ (week 1: one full-width table per session×court with
// move checkboxes; weeks 2/3: three division groups × two team tables), but
// the text formatting, roster enrichment, and response plumbing are common.

import { NextResponse } from "next/server"
import { desc, eq, inArray } from "drizzle-orm"
import type { PDFFont } from "pdf-lib"
import { db } from "@/database/db"
import { drafts, divisions, seasons, teams, users } from "@/database/schema"
import { formatDisplayName } from "@/lib/utils"

export function capitalize(value: string): string {
    if (!value) {
        return value
    }
    return value.charAt(0).toUpperCase() + value.slice(1)
}

export function getSeasonAbbreviation(seasonName: string): string {
    const normalized = seasonName.trim().toLowerCase()

    if (normalized.startsWith("fall")) {
        return "F"
    }

    if (normalized.startsWith("spring")) {
        return "S"
    }

    if (normalized.startsWith("summer")) {
        return "U"
    }

    return seasonName.charAt(0).toUpperCase()
}

export function getSheetDisplayName({
    firstName,
    lastName,
    preferredName
}: {
    firstName: string
    lastName: string
    preferredName: string | null
}): string {
    return formatDisplayName(firstName, lastName, preferredName)
}

export function getGenderLabel(male: boolean | null): string {
    if (male === true) {
        return "M"
    }

    if (male === false) {
        return "NM"
    }

    return "—"
}

export function getPositionsLabel({
    skillSetter,
    skillHitter,
    skillPasser
}: {
    skillSetter: boolean | null
    skillHitter: boolean | null
    skillPasser: boolean | null
}): string {
    const labels: string[] = []

    if (skillSetter) {
        labels.push("S")
    }

    if (skillHitter) {
        labels.push("H")
    }

    if (skillPasser) {
        labels.push("P")
    }

    if (labels.length === 0) {
        return "—"
    }

    return labels.join("/")
}

export function truncateToFit({
    text,
    maxWidth,
    fontSize,
    font
}: {
    text: string
    maxWidth: number
    fontSize: number
    font: PDFFont
}): string {
    if (!text) {
        return ""
    }

    if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
        return text
    }

    const ellipsis = "…"
    let shortened = text
    while (shortened.length > 0) {
        shortened = shortened.slice(0, -1)
        const candidate = `${shortened}${ellipsis}`
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
            return candidate
        }
    }

    return ellipsis
}

export function fitTextToCell({
    text,
    maxWidth,
    baseFontSize,
    minFontSize,
    font
}: {
    text: string
    maxWidth: number
    baseFontSize: number
    minFontSize: number
    font: PDFFont
}): { text: string; fontSize: number } {
    if (!text) {
        return { text: "", fontSize: baseFontSize }
    }

    let fontSize = baseFontSize

    while (
        fontSize > minFontSize &&
        font.widthOfTextAtSize(text, fontSize) > maxWidth
    ) {
        fontSize -= 0.5
    }

    if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) {
        return { text, fontSize }
    }

    return {
        text: truncateToFit({
            text,
            maxWidth,
            fontSize,
            font
        }),
        fontSize
    }
}

export interface LatestDraftInfo {
    seasonId: number
    seasonLabel: string
    divisionLabel: string
}

/**
 * Loads pair-pick display names and each user's latest draft record
 * (compressed to "F26"-style season + division labels).
 */
export async function loadTryoutSheetEnrichment({
    userIds,
    pairIds
}: {
    userIds: string[]
    pairIds: string[]
}): Promise<{
    pairNameById: Map<string, string>
    latestDraftByUser: Map<string, LatestDraftInfo>
}> {
    const [pairRows, draftRows] = await Promise.all([
        pairIds.length > 0
            ? db
                  .select({
                      id: users.id,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preferred_name
                  })
                  .from(users)
                  .where(inArray(users.id, pairIds))
            : Promise.resolve([]),
        db
            .select({
                userId: drafts.user,
                seasonId: seasons.id,
                seasonName: seasons.season,
                seasonYear: seasons.year,
                divisionName: divisions.name,
                overall: drafts.overall
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(seasons, eq(teams.season, seasons.id))
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(inArray(drafts.user, userIds))
            .orderBy(desc(seasons.id), drafts.overall)
    ])

    const pairNameById = new Map<string, string>()
    for (const pair of pairRows) {
        pairNameById.set(pair.id, getSheetDisplayName(pair))
    }

    const latestDraftByUser = new Map<string, LatestDraftInfo>()
    for (const draft of draftRows) {
        if (latestDraftByUser.has(draft.userId)) {
            continue
        }

        latestDraftByUser.set(draft.userId, {
            seasonId: draft.seasonId,
            seasonLabel: `${getSeasonAbbreviation(draft.seasonName)}${String(draft.seasonYear).slice(-2)}`,
            divisionLabel: draft.divisionName
        })
    }

    return { pairNameById, latestDraftByUser }
}

export function formatGeneratedTimestamp(): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(new Date())
}

export function seasonFileSlug(seasonName: string): string {
    return seasonName
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
}

export function pdfDownloadResponse(
    pdfBytes: Uint8Array,
    fileName: string
): NextResponse {
    return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Cache-Control": "no-store"
        }
    })
}
