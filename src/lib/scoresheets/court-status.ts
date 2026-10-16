/**
 * court-status.ts — where each court of a night stands, for the upload page.
 *
 * One card per court is what the person collecting the night's sheets works
 * through, so this folds together what was scheduled on the court, the photos
 * filed under it, what the readers made of the latest one, and what has
 * already been saved. Pure: the page loads the rows and this only decides.
 */

import { type ScoreDraft, toScoreDrafts } from "./read/draft"
import type { StoredReadStatus } from "./read/pipeline"
import type { SheetRead } from "./read/read"

export interface CourtMatchInput {
    matchId: number
    divisionId: number
    court: number | null
    time: string | null
    homeTeamId: number | null
    awayTeamId: number | null
    homeScore: number | null
    awayScore: number | null
    homeSet1Score: number | null
    awaySet1Score: number | null
    homeSet2Score: number | null
    awaySet2Score: number | null
    homeSet3Score: number | null
    awaySet3Score: number | null
    winner: number | null
    /** ISO time the saved result was entered, when known. */
    scoresEnteredAt: string | null
}

export interface CourtSheetInput {
    scoreSheetId: number
    court: number | null
    status: StoredReadStatus
    read: SheetRead | null
    /** ISO; later uploads of the same court supersede earlier ones. */
    uploadedAt: string
}

export type CourtState =
    /** Every match on the court has a saved result. */
    | "saved"
    /** Read cleanly: both readers agreed on every game. One tap to save. */
    | "ready"
    /** Read, but something needs a person: a disagreement, a guess, a gap. */
    | "needs_review"
    /** The latest photo is still being read. */
    | "reading"
    /** The latest photo could not be read at all. */
    | "failed"
    | "no_photo"

export interface CourtSummary {
    court: number
    /** In the order they are played, which is the order printed. */
    matchIds: number[]
    state: CourtState
    /** The photo the card shows and drafts come from, if any. */
    sheet: CourtSheetInput | null
    /** Every photo filed under this court, newest first. */
    sheets: CourtSheetInput[]
    drafts: Record<number, ScoreDraft>
    savedCount: number
    /**
     * A newer photo reads differently from what is already saved. Saved
     * scores are never replaced silently, so the card asks.
     */
    differsFromSaved: boolean
}

export function isMatchSaved(
    match: Pick<
        CourtMatchInput,
        "winner" | "homeScore" | "awayScore" | "homeSet1Score" | "awaySet1Score"
    >
): boolean {
    return (
        match.winner !== null ||
        match.homeScore !== null ||
        match.awayScore !== null ||
        match.homeSet1Score !== null ||
        match.awaySet1Score !== null
    )
}

function text(value: number | null): string {
    return value === null ? "" : String(value)
}

/** Whether a draft says the same thing as the saved result. */
export function draftMatchesSaved(
    draft: ScoreDraft,
    match: CourtMatchInput
): boolean {
    if (draft.empty) return !isMatchSaved(match)
    const f = draft.fields
    const savedSide =
        match.winner === null
            ? null
            : match.winner === match.homeTeamId
              ? "home"
              : match.winner === match.awayTeamId
                ? "away"
                : null
    return (
        f.homeSet1Score === text(match.homeSet1Score) &&
        f.awaySet1Score === text(match.awaySet1Score) &&
        f.homeSet2Score === text(match.homeSet2Score) &&
        f.awaySet2Score === text(match.awaySet2Score) &&
        f.homeSet3Score === text(match.homeSet3Score) &&
        f.awaySet3Score === text(match.awaySet3Score) &&
        f.winnerSide === savedSide
    )
}

/** Clean enough to save with a single tap after a glance. */
export function isCleanDraft(draft: ScoreDraft): boolean {
    return draft.flags.length === 0 && draft.confidence >= 1
}

const IN_FLIGHT: ReadonlySet<StoredReadStatus> = new Set([
    "pending",
    "processing"
])

