"use client"

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog"
import type {
    DraftHomeworkDetailPlayer,
    DraftHomeworkDetailResult
} from "@/app/dashboard/homework-status/actions"
import { formatDisplayName } from "@/lib/utils"

interface CaptainHomeworkPopupProps {
    open: boolean
    onClose: () => void
    data: DraftHomeworkDetailResult | null
    isLoading: boolean
    playerPicUrl: string
}

function PlayerCard({
    player,
    playerPicUrl
}: {
    player: DraftHomeworkDetailPlayer
    playerPicUrl: string
}) {
    const src = player.picture ? `${playerPicUrl}${player.picture}` : null
    const displayName = formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )

    return (
        <div className="flex w-20 flex-col items-center gap-0.5">
            {src ? (
                <img
                    src={src}
                    alt={displayName}
                    className="h-24 w-20 rounded object-cover object-top"
                />
            ) : (
                <div className="flex h-24 w-20 items-center justify-center rounded bg-muted font-medium text-muted-foreground text-sm">
                    {player.firstName[0]}
                    {player.lastName[0]}
                </div>
            )}
            <span className="w-full text-center text-xs leading-tight">
                {displayName}
            </span>
            {player.oldId > 0 && (
                <span className="text-muted-foreground text-xs leading-tight">
                    #{player.oldId}
                </span>
            )}
        </div>
    )
}

function RoundSection({
    label,
    players,
    playerPicUrl
}: {
    label: string
    players: DraftHomeworkDetailPlayer[]
    playerPicUrl: string
}) {
    if (players.length === 0) return null
    return (
        <div>
            <div className="mb-2 border-b pb-1 font-medium text-muted-foreground text-sm uppercase tracking-wide">
                {label}
            </div>
            <div className="flex flex-wrap gap-2">
                {players.map((player) => (
                    <PlayerCard
                        key={player.userId}
                        player={player}
                        playerPicUrl={playerPicUrl}
                    />
                ))}
            </div>
        </div>
    )
}

function ConsideringSection({
    label,
    players,
    numTeams,
    playerPicUrl
}: {
    label: string
    players: DraftHomeworkDetailPlayer[]
    numTeams: number
    playerPicUrl: string
}) {
    if (players.length === 0) return null

    // Chunk into rows of numTeams
    const rows: DraftHomeworkDetailPlayer[][] = []
    const rowSize = numTeams > 0 ? numTeams : players.length
    for (let i = 0; i < players.length; i += rowSize) {
        rows.push(players.slice(i, i + rowSize))
    }

    return (
        <div>
            <div className="mb-2 border-b pb-1 font-medium text-muted-foreground text-sm uppercase tracking-wide">
                {label}
            </div>
            <div className="flex flex-col gap-2">
                {rows.map((row, rowIdx) => (
                    <div key={rowIdx} className="flex flex-wrap gap-2">
                        {row.map((player) => (
                            <PlayerCard
                                key={player.userId}
                                player={player}
                                playerPicUrl={playerPicUrl}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}

export function CaptainHomeworkPopup({
    open,
    onClose,
    data,
    isLoading,
    playerPicUrl
}: CaptainHomeworkPopupProps) {
    const detail = data?.status ? data.data : null
    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) onClose()
            }}
        >
            <DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {detail?.captainName
                            ? `${detail.captainName}'s Draft Homework`
                            : "Draft Homework"}
                    </DialogTitle>
                    {detail?.divisionName && (
                        <DialogDescription>
                            {detail.divisionName}
                        </DialogDescription>
                    )}
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {isLoading && !data ? (
                        <div className="py-6 text-center text-muted-foreground text-sm">
                            Loading…
                        </div>
                    ) : data?.status === false ? (
                        <div className="py-4 text-center text-destructive text-sm">
                            {data.message || "Failed to load homework."}
                        </div>
                    ) : detail ? (
                        <div className="space-y-5 py-1">
                            {detail.rounds.map((round) => (
                                <RoundSection
                                    key={round.draftRound}
                                    label={round.label}
                                    players={round.players}
                                    playerPicUrl={playerPicUrl}
                                />
                            ))}
                            <ConsideringSection
                                label="Considering — Male"
                                players={detail.consideringMalePlayers}
                                numTeams={detail.numTeams}
                                playerPicUrl={playerPicUrl}
                            />
                            <ConsideringSection
                                label="Considering — Non-Male"
                                players={detail.consideringNonMalePlayers}
                                numTeams={detail.numTeams}
                                playerPicUrl={playerPicUrl}
                            />
                        </div>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    )
}
