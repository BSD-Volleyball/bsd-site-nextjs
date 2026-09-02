export function getRoundClass(round: number): string {
    if (round <= 2) return "bg-green-50 text-green-700"
    if (round <= 4) return "bg-lime-50 text-lime-700"
    if (round <= 6) return "bg-yellow-50 text-yellow-700"
    if (round <= 8) return "bg-orange-50 text-orange-700"
    return "text-muted-foreground"
}

export function clampRound(v: number): number {
    return Math.min(8, Math.max(1, Math.round(v)))
}

/**
 * The round a captain is seated in: an unsaved edit on this page, else the
 * last locked value, else the homework recommendation. A captain nobody
 * ranked (no player row) defaults to round 1 — the same value the captain
 * email has always shown, so Save and the email agree.
 */
export function resolveCaptainRound(
    captainId: string,
    overrides: Record<string, number>,
    saved: Record<string, number>,
    recommendedRound: number | undefined
): number {
    return (
        overrides[captainId] ??
        saved[captainId] ??
        (recommendedRound !== undefined ? clampRound(recommendedRound) : 1)
    )
}
