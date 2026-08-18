import { PLAYER_HIGHLIGHT_CLASSES } from "@/lib/player-highlight"
import { cn } from "@/lib/utils"

/**
 * Key for the row highlights on preseason and roster pages. The "Friends"
 * swatch is only shown when the viewer has friends, so nobody is told to
 * look for a colour that never appears on their page.
 */
export function PlayerHighlightLegend({
    hasFriends,
    className
}: {
    hasFriends: boolean
    className?: string
}) {
    return (
        <ul
            className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm",
                className
            )}
            aria-label="Highlight legend"
        >
            <li className="flex items-center gap-1.5">
                <span
                    aria-hidden="true"
                    className={cn(
                        "inline-block size-3.5 rounded-sm",
                        PLAYER_HIGHLIGHT_CLASSES.self
                    )}
                />
                You
            </li>
            {hasFriends && (
                <li className="flex items-center gap-1.5">
                    <span
                        aria-hidden="true"
                        className={cn(
                            "inline-block size-3.5 rounded-sm",
                            PLAYER_HIGHLIGHT_CLASSES.friend
                        )}
                    />
                    Friends
                </li>
            )}
        </ul>
    )
}
