// Display labels for playoff match sides. Pure.
//
// A side shows its team when the team is known (stored on the match, or a
// decided upstream match resolves the W<n>/L<n> reference), otherwise the
// reference itself ("Winner #3", "Seed 2", "Team #4") or "TBD".

import type { ParsedSource } from "@/lib/playoff-sources"
import { getLoserTeamId, getWinnerTeamId } from "./match-results"
import type { CombinedMatch } from "./structure"

export interface LabelContext {
    teamLabelById: Map<number, string>
    teamLabelByNumber: Map<number, string>
    seedLabelBySeed: Map<number, string>
    matchByNum: Map<number, CombinedMatch>
}

export interface PlayoffTeam {
    id: number
    number: number | null
    name: string
}

/** "#<number> <name>", or just the name for a team without a number. */
export function formatPlayoffTeamLabel(
    team: Pick<PlayoffTeam, "number" | "name">
): string {
    return team.number !== null ? `#${team.number} ${team.name}` : team.name
}

export function buildTeamLabelMaps(teams: PlayoffTeam[]): {
    teamLabelById: Map<number, string>
    teamLabelByNumber: Map<number, string>
} {
    const teamLabelById = new Map<number, string>()
    const teamLabelByNumber = new Map<number, string>()
    for (const team of teams) {
        const teamLabel = formatPlayoffTeamLabel(team)

        teamLabelById.set(team.id, teamLabel)
        if (team.number !== null) {
            teamLabelByNumber.set(team.number, teamLabel)
        }
    }
    return { teamLabelById, teamLabelByNumber }
}

export function getTeamLabelById(
    teamId: number,
    context: LabelContext
): string {
    return context.teamLabelById.get(teamId) || `Team ${teamId}`
}

export function resolveReferenceLabel(
    source: ParsedSource,
    context: LabelContext
): string | null {
    if (source.kind === "none") {
        return null
    }

    if (source.kind === "seed" && source.value !== null) {
        return (
            context.seedLabelBySeed.get(source.value) || `Seed ${source.value}`
        )
    }

    if (source.kind === "team" && source.value !== null) {
        return (
            context.teamLabelByNumber.get(source.value) ||
            `Team #${source.value}`
        )
    }

    if (
        (source.kind === "winner" || source.kind === "loser") &&
        source.value !== null
    ) {
        const referenced = context.matchByNum.get(source.value)
        if (!referenced) {
            return `${source.kind === "winner" ? "Winner" : "Loser"} #${source.value}`
        }

        const winnerTeamId = getWinnerTeamId(referenced)
        if (source.kind === "winner") {
            if (winnerTeamId !== null) {
                return getTeamLabelById(winnerTeamId, context)
            }
            return `Winner #${source.value}`
        }

        const loserTeamId = getLoserTeamId(referenced, winnerTeamId)
        if (loserTeamId !== null) {
            return getTeamLabelById(loserTeamId, context)
        }
        return `Loser #${source.value}`
    }

    return source.normalized || source.raw || null
}

export function resolveSideLabel(
    teamId: number | null,
    source: ParsedSource,
    context: LabelContext
): string {
    if (teamId !== null) {
        return getTeamLabelById(teamId, context)
    }

    return resolveReferenceLabel(source, context) || "TBD"
}

/** The work assignment: the stored work team, else its source reference. */
export function resolveWorkLabel(
    workTeamId: number | null,
    workSource: ParsedSource,
    context: LabelContext
): string | null {
    return workTeamId !== null
        ? getTeamLabelById(workTeamId, context)
        : resolveReferenceLabel(workSource, context)
}
