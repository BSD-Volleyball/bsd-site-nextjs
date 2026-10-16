"use client"

import Link from "next/link"

import { formatEnteredTime } from "@/lib/scores/entered-by"
import { isMatchSaved } from "@/lib/scoresheets/court-status"

import type { DivisionMatchGroup, ScoreSheetData } from "./actions"

interface CourtLine {
    court: number
    photos: { by: string; at: string }[]
    saved: { by: string; at: string | null }[]
    matchCount: number
    savedCount: number
}

function namesWithTime(entries: { by: string; at: string | null }[]): string {
    const names = Array.from(new Set(entries.map((e) => e.by))).join(", ")
    const latest = entries
        .map((e) => e.at)
        .filter((at): at is string => at !== null)
        .sort()
        .at(-1)
    const time = formatEnteredTime(latest ?? null)
    return time ? `${names} (${time})` : names
}

export function courtLines(
    divisions: DivisionMatchGroup[],
    sheets: ScoreSheetData[]
): CourtLine[] {
    const byCourt = new Map<number, CourtLine>()
    for (const division of divisions) {
        for (const match of division.matches) {
            if (match.court === null) continue
            const line = byCourt.get(match.court) ?? {
                court: match.court,
                photos: [],
                saved: [],
                matchCount: 0,
                savedCount: 0
            }
            line.matchCount++
            if (isMatchSaved(match)) line.savedCount++
            // Matches scored before who-entered was recorded have no name
            if (match.scoresEnteredBy) {
                line.saved.push({
                    by: match.scoresEnteredBy,
                    at: match.scoresEnteredAt
                })
            }
            byCourt.set(match.court, line)
        }
    }
    for (const sheet of sheets) {
        const line = sheet.court === null ? undefined : byCourt.get(sheet.court)
        line?.photos.push({ by: sheet.uploadedBy, at: sheet.uploadedAt })
    }
    return [...byCourt.values()].sort((a, b) => a.court - b.court)
}

/** Who photographed and who saved each court tonight, at a glance. */
export function CourtEntrySummary({
    divisions,
    scoreSheets
}: {
    divisions: DivisionMatchGroup[]
    scoreSheets: ScoreSheetData[]
}) {
    const lines = courtLines(divisions, scoreSheets)
    if (lines.length === 0) return null

    return (
        <div className="rounded-md border p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">Courts</h2>
                <Link
                    href="/dashboard/upload-score-sheets"
                    prefetch={false}
                    className="text-primary text-sm underline-offset-4 hover:underline"
                >
                    Upload Score Sheets
                </Link>
            </div>
            <ul className="divide-y text-sm">
                {lines.map((line) => (
                    <li
                        key={line.court}
                        className="flex flex-wrap gap-x-4 gap-y-0.5 py-1.5"
                    >
                        <span className="w-16 font-medium">
                            Court {line.court}
                        </span>
                        <span className="text-muted-foreground">
                            {line.photos.length > 0
                                ? `Photo by ${namesWithTime(line.photos)}`
                                : "No photo"}
                        </span>
                        <span className="text-muted-foreground">
                            {line.savedCount === 0
                                ? "Not saved"
                                : `Saved${line.saved.length > 0 ? ` by ${namesWithTime(line.saved)}` : ""}${
                                      line.savedCount < line.matchCount
                                          ? ` · ${line.savedCount} of ${line.matchCount} matches`
                                          : ""
                                  }`}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
