import type { SeasonPhase } from "@/lib/season-phases"

// Captain/coach self-service team renames. Pure so the dashboard card (to
// decide whether to offer the button) and the server action (to enforce it)
// share one rule. Commissioners keep renaming through Select Captains, which
// is not bound by this window.

export const TEAM_NAME_MAX_LENGTH = 40

/**
 * Renames open once the draft is under way and close when the season moves
 * to playoffs, so brackets, score sheets and season history keep the name
 * the team played the regular season under.
 */
const TEAM_RENAME_PHASES: readonly SeasonPhase[] = ["draft", "regular_season"]

export function isTeamRenameOpen(phase: SeasonPhase): boolean {
    return TEAM_RENAME_PHASES.includes(phase)
}

export type TeamNameCheck =
    | { ok: true; name: string }
    | { ok: false; message: string }

/** Trims and collapses inner whitespace, then checks length. */
export function normalizeTeamName(raw: unknown): TeamNameCheck {
    if (typeof raw !== "string") {
        return { ok: false, message: "Please enter a team name." }
    }
    const name = raw.trim().replace(/\s+/g, " ")
    if (!name) return { ok: false, message: "Please enter a team name." }
    if (name.length > TEAM_NAME_MAX_LENGTH) {
        return {
            ok: false,
            message: `Team names can be at most ${TEAM_NAME_MAX_LENGTH} characters.`
        }
    }
    return { ok: true, name }
}
