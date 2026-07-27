"use client"

import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatHeight } from "@/components/player-detail"
import type { SignupGroup } from "./actions"

interface SignupGroupCardProps {
    group: SignupGroup
    title: ReactNode
    onOpenPlayerDetail: (userId: string) => void
}

export function SignupGroupCard({
    group,
    title,
    onOpenPlayerDetail
}: SignupGroupCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
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
                                                onOpenPlayerDetail(
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
                                                    onOpenPlayerDetail(
                                                        player.pairedWithId
                                                    )
                                                }
                                                className="text-left underline decoration-dotted transition-colors hover:text-primary focus:outline-none"
                                                disabled={!player.pairedWithId}
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
    )
}
