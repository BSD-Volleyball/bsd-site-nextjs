/**
 * player-highlight.ts — who to call out in a player list.
 *
 * Preseason week and roster pages highlight the viewer so they can find
 * themselves, and their friends in a softer tint of the same hue so the two
 * tiers read as one signal. Client-safe: no database imports.
 */

export type PlayerHighlight = "self" | "friend" | null

/**
 * "self" wins over "friend" (a user is never their own friend, but the
 * viewer's row must be the strongest thing on the page regardless).
 */
export function getPlayerHighlight(
    playerId: string,
    currentUserId: string | undefined,
    friendIds: Iterable<string> | undefined
): PlayerHighlight {
    if (currentUserId && playerId === currentUserId) return "self"
    if (friendIds) {
        for (const id of friendIds) {
            if (id === playerId) return "friend"
        }
    }
    return null
}

/**
 * Tailwind classes per tier. Callers supply their own base/neutral classes
 * (padding, rounding, the un-highlighted background) and append these.
 */
export const PLAYER_HIGHLIGHT_CLASSES: Record<
    Exclude<PlayerHighlight, null>,
    string
> = {
    self: "bg-primary/15 font-semibold ring-1 ring-primary/50",
    friend: "bg-primary/8 ring-1 ring-primary/25"
}

/** Highlight classes for a player row, or the fallback when not highlighted. */
export function playerHighlightClass(
    highlight: PlayerHighlight,
    fallback: string
): string {
    return highlight ? PLAYER_HIGHLIGHT_CLASSES[highlight] : fallback
}
