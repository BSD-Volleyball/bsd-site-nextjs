"use client"

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"
import type {
    CaptainTeamRef,
    RatePlayerEntry,
    SeasonTeamDivisionGroup,
    TryoutDivisionGroup,
    TryoutSessionGroup
} from "./actions"
import type { TryoutTimeSlotGroup } from "./rate-player-helpers"
import { PlayerTable } from "./player-table"

interface TryoutSessionAccordionProps {
    selectedTryoutSession: TryoutSessionGroup | null
    filteredPlayerIds: Set<string>
    onRate: (player: RatePlayerEntry) => void
    playerPicUrl: string
}

export function TryoutSessionAccordion({
    selectedTryoutSession,
    filteredPlayerIds,
    onRate,
    playerPicUrl
}: TryoutSessionAccordionProps) {
    return (
        <div className="space-y-3">
            {!selectedTryoutSession ? (
                <div className="rounded-md border bg-muted/50 p-5 text-muted-foreground text-sm">
                    No Tryout 1 session data found for the active season.
                </div>
            ) : (
                <Accordion type="multiple" className="w-full">
                    {selectedTryoutSession.courts.map((court) => {
                        const filteredCourtPlayers = court.players.filter(
                            (player) => filteredPlayerIds.has(player.id)
                        )

                        return (
                            <AccordionItem
                                key={court.courtNumber}
                                value={`court-${court.courtNumber}`}
                            >
                                <AccordionTrigger>
                                    <span>
                                        Court {court.courtNumber} (
                                        {filteredCourtPlayers.length})
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <PlayerTable
                                        players={filteredCourtPlayers}
                                        onRate={onRate}
                                        playerPicUrl={playerPicUrl}
                                    />
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            )}
        </div>
    )
}

interface TryoutDivisionAccordionProps {
    lookupType: "tryout2" | "tryout3"
    selectedTryoutDivision: TryoutDivisionGroup | null
    filteredPlayerIds: Set<string>
    onRate: (player: RatePlayerEntry) => void
    playerPicUrl: string
}

export function TryoutDivisionAccordion({
    lookupType,
    selectedTryoutDivision,
    filteredPlayerIds,
    onRate,
    playerPicUrl
}: TryoutDivisionAccordionProps) {
    return (
        <div className="space-y-3">
            {!selectedTryoutDivision ? (
                <div className="rounded-md border bg-muted/50 p-5 text-muted-foreground text-sm">
                    No {lookupType === "tryout2" ? "Tryout 2" : "Tryout 3"}{" "}
                    division data found for the active season.
                </div>
            ) : (
                <Accordion type="multiple" className="w-full">
                    {selectedTryoutDivision.teams.map((team) => {
                        const filteredTeamPlayers = team.players.filter(
                            (player) => filteredPlayerIds.has(player.id)
                        )

                        return (
                            <AccordionItem
                                key={team.teamNumber}
                                value={`team-${team.teamNumber}`}
                            >
                                <AccordionTrigger>
                                    <span>
                                        Team {team.teamNumber} (
                                        {filteredTeamPlayers.length})
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <PlayerTable
                                        players={filteredTeamPlayers}
                                        onRate={onRate}
                                        playerPicUrl={playerPicUrl}
                                    />
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            )}
        </div>
    )
}

interface TryoutTimeSlotAccordionProps {
    lookupType: "tryout2Times" | "tryout3Times"
    selectedTimeSlot: TryoutTimeSlotGroup | null
    filteredPlayerIds: Set<string>
    onRate: (player: RatePlayerEntry) => void
    playerPicUrl: string
}

export function TryoutTimeSlotAccordion({
    lookupType,
    selectedTimeSlot,
    filteredPlayerIds,
    onRate,
    playerPicUrl
}: TryoutTimeSlotAccordionProps) {
    return (
        <div className="space-y-3">
            {!selectedTimeSlot ? (
                <div className="rounded-md border bg-muted/50 p-5 text-muted-foreground text-sm">
                    No {lookupType === "tryout2Times" ? "Tryout 2" : "Tryout 3"}{" "}
                    time slot data found for the active season.
                </div>
            ) : (
                <Accordion type="multiple" className="w-full">
                    {selectedTimeSlot.divisions.map((division) => {
                        const divisionPlayerCount = division.teams.reduce(
                            (sum, team) =>
                                sum +
                                team.players.filter((player) =>
                                    filteredPlayerIds.has(player.id)
                                ).length,
                            0
                        )
                        const divisionLabel =
                            division.courtNumber > 0
                                ? `${division.divisionName} — Court ${division.courtNumber}`
                                : division.divisionName

                        return (
                            <AccordionItem
                                key={division.divisionName}
                                value={`division-${division.divisionName}`}
                            >
                                <AccordionTrigger>
                                    <span>
                                        {divisionLabel} ({divisionPlayerCount})
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <Accordion
                                        type="multiple"
                                        className="w-full"
                                    >
                                        {division.teams.map((team) => {
                                            const filteredTeamPlayers =
                                                team.players.filter((player) =>
                                                    filteredPlayerIds.has(
                                                        player.id
                                                    )
                                                )

                                            return (
                                                <AccordionItem
                                                    key={team.teamNumber}
                                                    value={`team-${team.teamNumber}`}
                                                >
                                                    <AccordionTrigger>
                                                        <span>
                                                            Team{" "}
                                                            {team.teamNumber} (
                                                            {
                                                                filteredTeamPlayers.length
                                                            }
                                                            )
                                                        </span>
                                                    </AccordionTrigger>
                                                    <AccordionContent>
                                                        <PlayerTable
                                                            players={
                                                                filteredTeamPlayers
                                                            }
                                                            onRate={onRate}
                                                            playerPicUrl={
                                                                playerPicUrl
                                                            }
                                                        />
                                                    </AccordionContent>
                                                </AccordionItem>
                                            )
                                        })}
                                    </Accordion>
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            )}
        </div>
    )
}

interface ByTeamAccordionProps {
    byTeamDivisions: SeasonTeamDivisionGroup[]
    captainTeam: CaptainTeamRef | null
    filteredPlayerIds: Set<string>
    onRate: (player: RatePlayerEntry) => void
    playerPicUrl: string
}

export function ByTeamAccordion({
    byTeamDivisions,
    captainTeam,
    filteredPlayerIds,
    onRate,
    playerPicUrl
}: ByTeamAccordionProps) {
    return (
        <div className="space-y-3">
            {byTeamDivisions.length === 0 ? (
                <div className="rounded-md border bg-muted/50 p-5 text-muted-foreground text-sm">
                    No teams found for the active season.
                </div>
            ) : (
                <Accordion
                    type="multiple"
                    className="w-full"
                    defaultValue={
                        captainTeam
                            ? [`division-${captainTeam.divisionName}`]
                            : undefined
                    }
                >
                    {byTeamDivisions.map((division) => {
                        const divisionPlayerCount = division.teams.reduce(
                            (sum, team) =>
                                sum +
                                team.players.filter((player) =>
                                    filteredPlayerIds.has(player.id)
                                ).length,
                            0
                        )

                        return (
                            <AccordionItem
                                key={division.divisionName}
                                value={`division-${division.divisionName}`}
                            >
                                <AccordionTrigger>
                                    <span>
                                        {division.divisionName} (
                                        {divisionPlayerCount})
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <Accordion
                                        type="multiple"
                                        className="w-full"
                                        defaultValue={
                                            captainTeam
                                                ? [`team-${captainTeam.teamId}`]
                                                : undefined
                                        }
                                    >
                                        {division.teams.map((team) => {
                                            const filteredTeamPlayers =
                                                team.players.filter((player) =>
                                                    filteredPlayerIds.has(
                                                        player.id
                                                    )
                                                )

                                            return (
                                                <AccordionItem
                                                    key={team.teamId}
                                                    value={`team-${team.teamId}`}
                                                >
                                                    <AccordionTrigger>
                                                        <span>
                                                            {team.teamName} (
                                                            {
                                                                filteredTeamPlayers.length
                                                            }
                                                            )
                                                        </span>
                                                    </AccordionTrigger>
                                                    <AccordionContent>
                                                        <PlayerTable
                                                            players={
                                                                filteredTeamPlayers
                                                            }
                                                            onRate={onRate}
                                                            playerPicUrl={
                                                                playerPicUrl
                                                            }
                                                        />
                                                    </AccordionContent>
                                                </AccordionItem>
                                            )
                                        })}
                                    </Accordion>
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            )}
        </div>
    )
}
