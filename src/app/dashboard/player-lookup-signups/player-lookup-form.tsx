"use client"

import { PlayerLookupColumns } from "@/components/player-lookup/player-lookup-columns"
import { PlayerDetailPopup } from "@/components/player-detail"
import {
    getPlayerDetailsForSignups,
    type PlayerDetailsForSignups,
    type PlayerListItem,
    type SeasonInfo
} from "./actions"

interface PlayerLookupSignupsFormProps {
    players: PlayerListItem[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
}

export function PlayerLookupSignupsForm({
    players,
    allSeasons,
    playerPicUrl
}: PlayerLookupSignupsFormProps) {
    return (
        <PlayerLookupColumns<PlayerDetailsForSignups>
            players={players}
            widthClassName="min-w-[36rem]"
            loadDetails={async (playerId) => {
                const result = await getPlayerDetailsForSignups(playerId)
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
                return (
                    <PlayerDetailPopup
                        open={!!slot.selectedPlayerId}
                        playerDetails={detail?.player ?? null}
                        draftHistory={detail?.draftHistory ?? []}
                        allSeasons={allSeasons}
                        playerPicUrl={playerPicUrl}
                        isLoading={slot.isLoading}
                        pairPickName={detail?.pairPickName ?? null}
                        pairReason={detail?.pairReason ?? null}
                        datesMissing={detail?.unavailableDates ?? null}
                        playoffDates={detail?.playoffDates ?? []}
                        ratingAverages={detail?.ratingAverages}
                        sharedRatingNotes={detail?.sharedRatingNotes}
                        privateRatingNotes={detail?.privateRatingNotes}
                        viewerRating={detail?.viewerRating ?? null}
                        inline
                    />
                )
            }}
        />
    )
}
