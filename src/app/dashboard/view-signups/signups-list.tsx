"use client"

import { useState } from "react"
import {
    getSignupsCsvData,
    getPlayerDetailsPublic,
    type SignupGroup
} from "./actions"
import { Button } from "@/components/ui/button"
import { RiDownloadLine } from "@remixicon/react"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { buildTimestampedCsvFilename, downloadCsv } from "@/lib/csv-download"
import { SignupGroupCard } from "./signup-group-card"
import { generateCsvContent } from "./signups-csv"

interface SeasonInfo {
    id: number
    year: number
    name: string
}

interface SignupsListProps {
    undraftedGroups: SignupGroup[]
    draftedGroups: SignupGroup[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
    seasonLabel: string
}

export function SignupsList({
    undraftedGroups,
    draftedGroups,
    allSeasons,
    playerPicUrl,
    seasonLabel
}: SignupsListProps) {
    const modal = usePlayerDetailModal({ fetchFn: getPlayerDetailsPublic })
    const [isExporting, setIsExporting] = useState(false)

    const handleDownloadCsv = async () => {
        setIsExporting(true)
        try {
            const result = await getSignupsCsvData()
            if (!result.status || !result.data.entries.length) return

            const csvContent = generateCsvContent(
                result.data.entries,
                playerPicUrl
            )
            downloadCsv(
                csvContent,
                buildTimestampedCsvFilename("signups", seasonLabel)
            )
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button
                    onClick={handleDownloadCsv}
                    variant="outline"
                    size="sm"
                    disabled={isExporting}
                    className="flex items-center gap-2"
                >
                    <RiDownloadLine className="h-4 w-4" />
                    {isExporting ? "Exporting..." : "Export CSV"}
                </Button>
            </div>

            {undraftedGroups.length > 0 && (
                <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-lg">Not Yet Drafted</h2>
                    <span className="rounded-md bg-muted px-3 py-1 font-medium text-sm">
                        {undraftedGroups.reduce(
                            (sum, g) => sum + g.players.length,
                            0
                        )}{" "}
                        players
                    </span>
                    <span className="rounded-md bg-blue-100 px-3 py-1 font-medium text-blue-700 text-sm dark:bg-blue-900 dark:text-blue-300">
                        {undraftedGroups.reduce(
                            (sum, g) =>
                                sum +
                                g.players.filter((p) => p.gender === "Male")
                                    .length,
                            0
                        )}{" "}
                        male
                    </span>
                    <span className="rounded-md bg-purple-100 px-3 py-1 font-medium text-purple-700 text-sm dark:bg-purple-900 dark:text-purple-300">
                        {undraftedGroups.reduce(
                            (sum, g) =>
                                sum +
                                g.players.filter((p) => p.gender !== "Male")
                                    .length,
                            0
                        )}{" "}
                        non-male
                    </span>
                </div>
            )}

            {undraftedGroups.map((group) => (
                <SignupGroupCard
                    key={group.groupLabel}
                    group={group}
                    title={
                        group.groupLabel === "New Players"
                            ? "New Players"
                            : `Last played in ${group.groupLabel}`
                    }
                    onOpenPlayerDetail={modal.openPlayerDetail}
                />
            ))}

            {draftedGroups.length > 0 && (
                <>
                    <div className="flex items-center gap-3 border-t pt-4">
                        <h2 className="font-semibold text-lg">
                            Drafted Players
                        </h2>
                        <span className="rounded-md bg-amber-100 px-3 py-1 font-medium text-amber-700 text-sm dark:bg-amber-900 dark:text-amber-300">
                            {draftedGroups.reduce(
                                (sum, g) => sum + g.players.length,
                                0
                            )}{" "}
                            players
                        </span>
                        <span className="rounded-md bg-blue-100 px-3 py-1 font-medium text-blue-700 text-sm dark:bg-blue-900 dark:text-blue-300">
                            {draftedGroups.reduce(
                                (sum, g) =>
                                    sum +
                                    g.players.filter((p) => p.gender === "Male")
                                        .length,
                                0
                            )}{" "}
                            male
                        </span>
                        <span className="rounded-md bg-purple-100 px-3 py-1 font-medium text-purple-700 text-sm dark:bg-purple-900 dark:text-purple-300">
                            {draftedGroups.reduce(
                                (sum, g) =>
                                    sum +
                                    g.players.filter((p) => p.gender !== "Male")
                                        .length,
                                0
                            )}{" "}
                            non-male
                        </span>
                    </div>

                    {draftedGroups.map((group) => (
                        <SignupGroupCard
                            key={`drafted-${group.groupLabel}`}
                            group={group}
                            title={`Drafted in ${group.groupLabel}`}
                            onOpenPlayerDetail={modal.openPlayerDetail}
                        />
                    ))}
                </>
            )}

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
                datesMissing={modal.unavailableDates}
                playoffDates={modal.playoffDates}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
