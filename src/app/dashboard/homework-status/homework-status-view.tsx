"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RiCheckLine, RiArrowUpLine, RiArrowDownLine } from "@remixicon/react"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog"
import type {
    DivisionStatus,
    RatePlayersDetailResult,
    MovingDayDetailResult,
    DraftHomeworkDetailResult
} from "./actions"
import {
    getRatePlayersDetail,
    getMovingDayDetail,
    getDraftHomeworkDetail
} from "./actions"
import { CaptainHomeworkPopup } from "@/components/captain-homework-popup"

interface HomeworkStatusViewProps {
    divisions: DivisionStatus[]
    seasonId: number
    availableDivisions: { divisionId: number; divisionName: string }[]
    selectedDivisionId: number | null
    canSelectDivision: boolean
    playerPicUrl: string
}

type DialogState =
    | { type: "rate"; captainId: string; captainName: string }
    | { type: "moving"; captainId: string; captainName: string }
    | { type: "homework"; captainId: string; captainName: string }
    | null

export function HomeworkStatusView({
    divisions,
    seasonId,
    availableDivisions,
    selectedDivisionId,
    canSelectDivision,
    playerPicUrl
}: HomeworkStatusViewProps) {
    const router = useRouter()
    const [dialogState, setDialogState] = useState<DialogState>(null)
    const [rateData, setRateData] = useState<RatePlayersDetailResult | null>(
        null
    )
    const [movingData, setMovingData] = useState<MovingDayDetailResult | null>(
        null
    )
    const [homeworkData, setHomeworkData] =
        useState<DraftHomeworkDetailResult | null>(null)
    const [isPending, startTransition] = useTransition()

    const handleRateClick = (captainId: string, captainName: string) => {
        setDialogState({ type: "rate", captainId, captainName })
        setRateData(null)
        startTransition(async () => {
            const data = await getRatePlayersDetail(captainId, seasonId)
            setRateData(data)
        })
    }

    const handleMovingClick = (captainId: string, captainName: string) => {
        setDialogState({ type: "moving", captainId, captainName })
        setMovingData(null)
        startTransition(async () => {
            const data = await getMovingDayDetail(captainId, seasonId)
            setMovingData(data)
        })
    }

    const handleHomeworkClick = (captainId: string, captainName: string) => {
        setDialogState({ type: "homework", captainId, captainName })
        setHomeworkData(null)
        startTransition(async () => {
            const data = await getDraftHomeworkDetail(captainId, seasonId)
            setHomeworkData(data)
        })
    }

    const handleDialogClose = () => {
        setDialogState(null)
    }

    if (divisions.length === 0) {
        return (
            <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                No teams found for this season.
            </div>
        )
    }

    return (
        <>
            {canSelectDivision && selectedDivisionId !== null && (
                <div className="mb-6 flex items-center gap-2">
                    <label
                        htmlFor="division-select"
                        className="font-medium text-sm"
                    >
                        Division
                    </label>
                    <select
                        id="division-select"
                        value={selectedDivisionId}
                        onChange={(e) =>
                            router.push(
                                `/dashboard/homework-status?divisionId=${e.target.value}`
                            )
                        }
                        className="rounded border bg-background px-2 py-1 text-sm"
                    >
                        {availableDivisions.map((division) => (
                            <option
                                key={division.divisionId}
                                value={division.divisionId}
                            >
                                {division.divisionName}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="space-y-8">
                {divisions.map((division) => (
                    <div key={division.divisionId}>
                        <div className="mb-3 flex items-center gap-2">
                            <h2 className="font-semibold text-lg">
                                {division.divisionName}
                            </h2>
                            {division.isCoachesMode && (
                                <Badge variant="secondary">Coaches Mode</Badge>
                            )}
                        </div>

                        {division.captains.length === 0 ? (
                            <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                                No captains assigned.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/50">
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                                Captain
                                            </th>
                                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                                Rate Players
                                            </th>
                                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                                Moving Day
                                            </th>
                                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                                Draft Homework
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {division.captains.map((captain) => (
                                            <tr
                                                key={captain.captainId}
                                                className="border-b transition-colors last:border-0 hover:bg-accent/50"
                                            >
                                                <td className="px-4 py-2 font-medium">
                                                    {captain.captainName}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    {captain.ratePlayersComplete && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleRateClick(
                                                                    captain.captainId,
                                                                    captain.captainName
                                                                )
                                                            }
                                                            className="mx-auto flex items-center justify-center rounded p-0.5 text-green-600 transition-colors hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30"
                                                            title="View rated players"
                                                        >
                                                            <RiCheckLine
                                                                size={18}
                                                            />
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    {captain.movingDayComplete && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleMovingClick(
                                                                    captain.captainId,
                                                                    captain.captainName
                                                                )
                                                            }
                                                            className="mx-auto flex items-center justify-center rounded p-0.5 text-green-600 transition-colors hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30"
                                                            title="View moving day picks"
                                                        >
                                                            <RiCheckLine
                                                                size={18}
                                                            />
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    {captain.draftHomeworkComplete && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleHomeworkClick(
                                                                    captain.captainId,
                                                                    captain.captainName
                                                                )
                                                            }
                                                            className="mx-auto flex items-center justify-center rounded p-0.5 text-green-600 transition-colors hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30"
                                                            title="View draft homework"
                                                        >
                                                            <RiCheckLine
                                                                size={18}
                                                            />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Rate Players Dialog */}
            <Dialog
                open={dialogState?.type === "rate"}
                onOpenChange={(open) => {
                    if (!open) handleDialogClose()
                }}
            >
                <DialogContent className="flex max-h-[90dvh] max-w-sm flex-col">
                    <DialogHeader>
                        <DialogTitle>Rated Players</DialogTitle>
                        <DialogDescription>
                            Players rated by {dialogState?.captainName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {isPending && !rateData ? (
                            <div className="py-6 text-center text-muted-foreground text-sm">
                                Loading…
                            </div>
                        ) : rateData?.status === false ? (
                            <div className="py-4 text-center text-destructive text-sm">
                                {rateData.message || "Failed to load data."}
                            </div>
                        ) : rateData?.players.length === 0 ? (
                            <div className="py-4 text-center text-muted-foreground text-sm">
                                No ratings found.
                            </div>
                        ) : (
                            <ul className="divide-y rounded-md border">
                                {rateData?.players.map((p) => (
                                    <li
                                        key={p.playerId}
                                        className="px-3 py-2 text-sm"
                                    >
                                        {p.playerName}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Draft Homework Popup */}
            <CaptainHomeworkPopup
                open={dialogState?.type === "homework"}
                onClose={handleDialogClose}
                data={homeworkData}
                isLoading={isPending && !homeworkData}
                playerPicUrl={playerPicUrl}
            />

            {/* Moving Day Dialog */}
            <Dialog
                open={dialogState?.type === "moving"}
                onOpenChange={(open) => {
                    if (!open) handleDialogClose()
                }}
            >
                <DialogContent className="flex max-h-[90dvh] max-w-sm flex-col">
                    <DialogHeader>
                        <DialogTitle>Moving Day Picks</DialogTitle>
                        <DialogDescription>
                            Selections submitted by {dialogState?.captainName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {isPending && !movingData ? (
                            <div className="py-6 text-center text-muted-foreground text-sm">
                                Loading…
                            </div>
                        ) : movingData?.status === false ? (
                            <div className="py-4 text-center text-destructive text-sm">
                                {movingData.message || "Failed to load data."}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {movingData &&
                                    movingData.forcedUp.length > 0 && (
                                        <MovingDayGroup
                                            label="Force Up"
                                            players={movingData.forcedUp}
                                            icon={
                                                <RiArrowUpLine
                                                    size={14}
                                                    className="text-green-600"
                                                />
                                            }
                                        />
                                    )}
                                {movingData &&
                                    movingData.forcedDown.length > 0 && (
                                        <MovingDayGroup
                                            label="Force Down"
                                            players={movingData.forcedDown}
                                            icon={
                                                <RiArrowDownLine
                                                    size={14}
                                                    className="text-red-500"
                                                />
                                            }
                                        />
                                    )}
                                {movingData &&
                                    movingData.recommendedUp.length > 0 && (
                                        <MovingDayGroup
                                            label="Recommend Up"
                                            players={movingData.recommendedUp}
                                            icon={
                                                <RiArrowUpLine
                                                    size={14}
                                                    className="text-blue-500"
                                                />
                                            }
                                        />
                                    )}
                                {movingData &&
                                    movingData.recommendedDown.length > 0 && (
                                        <MovingDayGroup
                                            label="Recommend Down"
                                            players={movingData.recommendedDown}
                                            icon={
                                                <RiArrowDownLine
                                                    size={14}
                                                    className="text-orange-500"
                                                />
                                            }
                                        />
                                    )}
                                {movingData &&
                                    movingData.forcedUp.length === 0 &&
                                    movingData.forcedDown.length === 0 &&
                                    movingData.recommendedUp.length === 0 &&
                                    movingData.recommendedDown.length === 0 && (
                                        <div className="py-4 text-center text-muted-foreground text-sm">
                                            No moving day entries found.
                                        </div>
                                    )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

function MovingDayGroup({
    label,
    players,
    icon
}: {
    label: string
    players: { playerId: string; playerName: string }[]
    icon: React.ReactNode
}) {
    return (
        <div>
            <div className="mb-1 flex items-center gap-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {icon}
                {label}
            </div>
            <ul className="divide-y rounded-md border">
                {players.map((p) => (
                    <li key={p.playerId} className="px-3 py-2 text-sm">
                        {p.playerName}
                    </li>
                ))}
            </ul>
        </div>
    )
}
