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