function newestFirst(a: CourtSheetInput, b: CourtSheetInput): number {
    return b.uploadedAt.localeCompare(a.uploadedAt)
}

function compareTime(a: CourtMatchInput, b: CourtMatchInput): number {
    return (a.time ?? "99:99").localeCompare(b.time ?? "99:99")
}

export function summarizeCourts(
    matches: readonly CourtMatchInput[],
    sheets: readonly CourtSheetInput[]
): CourtSummary[] {
    const courts = Array.from(
        new Set(
            matches.map((m) => m.court).filter((c): c is number => c !== null)
        )
    ).sort((a, b) => a - b)

    return courts.map((court) => {
        const onCourt = matches
            .filter((m) => m.court === court)
            .sort(compareTime)
        const courtSheets = sheets
            .filter((s) => s.court === court)
            .sort(newestFirst)

        // The newest photo that the readers have finished with; failing that
        // the newest of all, so a photo still being read is what shows.
        const newest = courtSheets[0] ?? null
        const newestRead = courtSheets.find((s) => s.read !== null) ?? null
        const sheet =
            newest && IN_FLIGHT.has(newest.status)
                ? newest
                : (newestRead ?? newest)

        const drafts: Record<number, ScoreDraft> = {}
        if (sheet?.read) {
            for (const draft of toScoreDrafts(sheet.read)) {
                drafts[draft.matchId] = draft
            }
        }

        const savedCount = onCourt.filter(isMatchSaved).length
        const allSaved = onCourt.length > 0 && savedCount === onCourt.length

        // A photo is only news about a result saved before it arrived. One
        // saved after it was saved by someone looking at it, who may well
        // have corrected what the readers made of it.
        const differsFromSaved =
            !!sheet?.read &&
            sheet.status !== "confirmed" &&
            onCourt.some((m) => {
                const draft = drafts[m.matchId]
                const savedSincePhoto =
                    m.scoresEnteredAt !== null &&
                    m.scoresEnteredAt >= sheet.uploadedAt
                return (
                    draft &&
                    isMatchSaved(m) &&
                    !savedSincePhoto &&
                    !draftMatchesSaved(draft, m)
                )
            })

        let state: CourtState
        if (sheet && IN_FLIGHT.has(sheet.status)) state = "reading"
        else if (allSaved && !differsFromSaved) state = "saved"
        else if (sheet?.read) {
            const missing = onCourt.some((m) => !drafts[m.matchId])
            const clean =
                !missing &&
                !differsFromSaved &&
                sheet.read.problems.length === 0 &&
                onCourt.every((m) => isCleanDraft(drafts[m.matchId]))
            state = clean ? "ready" : "needs_review"
        } else if (sheet) state = "failed"
        else state = allSaved ? "saved" : "no_photo"

        return {
            court,
            matchIds: onCourt.map((m) => m.matchId),
            state,
            sheet,
            sheets: courtSheets,
            drafts,
            savedCount,
            differsFromSaved
        }
    })
}

/**
 * What each reader saw for one game, for offering as one-tap choices where
 * they disagreed. Distinct readings only; a reader that saw nothing is left
 * out because "not played" is never the useful suggestion for a played game.
 */
export function gameCandidates(
    read: SheetRead,
    matchId: number,
    gameIndex: number
): { home: number; away: number; models: string[] }[] {
    const matchIndex = read.matches.findIndex((m) => m.matchId === matchId)
    if (matchIndex < 0 || !read.readings) return []
    const found = new Map<
        string,
        { home: number; away: number; models: string[] }
    >()
    for (const reading of read.readings) {
        const game = reading.matches[matchIndex]?.[gameIndex]
        if (!game || game.home === null || game.away === null) continue
        const key = `${game.home}-${game.away}`
        const entry = found.get(key) ?? {
            home: game.home,
            away: game.away,
            models: []
        }
        entry.models.push(reading.model)
        found.set(key, entry)
    }
    return [...found.values()]
}
