export const GHOST_CAPTAIN_ID = "ghost-captain"

export function isGhostCaptain(userId: string | null | undefined): boolean {
    return userId === GHOST_CAPTAIN_ID
}

export function getGhostDisplayName(
    index: number,
    totalGhosts: number
): string {
    return totalGhosts > 1 ? `Ghost ${index + 1}` : "Ghost"
}
