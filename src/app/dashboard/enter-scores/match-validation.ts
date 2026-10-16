import { validateMatchScores } from "@/lib/scores/match-validation"
import { type MatchFormState, parseIntOrNull } from "./match-form-state"
import type { ResolvedMatchInfo } from "./match-resolution"

export interface ValidationWarning {
    matchId: number
    messages: string[]
}

export function validateMatch(
    form: MatchFormState,
    resolved: ResolvedMatchInfo
): string[] {
    return validateMatchScores(formScoreValues(form), form.winner, resolved)
}

export function formScoreValues(form: MatchFormState) {
    return {
        homeScore: parseIntOrNull(form.homeScore),
        awayScore: parseIntOrNull(form.awayScore),
        homeSet1Score: parseIntOrNull(form.homeSet1Score),
        awaySet1Score: parseIntOrNull(form.awaySet1Score),
        homeSet2Score: parseIntOrNull(form.homeSet2Score),
        awaySet2Score: parseIntOrNull(form.awaySet2Score),
        homeSet3Score: parseIntOrNull(form.homeSet3Score),
        awaySet3Score: parseIntOrNull(form.awaySet3Score)
    }
}

export function isSupportedImageFile(file: File): boolean {
    return file.type.startsWith("image/")
}
