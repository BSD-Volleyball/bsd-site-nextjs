"use client"

import { useMemo, useState } from "react"
import { useStorage } from "@/lib/liveblocks.config"
import { cn } from "@/lib/utils"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { getPlayerDetailsPublic } from "@/app/dashboard/view-signups/actions"
import { RiCloseLine } from "@remixicon/react"
import type { WatchlistPlayer, UserOption } from "./actions"

interface DraftWatchlistProps {
    malePlayers: WatchlistPlayer[] // full ranked list, sorted best-first
    nonMalePlayers: WatchlistPlayer[]
    draftedUserIds: string[]
    users: UserOption[]
    playerPicUrl: string
}

function getRoundBadgeColor(round: number): string {
    if (round <= 2)
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    if (round <= 4)
        return "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200"
    if (round <= 6)
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
    if (round <= 8)
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
    return "bg-muted text-muted-foreground"
}

function PlayerCard({
    player,
    isMale,
    user,
    playerPicUrl,
    onImageClick,
    onNameClick
}: {
    player: WatchlistPlayer
    isMale: boolean
    user: UserOption | undefined
    playerPicUrl: string
    onImageClick: () => void
    onNameClick: () => void
}) {
    return (
        <div
            className={cn(
                "flex flex-col items-center rounded-lg border p-1.5",
                isMale
                    ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                    : "border-pink-200 bg-pink-50 dark:border-pink-800 dark:bg-pink-900/20"
            )}
        >
            <button
                type="button"
                onClick={onImageClick}
                className="transition-opacity hover:opacity-80"
            >
                {user?.picture ? (
                    <img
                        src={`${playerPicUrl}${user.picture}`}
                        alt={player.displayName}
                        className="h-18 w-12 rounded object-cover"
                    />
                ) : (
                    <div className="flex h-18 w-12 items-center justify-center rounded bg-muted text-muted-foreground text-xs">
                        No photo
                    </div>
                )}
            </button>
            <button
                type="button"
                onClick={onNameClick}
                className="mt-1 max-w-14 truncate text-center text-xs hover:underline"
            >
                {player.displayName}
            </button>
            <span
                className={cn(
                    "mt-0.5 rounded px-1.5 py-0.5 font-medium text-xs",
                    getRoundBadgeColor(player.round)
                )}
            >
                Rd. {player.round}
            </span>
        </div>
    )
}

const WATCHLIST_SIZE = 10

export function DraftWatchlist({
    malePlayers,
    nonMalePlayers,
    draftedUserIds,
    users,
    playerPicUrl
}: DraftWatchlistProps) {
    // Reactive — re-renders on every Liveblocks pick change, including initial seeding
    const picks = useStorage((root) => root.picks)

    const [enlargedUser, setEnlargedUser] = useState<UserOption | null>(null)
    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })

    const usersMap = useMemo(
        () => new Map(users.map((u) => [u.id, u])),
        [users]
    )

    const livePickedIds = useMemo(
        () =>
            new Set(
                Object.values(picks ?? {}).filter((id): id is string =>
                    Boolean(id)
                )
            ),
        [picks]
    )

    const committedIds = useMemo(
        () => new Set(draftedUserIds),
        [draftedUserIds]
    )

    // Wait for Liveblocks storage to load before rendering — avoids a flash
    // of all players before seeded captain/pair picks are applied
    if (picks === null) return null

    const isAvailable = (playerId: string) =>
        !livePickedIds.has(playerId) && !committedIds.has(playerId)

    // Filter the full ranked list, then take the top WATCHLIST_SIZE remaining
    const availableMales = malePlayers
        .filter((p) => isAvailable(p.userId))
        .slice(0, WATCHLIST_SIZE)
    const availableNonMales = nonMalePlayers
        .filter((p) => isAvailable(p.userId))
        .slice(0, WATCHLIST_SIZE)

    return (
        <div className="grid grid-cols-2 gap-6">
            <div>
                <h4 className="mb-3 font-medium text-muted-foreground text-sm">
                    Top Males
                </h4>
                {availableMales.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No remaining players
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {availableMales.map((p) => (
                            <PlayerCard
                                key={p.userId}
                                player={p}
                                isMale={true}
                                user={usersMap.get(p.userId)}
                                playerPicUrl={playerPicUrl}
                                onImageClick={() =>
                                    setEnlargedUser(
                                        usersMap.get(p.userId) ?? null
                                    )
                                }
                                onNameClick={() =>
                                    modal.openPlayerDetail(p.userId)
                                }
                            />
                        ))}
                    </div>
                )}
            </div>
            <div>
                <h4 className="mb-3 font-medium text-muted-foreground text-sm">
                    Top Non-Males
                </h4>
                {availableNonMales.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No remaining players
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {availableNonMales.map((p) => (
                            <PlayerCard
                                key={p.userId}
                                player={p}
                                isMale={false}
                                user={usersMap.get(p.userId)}
                                playerPicUrl={playerPicUrl}
                                onImageClick={() =>
                                    setEnlargedUser(
                                        usersMap.get(p.userId) ?? null
                                    )
                                }
                                onNameClick={() =>
                                    modal.openPlayerDetail(p.userId)
                                }
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Enlarged Player Image Modal */}
            {enlargedUser && playerPicUrl && (
                <div
                    className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4"
                    onClick={() => setEnlargedUser(null)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setEnlargedUser(null)
                    }}
                    role="button"
                    tabIndex={0}
                >
                    <div
                        className={cn(
                            "relative rounded-xl p-4",
                            enlargedUser.male === true
                                ? "bg-blue-50 dark:bg-blue-900/40"
                                : "bg-pink-50 dark:bg-pink-900/40"
                        )}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="dialog"
                    >
                        <button
                            type="button"
                            className="-top-2 -right-2 absolute rounded-full bg-background p-1 shadow-lg hover:bg-accent"
                            onClick={() => setEnlargedUser(null)}
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>
                        {enlargedUser.picture ? (
                            <img
                                src={`${playerPicUrl}${enlargedUser.picture}`}
                                alt={`${enlargedUser.first_name} ${enlargedUser.last_name}`}
                                className="max-h-[80vh] w-auto rounded-lg object-contain"
                            />
                        ) : (
                            <div className="flex h-[80vh] w-[53vh] items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                No photo
                            </div>
                        )}
                        <p className="mt-3 text-center font-medium">
                            {enlargedUser.preferred_name
                                ? `${enlargedUser.first_name} (${enlargedUser.preferred_name}) ${enlargedUser.last_name}`
                                : `${enlargedUser.first_name} ${enlargedUser.last_name}`}
                        </p>
                        {enlargedUser.old_id && (
                            <p className="text-center text-muted-foreground text-sm">
                                ID: {enlargedUser.old_id}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Player Detail Popup */}
            <PlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                allSeasons={[]}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
                datesMissing={modal.unavailableDates}
                playoffDates={modal.playoffDates}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
