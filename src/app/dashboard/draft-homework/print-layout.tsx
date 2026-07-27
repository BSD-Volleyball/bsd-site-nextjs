"use client"

import type { DraftHomeworkPlayer } from "./actions"
import { CONSIDERING_ROUND, type Selections } from "./homework-selections"
import { formatDisplayName } from "@/lib/utils"

function getPlayersForRound(
    tabKey: "m" | "f",
    round: number,
    selections: Selections,
    players: DraftHomeworkPlayer[]
): DraftHomeworkPlayer[] {
    const result: DraftHomeworkPlayer[] = []
    for (let slot = 0; slot < 30; slot++) {
        const userId = selections[`${tabKey}-${round}-${slot}`]
        if (userId) {
            const player = players.find((p) => p.userId === userId)
            if (player) result.push(player)
        }
    }
    return result
}

function PrintPlayerCard({
    player,
    playerPicUrl
}: {
    player: DraftHomeworkPlayer
    playerPicUrl: string
}) {
    const src = player.picture ? `${playerPicUrl}${player.picture}` : null
    const displayName = formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
    return (
        <div style={{ textAlign: "center", width: "1.05in" }}>
            {src ? (
                <img
                    src={src}
                    alt={displayName}
                    style={{
                        width: "1in",
                        height: "1.25in",
                        objectFit: "cover",
                        objectPosition: "top",
                        borderRadius: "3px",
                        display: "block"
                    }}
                />
            ) : (
                <div
                    style={{
                        width: "1in",
                        height: "1.25in",
                        background: "#e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "16pt",
                        borderRadius: "3px"
                    }}
                >
                    {player.firstName[0]}
                    {player.lastName[0]}
                </div>
            )}
            <div
                style={{
                    fontSize: "7.5pt",
                    marginTop: "3px",
                    lineHeight: 1.25,
                    wordBreak: "break-word"
                }}
            >
                {displayName}
            </div>
            {player.oldId > 0 && (
                <div
                    style={{
                        fontSize: "7pt",
                        color: "#888",
                        lineHeight: 1.2
                    }}
                >
                    #{player.oldId}
                </div>
            )}
        </div>
    )
}

export function PrintTabSection({
    tabKey,
    numRounds,
    players,
    selections,
    playerPicUrl
}: {
    tabKey: "m" | "f"
    numRounds: number
    players: DraftHomeworkPlayer[]
    selections: Selections
    playerPicUrl: string
}) {
    const rounds = Array.from({ length: numRounds }, (_, i) => i + 1)
    const consideringPlayers = getPlayersForRound(
        tabKey,
        CONSIDERING_ROUND,
        selections,
        players
    )

    // Auto-scale to guarantee content fits within 10in of usable page height.
    // Each round row ≈ 1.85in (label + 1.25in photo + name + margin).
    // Header ≈ 0.45in. Considering section adds another ~1.85in if present.
    const hasConsidering = consideringPlayers.length > 0
    const estimatedHeightIn = numRounds * 1.85 + (hasConsidering ? 1.85 : 0)
    const zoom = Math.min(1, 10.25 / estimatedHeightIn)

    return (
        <div style={{ zoom: zoom }}>
            {rounds.map((round) => {
                const roundPlayers = getPlayersForRound(
                    tabKey,
                    round,
                    selections,
                    players
                )
                if (roundPlayers.length === 0) return null
                return (
                    <div key={round} style={{ marginBottom: "0.18in" }}>
                        <div
                            style={{
                                fontSize: "9pt",
                                fontWeight: "bold",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: "#444",
                                marginBottom: "0.08in",
                                borderBottom: "1px solid #ccc",
                                paddingBottom: "2px"
                            }}
                        >
                            Round {round}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "0.1in"
                            }}
                        >
                            {roundPlayers.map((player) => (
                                <PrintPlayerCard
                                    key={player.userId}
                                    player={player}
                                    playerPicUrl={playerPicUrl}
                                />
                            ))}
                        </div>
                    </div>
                )
            })}

            {consideringPlayers.length > 0 && (
                <div style={{ marginTop: "0.1in" }}>
                    <div
                        style={{
                            fontSize: "9pt",
                            fontWeight: "bold",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            color: "#444",
                            marginBottom: "0.08in",
                            borderBottom: "1px solid #ccc",
                            paddingBottom: "2px"
                        }}
                    >
                        Considering
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.1in"
                        }}
                    >
                        {consideringPlayers.map((player) => (
                            <PrintPlayerCard
                                key={player.userId}
                                player={player}
                                playerPicUrl={playerPicUrl}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
