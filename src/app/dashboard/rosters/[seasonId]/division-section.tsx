"use client"

import { RiStarFill, RiArrowDownSLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"

interface RosterPlayer {
    id: string
    displayName: string
    lastName: string
    isCaptain: boolean
}

interface RosterTeam {
    id: number
    name: string
    number: number | null
    players: RosterPlayer[]
}

interface DivisionData {
    id: number
    name: string
    level: number
    commissioners: string[]
    teams: RosterTeam[]
}

export function DivisionSection({ division }: { division: DivisionData }) {
    return (
        <Collapsible>
            <div className="rounded-lg border bg-card shadow-sm">
                <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50">
                    <h2 className="font-semibold text-xl">{division.name}</h2>
                    <RiArrowDownSLine
                        className="transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                        size={20}
                    />
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="space-y-4 border-t px-4 pt-3 pb-4">
                        {division.commissioners.length > 0 && (
                            <p className="font-semibold text-muted-foreground">
                                Commissioner
                                {division.commissioners.length > 1 ? "s" : ""}:{" "}
                                {division.commissioners.join(", ")}
                            </p>
                        )}
                        {division.teams.length === 0 ? (
                            <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                                No teams found for this division.
                            </div>
                        ) : (
                            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                                {division.teams.map((team) => (
                                    <div
                                        key={team.id}
                                        className="rounded-lg border bg-background p-4 shadow-sm"
                                    >
                                        <h3 className="mb-3 border-b pb-2 font-semibold text-lg">
                                            {team.name}
                                        </h3>
                                        {team.players.length === 0 ? (
                                            <p className="text-muted-foreground text-sm">
                                                No players drafted yet.
                                            </p>
                                        ) : (
                                            <ul className="space-y-1.5">
                                                {team.players.map((player) => (
                                                    <li
                                                        key={player.id}
                                                        className="flex items-center gap-2 text-sm"
                                                    >
                                                        <span
                                                            className={
                                                                player.isCaptain
                                                                    ? "font-semibold"
                                                                    : ""
                                                            }
                                                        >
                                                            {player.displayName}{" "}
                                                            {player.lastName}
                                                        </span>
                                                        {player.isCaptain && (
                                                            <RiStarFill
                                                                className="h-4 w-4 shrink-0 text-yellow-500"
                                                                aria-label="Captain"
                                                            />
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}
