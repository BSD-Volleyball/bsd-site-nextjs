"use client"

import { RiArrowDownSLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"

interface PotentialCaptain {
    id: string
    displayName: string
    lastName: string
    consecutiveSeasons: number
    captainInterest: "yes" | "only_if_needed" | "no"
}

interface CaptainList {
    title: string
    description: string
    players: PotentialCaptain[]
}

interface DivisionCaptains {
    id: number
    name: string
    level: number
    lists: CaptainList[]
}

export function PotentialCaptainsList({
    divisions
}: {
    divisions: DivisionCaptains[]
}) {
    return (
        <div className="space-y-4">
            {divisions.map((division) => (
                <Collapsible key={division.id}>
                    <div className="rounded-lg border bg-card shadow-sm">
                        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50">
                            <h2 className="font-semibold text-xl">
                                {division.name}
                            </h2>
                            <RiArrowDownSLine
                                className="transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                                size={20}
                            />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="space-y-6 border-t px-4 pt-4 pb-4">
                                {division.lists.map((list, index) => (
                                    <div key={index}>
                                        <h3 className="mb-2 font-semibold text-base">
                                            {list.title}
                                        </h3>
                                        <p className="mb-3 text-muted-foreground text-sm">
                                            {list.description}
                                        </p>
                                        {list.players.length === 0 ? (
                                            <div className="rounded-md bg-muted p-4 text-center text-muted-foreground text-sm">
                                                No players in this category.
                                            </div>
                                        ) : (
                                            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                                {list.players.map((player) => (
                                                    <div
                                                        key={player.id}
                                                        className="flex items-center justify-between rounded-md border bg-background p-3"
                                                    >
                                                        <span className="text-sm">
                                                            {player.displayName}{" "}
                                                            {player.lastName}
                                                        </span>
                                                        <Badge variant="secondary">
                                                            {
                                                                player.consecutiveSeasons
                                                            }{" "}
                                                            {player.consecutiveSeasons ===
                                                            1
                                                                ? "season"
                                                                : "seasons"}
                                                        </Badge>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CollapsibleContent>
                    </div>
                </Collapsible>
            ))}
        </div>
    )
}
