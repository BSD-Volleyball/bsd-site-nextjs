"use client"

import type {
    ConsideredButUndraftedPlayer,
    PrepareForDraftData
} from "./actions"

function ConsideredButUndraftedRow({
    player,
    onOpenDetail
}: {
    player: ConsideredButUndraftedPlayer
    onOpenDetail: (userId: string) => void
}) {
    return (
        <tr className="border-t hover:bg-muted/30">
            <td className="px-3 py-2 font-medium">
                <button
                    type="button"
                    onClick={() => onOpenDetail(player.userId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {player.displayName} {player.lastName}
                </button>
                {player.pairDisplayName && (
                    <span className="text-muted-foreground">
                        {" "}
                        (pair: {player.pairDisplayName})
                    </span>
                )}
            </td>
            <td className="px-3 py-2 text-sm">
                {player.consideredInDivisions.join(", ")}
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
                {Math.round(player.score)}
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
                {player.considerationCount}
            </td>
        </tr>
    )
}

export function ConsideredUndraftedSection({
    data,
    onOpenDetail
}: {
    data: PrepareForDraftData
    onOpenDetail: (userId: string) => void
}) {
    return (
        <div className="space-y-2 pt-4">
            <h2 className="font-semibold text-lg">
                Players Considered but not Drafted
            </h2>
            {!data.consideredButUndrafted.isRelevant ? (
                <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                    {data.consideredButUndrafted.message}
                </div>
            ) : data.consideredButUndrafted.players.length === 0 ? (
                <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                    {data.consideredButUndrafted.message}
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                        {data.consideredButUndrafted.message}
                    </p>
                    <div className="rounded-md border">
                        <table className="min-w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-muted/50">
                                    <th className="px-3 py-2 text-left font-medium">
                                        Player
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Considered In
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Score
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Homework Entries
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.consideredButUndrafted.players.map(
                                    (player) => (
                                        <ConsideredButUndraftedRow
                                            key={player.userId}
                                            player={player}
                                            onOpenDetail={onOpenDetail}
                                        />
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
