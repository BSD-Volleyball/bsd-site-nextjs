"use client"

import { PlayerLookupColumns } from "@/components/player-lookup/player-lookup-columns"
import { AdminPlayerDetailPopup } from "@/components/player-detail"
import {
    getPlayerDetails,
    type PlayerDetailsResult,
    type PlayerListItem
} from "./actions"

interface PlayerLookupFormProps {
    players: PlayerListItem[]
    playerPicUrl: string
}

export function PlayerLookupForm({
    players,
    playerPicUrl
}: PlayerLookupFormProps) {
    return (
        <PlayerLookupColumns<PlayerDetailsResult>
            players={players}
            widthClassName="min-w-[42rem]"
            loadDetails={async (playerId) => {
                const result = await getPlayerDetails(playerId)
                if (result.status) {
                    return { ok: true, detail: result.data }
                }
                return {
                    ok: false,
                    error: result.message || "Failed to load player details"
                }
            }}
            renderDetail={(slot) => {
                const detail = slot.detail
                const mostRecentSignup = detail?.signupHistory[0] ?? null
                return (
                    <>
                        <AdminPlayerDetailPopup
                            open={!!slot.selectedPlayerId}
                            playerDetails={detail?.player ?? null}
                            draftHistory={detail?.draftHistory ?? []}
                            signupHistory={detail?.signupHistory ?? []}
                            playerPicUrl={playerPicUrl}
                            isLoading={slot.isLoading}
                            pairPickName={
                                mostRecentSignup?.pairPickName ?? null
                            }
                            pairReason={mostRecentSignup?.pairReason ?? null}
                            ratingAverages={detail?.ratingAverages}
                            sharedRatingNotes={detail?.sharedRatingNotes}
                            privateRatingNotes={detail?.privateRatingNotes}
                            viewerRating={detail?.viewerRating ?? null}
                            inline
                        />
                        {detail &&
                            detail.signupHistory.length === 0 &&
                            !slot.isLoading && (
                                <p className="text-muted-foreground text-sm">
                                    No signup history found for this player.
                                </p>
                            )}
                    </>
                )
            }}
        />
    )
}
