"use client"

import { useState } from "react"
import { getSignupsCsvData, type SignupGroup, type SignupCsvEntry } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RiDownloadLine } from "@remixicon/react"
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
    seasonLabel: string
}

function buildPlayerPictureUrl(
    baseUrl: string,
    picturePath: string | null
): string {
    if (!picturePath) return ""
    if (/^https?:\/\//i.test(picturePath)) return picturePath
    if (!baseUrl) return picturePath

    const normalizedBaseUrl = baseUrl.endsWith("/")
        ? baseUrl.slice(0, -1)
        : baseUrl
    const normalizedPicturePath = picturePath.startsWith("/")
        ? picturePath
        : `/${picturePath}`

    return `${normalizedBaseUrl}${normalizedPicturePath}`
}

function serializeCsvField(value: unknown): string {
    const stringValue =
        value === null || value === undefined ? "" : String(value)
    return `"${stringValue.replace(/"/g, '""')}"`
}

function generateCsvContent(
    entries: SignupCsvEntry[],
    playerPicUrl: string
): string {
    const headers = [
        "id",
        "First Name",
        "Last Name",
        "Preferred Name",
        "Pair Pick",
        "Gender",
        "Age",
        "Experience",
        "Assessment",
        "Height",
        "Picture",
        "Skill: Passer",
        "Skill: Setter",
        "Skill: Hitter",
        "Skill: Other",
        "Dates Missing",
        "Last Season",
        "Last Division",
        "Last Captain",
        "Captain In",
        "Drafted In"
    ]

    const rows = entries.map((entry) => [
        entry.oldId !== 0 ? String(entry.oldId) : "",
        entry.firstName,
        entry.lastName,
        entry.preferredName || "",
        entry.pairPickName || "",
        entry.male === true ? "M" : entry.male === false ? "NM" : "",
        entry.age || "",
        entry.experience || "",
        entry.assessment || "",
        formatHeight(entry.height),
        buildPlayerPictureUrl(playerPicUrl, entry.picture),
        entry.skillPasser ? "Yes" : "No",
        entry.skillSetter ? "Yes" : "No",
        entry.skillHitter ? "Yes" : "No",
        entry.skillOther ? "Yes" : "No",
        entry.datesMissing || "",
        entry.lastDraftSeason || "",
        entry.lastDraftDivision || "",
        entry.lastDraftCaptain || "",
        entry.captainIn || "",
        entry.draftedIn || ""
    ])

    return [headers, ...rows]
        .map((row) => row.map((value) => serializeCsvField(value)).join(","))
        .join("\r\n")
}

export function SignupsList({
    groups,
    allSeasons,
    playerPicUrl,
    seasonLabel
}: SignupsListProps) {
    const modal = usePlayerDetailModal()
    const [isExporting, setIsExporting] = useState(false)

    const handleDownloadCsv = async () => {
        setIsExporting(true)
        try {
            const result = await getSignupsCsvData()
            if (!result.status || !result.entries.length) return

            const csvContent = generateCsvContent(result.entries, playerPicUrl)
            const blob = new Blob([`\ufeff${csvContent}`], {
                type: "text/csv;charset=utf-8;"
            })

            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url

            const seasonSlug = seasonLabel.toLowerCase().replace(/\s+/g, "-")
            const timestamp = new Date().toISOString().split("T")[0]
            link.download = `signups-${seasonSlug}-${timestamp}.csv`

            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
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
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
            />
        </div>
    )
}
