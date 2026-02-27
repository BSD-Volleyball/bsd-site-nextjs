"use client"

import type { SignupGroup } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    usePlayerDetailModal,
    PlayerDetailPopup,
    formatHeight
} from "@/components/player-detail"

interface SeasonInfo {
    id: number
    year: number
    name: string
}

interface SignupsListProps {
    groups: SignupGroup[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
}

export function SignupsList({
    groups,
    allSeasons,
    playerPicUrl
}: SignupsListProps) {
    const modal = usePlayerDetailModal()

    return (
        <div className="space-y-6">
            {groups.map((group) => (
                <Card key={group.groupLabel}>
                    <CardHeader>
                        <CardTitle>{group.groupLabel}</CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-muted px-3 py-1.5 font-medium text-sm">
                                {group.players.length} total
                            </span>
                            <span className="rounded-md bg-blue-100 px-3 py-1.5 font-medium text-blue-700 text-sm dark:bg-blue-900 dark:text-blue-300">
                                {
                                    group.players.filter(
                                        (player) => player.gender === "Male"
                                    ).length
                                }{" "}
                                male
                            </span>
                            <span className="rounded-md bg-purple-100 px-3 py-1.5 font-medium text-purple-700 text-sm dark:bg-purple-900 dark:text-purple-300">
                                {
                                    group.players.filter(
                                        (player) => player.gender !== "Male"
                                    ).length
                                }{" "}
                                non-male
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                            Name
                                        </th>
                                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                            Paired With
                                        </th>
                                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                            Gender
                                        </th>
                                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                            Age
                                        </th>
                                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                            Height
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.players.map((player) => (
                                        <tr
                                            key={player.userId}
                                            className="border-b transition-colors last:border-0 hover:bg-accent/50"
                                        >
                                            <td className="px-4 py-2 font-medium">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        modal.openPlayerDetail(
                                                            player.userId
                                                        )
                                                    }
                                                    className="text-left underline decoration-dotted transition-colors hover:text-primary focus:outline-none"
                                                >
                                                    {player.displayName}
                                                </button>
                                            </td>
                                            <td className="px-4 py-2">
                                                {player.pairedWith ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            player.pairedWithId &&
                                                            modal.openPlayerDetail(
                                                                player.pairedWithId
                                                            )
                                                        }
                                                        className="text-left underline decoration-dotted transition-colors hover:text-primary focus:outline-none"
                                                        disabled={
                                                            !player.pairedWithId
                                                        }
                                                    >
                                                        {player.pairedWith}
                                                    </button>
                                                ) : (
                                                    "\u2014"
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                {player.gender}
                                            </td>
                                            <td className="px-4 py-2">
                                                {player.age || "\u2014"}
                                            </td>
                                            <td className="px-4 py-2">
                                                {formatHeight(player.height)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            ))}

            <PlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                allSeasons={allSeasons}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
            />
        </div>
    )
}
