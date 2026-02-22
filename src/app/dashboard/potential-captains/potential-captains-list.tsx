"use client"

import { useState, useCallback, useEffect } from "react"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
    getPotentialCaptainPlayerDetails,
    type PotentialCaptainPlayerDetails,
    type PotentialCaptainDraftHistory
} from "./actions"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts"

interface PotentialCaptain {
    id: string
    displayName: string
    lastName: string
    email: string
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

function formatHeight(inches: number | null): string {
    if (!inches) return "—"
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}"`
}

interface SeasonInfo {
    id: number
    year: number
    name: string
}

export function PotentialCaptainsList({
    divisions,
    allSeasons,
    playerPicUrl,
    emailTemplate,
    emailSubject
}: {
    divisions: DivisionCaptains[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
    emailTemplate: string
    emailSubject: string
}) {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [playerDetails, setPlayerDetails] =
        useState<PotentialCaptainPlayerDetails | null>(null)
    const [draftHistory, setDraftHistory] = useState<
        PotentialCaptainDraftHistory[]
    >([])
    const [playerDetailsError, setPlayerDetailsError] = useState<string | null>(
        null
    )
    const [pairPickName, setPairPickName] = useState<string | null>(null)
    const [pairReason, setPairReason] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)
    const [selectedPlayers, setSelectedPlayers] = useState<
        Map<number, Set<string>>
    >(new Map())
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [currentDivisionId, setCurrentDivisionId] = useState<number | null>(
        null
    )
    const [copySuccess, setCopySuccess] = useState(false)
    const [copyEmailSuccess, setCopyEmailSuccess] = useState(false)
    const [copySubjectSuccess, setCopySubjectSuccess] = useState(false)

    const handlePlayerClick = async (playerId: string) => {
        setSelectedUserId(playerId)
        setIsLoading(true)
        setPlayerDetails(null)
        setDraftHistory([])
        setPairPickName(null)
        setPairReason(null)
        setPlayerDetailsError(null)

        const result = await getPotentialCaptainPlayerDetails(playerId)

        if (result.status && result.player) {
            setPlayerDetails(result.player)
            setDraftHistory(result.draftHistory)
            setPairPickName(result.pairPickName)
            setPairReason(result.pairReason)
        } else {
            setPlayerDetailsError(
                result.message || "Failed to load player details."
            )
        }

        setIsLoading(false)
    }

    const handleCloseModal = useCallback(() => {
        setSelectedUserId(null)
        setPlayerDetails(null)
        setDraftHistory([])
        setPairPickName(null)
        setPairReason(null)
        setPlayerDetailsError(null)
    }, [])

    const togglePlayerSelection = (divisionId: number, playerId: string) => {
        setSelectedPlayers((prev) => {
            const newMap = new Map(prev)
            const currentSet = newMap.get(divisionId) || new Set()
            const newSet = new Set(currentSet)

            if (newSet.has(playerId)) {
                newSet.delete(playerId)
            } else {
                newSet.add(playerId)
            }
            newMap.set(divisionId, newSet)
            return newMap
        })
    }

    const handleGenerateMessage = (divisionId: number) => {
        setCurrentDivisionId(divisionId)
        setShowEmailModal(true)
        setCopySuccess(false)
        setCopyEmailSuccess(false)
        setCopySubjectSuccess(false)
    }

    const getSelectedPlayersForDivision = (
        divisionId: number
    ): PotentialCaptain[] => {
        const division = divisions.find((d) => d.id === divisionId)
        if (!division) return []

        const selectedIds = selectedPlayers.get(divisionId) || new Set()
        const allPlayers: PotentialCaptain[] = []

        division.lists.forEach((list) => {
            allPlayers.push(...list.players)
        })

        return allPlayers.filter((p) => selectedIds.has(p.id))
    }

    const formatEmailList = (players: PotentialCaptain[]): string => {
        return players
            .map((p) => `${p.displayName} ${p.lastName} <${p.email}>`)
            .join(", ")
    }

    const handleCopyToClipboard = async () => {
        if (!currentDivisionId) return

        const players = getSelectedPlayersForDivision(currentDivisionId)
        const emailList = formatEmailList(players)

        try {
            await navigator.clipboard.writeText(emailList)
            setCopySuccess(true)
            setTimeout(() => setCopySuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy to clipboard:", err)
        }
    }

    const handleCopyEmailTemplate = async () => {
        try {
            await navigator.clipboard.writeText(emailTemplate)
            setCopyEmailSuccess(true)
            setTimeout(() => setCopyEmailSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy email template to clipboard:", err)
        }
    }

    const handleCopySubject = async () => {
        try {
            await navigator.clipboard.writeText(emailSubject)
            setCopySubjectSuccess(true)
            setTimeout(() => setCopySubjectSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy subject to clipboard:", err)
        }
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (showImageModal) {
                    setShowImageModal(false)
                } else if (selectedUserId) {
                    handleCloseModal()
                }
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [selectedUserId, showImageModal, handleCloseModal])
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
                                                        className="flex items-center gap-2 rounded-md border bg-background p-3"
                                                    >
                                                        <Checkbox
                                                            checked={
                                                                selectedPlayers
                                                                    .get(
                                                                        division.id
                                                                    )
                                                                    ?.has(
                                                                        player.id
                                                                    ) || false
                                                            }
                                                            onCheckedChange={() =>
                                                                togglePlayerSelection(
                                                                    division.id,
                                                                    player.id
                                                                )
                                                            }
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handlePlayerClick(
                                                                    player.id
                                                                )
                                                            }
                                                            className="flex flex-1 items-center justify-between transition-colors hover:text-primary focus:outline-none"
                                                        >
                                                            <span className="text-sm">
                                                                {
                                                                    player.displayName
                                                                }{" "}
                                                                {
                                                                    player.lastName
                                                                }
                                                            </span>
                                                            <Badge variant="secondary">
                                                                {player.consecutiveSeasons >=
                                                                10
                                                                    ? "9+"
                                                                    : player.consecutiveSeasons}{" "}
                                                                {player.consecutiveSeasons ===
                                                                1
                                                                    ? "season"
                                                                    : "seasons"}
                                                            </Badge>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-6 flex justify-end border-t px-4 py-4">
                                <Button
                                    onClick={() =>
                                        handleGenerateMessage(division.id)
                                    }
                                    disabled={
                                        !selectedPlayers.get(division.id) ||
                                        selectedPlayers.get(division.id)!
                                            .size === 0
                                    }
                                    variant="default"
                                >
                                    Generate Message (
                                    {selectedPlayers.get(division.id)?.size ||
                                        0}{" "}
                                    selected)
                                </Button>
                            </div>
                        </CollapsibleContent>
                    </div>
                </Collapsible>
            ))}

            {/* Player Details Modal */}
            {selectedUserId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={handleCloseModal}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") handleCloseModal()
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div
                        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-0 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="document"
                    >
                        <button
                            type="button"
                            onClick={handleCloseModal}
                            className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>

                        {isLoading && (
                            <div className="p-8 text-center text-muted-foreground">
                                Loading player details...
                            </div>
                        )}

                        {playerDetails && !isLoading && (
                            <Card className="border-0 shadow-none">
                                <CardHeader>
                                    <div className="flex items-start gap-4">
                                        {playerPicUrl &&
                                            playerDetails.picture && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setShowImageModal(true)
                                                    }
                                                    className="shrink-0 cursor-pointer transition-opacity hover:opacity-90"
                                                >
                                                    <img
                                                        src={`${playerPicUrl}${playerDetails.picture}`}
                                                        alt={`${playerDetails.first_name} ${playerDetails.last_name}`}
                                                        className="h-48 w-32 rounded-md object-cover"
                                                    />
                                                </button>
                                            )}
                                        <CardTitle className="pt-1">
                                            {playerDetails.first_name}{" "}
                                            {playerDetails.last_name}
                                            {playerDetails.preffered_name && (
                                                <span className="ml-2 font-normal text-base text-muted-foreground">
                                                    (
                                                    {
                                                        playerDetails.preffered_name
                                                    }
                                                    )
                                                </span>
                                            )}
                                        </CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* Basic Info */}
                                    <div>
                                        <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                            Basic Information
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">
                                                    Pronouns:
                                                </span>
                                                <span className="ml-2 font-medium">
                                                    {playerDetails.pronouns ||
                                                        "—"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">
                                                    Gender:
                                                </span>
                                                <span className="ml-2 font-medium">
                                                    {playerDetails.male === true
                                                        ? "Male"
                                                        : playerDetails.male ===
                                                            false
                                                          ? "Female"
                                                          : "—"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Pair Request */}
                                    {(pairPickName || pairReason) && (
                                        <div>
                                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                                Pair Request
                                            </h3>
                                            <div className="grid grid-cols-1 gap-3 text-sm">
                                                {pairPickName && (
                                                    <div>
                                                        <span className="text-muted-foreground">
                                                            Pair Pick:
                                                        </span>
                                                        <span className="ml-2 font-medium">
                                                            {pairPickName}
                                                        </span>
                                                    </div>
                                                )}
                                                {pairReason && (
                                                    <div>
                                                        <span className="text-muted-foreground">
                                                            Reason:
                                                        </span>
                                                        <span className="ml-2 font-medium">
                                                            {pairReason}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Volleyball Profile */}
                                    <div>
                                        <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                            Volleyball Profile
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <span className="text-muted-foreground">
                                                    Experience:
                                                </span>
                                                <span className="ml-2 font-medium capitalize">
                                                    {playerDetails.experience ||
                                                        "—"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">
                                                    Assessment:
                                                </span>
                                                <span className="ml-2 font-medium capitalize">
                                                    {playerDetails.assessment ||
                                                        "—"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">
                                                    Height:
                                                </span>
                                                <span className="ml-2 font-medium">
                                                    {formatHeight(
                                                        playerDetails.height
                                                    )}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">
                                                    Skills:
                                                </span>
                                                <span className="ml-2 font-medium">
                                                    {[
                                                        playerDetails.skill_passer &&
                                                            "Passer",
                                                        playerDetails.skill_setter &&
                                                            "Setter",
                                                        playerDetails.skill_hitter &&
                                                            "Hitter",
                                                        playerDetails.skill_other &&
                                                            "Other"
                                                    ]
                                                        .filter(Boolean)
                                                        .join(", ") || "—"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Division History Graph */}
                                    {draftHistory.length > 0 && (
                                        <div>
                                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                                Division History
                                            </h3>
                                            <ResponsiveContainer
                                                width="100%"
                                                height={250}
                                            >
                                                <BarChart
                                                    data={(() => {
                                                        const divisionValues: Record<
                                                            string,
                                                            number
                                                        > = {
                                                            AA: 6,
                                                            A: 5,
                                                            ABA: 4,
                                                            AB: 4,
                                                            ABB: 3,
                                                            BBB: 2,
                                                            BB: 1
                                                        }
                                                        // Build a map of seasonId -> draft entry
                                                        const draftBySeasonId =
                                                            new Map<
                                                                number,
                                                                PotentialCaptainDraftHistory
                                                            >()
                                                        for (const d of draftHistory) {
                                                            draftBySeasonId.set(
                                                                d.seasonId,
                                                                d
                                                            )
                                                        }
                                                        // Find the range of season IDs this player spans
                                                        const firstSeasonId =
                                                            draftHistory[0]
                                                                .seasonId
                                                        const lastSeasonId =
                                                            draftHistory[
                                                                draftHistory.length -
                                                                    1
                                                            ].seasonId
                                                        // Get all seasons in range (allSeasons is newest-first, so reverse for chronological)
                                                        const seasonsInRange = [
                                                            ...allSeasons
                                                        ]
                                                            .reverse()
                                                            .filter(
                                                                (s) =>
                                                                    s.id >=
                                                                        firstSeasonId &&
                                                                    s.id <=
                                                                        lastSeasonId
                                                            )
                                                        // Build timeline with gaps
                                                        return seasonsInRange.map(
                                                            (s) => {
                                                                const draft =
                                                                    draftBySeasonId.get(
                                                                        s.id
                                                                    )
                                                                const label = `${s.name.charAt(0).toUpperCase() + s.name.slice(1)} ${s.year}`
                                                                if (draft) {
                                                                    return {
                                                                        ...draft,
                                                                        label,
                                                                        divisionValue:
                                                                            divisionValues[
                                                                                draft
                                                                                    .divisionName
                                                                            ] ||
                                                                            0
                                                                    }
                                                                }
                                                                return {
                                                                    seasonId:
                                                                        s.id,
                                                                    seasonYear:
                                                                        s.year,
                                                                    seasonName:
                                                                        s.name,
                                                                    divisionName:
                                                                        "",
                                                                    teamName:
                                                                        "",
                                                                    round: 0,
                                                                    overall: 0,
                                                                    label,
                                                                    divisionValue: 0
                                                                }
                                                            }
                                                        )
                                                    })()}
                                                    margin={{
                                                        top: 5,
                                                        right: 20,
                                                        bottom: 5,
                                                        left: 50
                                                    }}
                                                >
                                                    <XAxis
                                                        dataKey="label"
                                                        tick={{ fontSize: 12 }}
                                                    />
                                                    <YAxis
                                                        domain={[0, 7]}
                                                        ticks={[
                                                            1, 2, 3, 4, 5, 6
                                                        ]}
                                                        tickFormatter={(
                                                            value: number
                                                        ) => {
                                                            const labels: Record<
                                                                number,
                                                                string
                                                            > = {
                                                                6: "AA",
                                                                5: "A",
                                                                4: "ABA",
                                                                3: "ABB",
                                                                2: "BBB",
                                                                1: "BB"
                                                            }
                                                            return (
                                                                labels[value] ||
                                                                ""
                                                            )
                                                        }}
                                                        tick={{ fontSize: 11 }}
                                                        width={45}
                                                    />
                                                    <Tooltip
                                                        content={({
                                                            active,
                                                            payload
                                                        }) => {
                                                            if (
                                                                !active ||
                                                                !payload?.length
                                                            )
                                                                return null
                                                            const d =
                                                                payload[0]
                                                                    .payload
                                                            if (
                                                                !d.divisionName
                                                            ) {
                                                                return (
                                                                    <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                                                        <p className="font-medium">
                                                                            {
                                                                                d.label
                                                                            }
                                                                        </p>
                                                                        <p className="text-muted-foreground italic">
                                                                            Did
                                                                            not
                                                                            play
                                                                        </p>
                                                                    </div>
                                                                )
                                                            }
                                                            return (
                                                                <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                                                    <p className="font-medium">
                                                                        {
                                                                            d.label
                                                                        }
                                                                    </p>
                                                                    <p className="text-muted-foreground">
                                                                        Division:{" "}
                                                                        {
                                                                            d.divisionName
                                                                        }
                                                                    </p>
                                                                    <p className="text-muted-foreground">
                                                                        Team:{" "}
                                                                        {
                                                                            d.teamName
                                                                        }
                                                                    </p>
                                                                </div>
                                                            )
                                                        }}
                                                    />
                                                    <Bar
                                                        dataKey="divisionValue"
                                                        radius={[4, 4, 0, 0]}
                                                    >
                                                        {(() => {
                                                            const firstSeasonId =
                                                                draftHistory[0]
                                                                    .seasonId
                                                            const lastSeasonId =
                                                                draftHistory[
                                                                    draftHistory.length -
                                                                        1
                                                                ].seasonId
                                                            const seasonsInRange =
                                                                [...allSeasons]
                                                                    .reverse()
                                                                    .filter(
                                                                        (s) =>
                                                                            s.id >=
                                                                                firstSeasonId &&
                                                                            s.id <=
                                                                                lastSeasonId
                                                                    )
                                                            const draftBySeasonId =
                                                                new Map<
                                                                    number,
                                                                    PotentialCaptainDraftHistory
                                                                >()
                                                            for (const d of draftHistory) {
                                                                draftBySeasonId.set(
                                                                    d.seasonId,
                                                                    d
                                                                )
                                                            }
                                                            const colors: Record<
                                                                string,
                                                                string
                                                            > = {
                                                                AA: "#ef4444",
                                                                A: "#f97316",
                                                                ABA: "#eab308",
                                                                AB: "#eab308",
                                                                ABB: "#22c55e",
                                                                BBB: "#3b82f6",
                                                                BB: "#8b5cf6"
                                                            }
                                                            return seasonsInRange.map(
                                                                (s, index) => {
                                                                    const draft =
                                                                        draftBySeasonId.get(
                                                                            s.id
                                                                        )
                                                                    return (
                                                                        <Cell
                                                                            key={
                                                                                index
                                                                            }
                                                                            fill={
                                                                                draft
                                                                                    ? colors[
                                                                                          draft
                                                                                              .divisionName
                                                                                      ] ||
                                                                                      "hsl(var(--primary))"
                                                                                    : "transparent"
                                                                            }
                                                                        />
                                                                    )
                                                                }
                                                            )
                                                        })()}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {!isLoading && !playerDetails && (
                            <div className="p-8 text-center text-muted-foreground">
                                {playerDetailsError ||
                                    "Failed to load player details."}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Image Modal */}
            {showImageModal && playerDetails?.picture && playerPicUrl && (
                <div
                    className="fixed inset-0 z-60 flex items-center justify-center bg-black/80"
                    onClick={() => setShowImageModal(false)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setShowImageModal(false)
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div className="relative max-h-[90vh] max-w-[90vw]">
                        <img
                            src={`${playerPicUrl}${playerDetails.picture}`}
                            alt={`${playerDetails.first_name} ${playerDetails.last_name}`}
                            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                        />
                        <button
                            type="button"
                            onClick={() => setShowImageModal(false)}
                            className="-top-3 -right-3 absolute rounded-full bg-white p-1 text-black hover:bg-gray-200"
                        >
                            <RiCloseLine className="h-6 w-6" />
                        </button>
                    </div>
                </div>
            )}

            {/* Email Generation Modal */}
            {showEmailModal && currentDivisionId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={() => setShowEmailModal(false)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setShowEmailModal(false)
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div
                        className="relative w-full max-w-2xl rounded-lg bg-background p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="document"
                    >
                        <button
                            type="button"
                            onClick={() => setShowEmailModal(false)}
                            className="absolute top-3 right-3 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>

                        <h2 className="mb-6 font-semibold text-xl">
                            Suggested Draft Message
                        </h2>

                        <h3 className="mb-2 font-semibold text-sm">
                            Email Recipients{" "}
                            <span className="font-normal text-muted-foreground">
                                (please remember to BCC this list)
                            </span>
                        </h3>

                        <div className="mb-4 max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-4">
                            <p className="break-all font-mono text-sm">
                                {formatEmailList(
                                    getSelectedPlayersForDivision(
                                        currentDivisionId
                                    )
                                )}
                            </p>
                        </div>

                        <div className="mb-4">
                            <Button
                                onClick={handleCopyToClipboard}
                                variant="default"
                            >
                                {copySuccess
                                    ? "Copied!"
                                    : "Copy Email Addresses"}
                            </Button>
                        </div>

                        {emailSubject && (
                            <div className="mb-4">
                                <h3 className="mb-2 font-semibold text-sm">
                                    Draft Email Subject
                                </h3>
                                <div className="mb-2 rounded-md border bg-muted/30 p-4">
                                    <p className="text-sm">{emailSubject}</p>
                                </div>
                                <Button
                                    onClick={handleCopySubject}
                                    variant="default"
                                >
                                    {copySubjectSuccess
                                        ? "Copied!"
                                        : "Copy Subject"}
                                </Button>
                            </div>
                        )}

                        {emailTemplate && (
                            <div className="mb-4">
                                <h3 className="mb-2 font-semibold text-sm">
                                    Draft Email Content
                                </h3>
                                <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/30 p-4">
                                    <p className="whitespace-pre-wrap text-sm">
                                        {emailTemplate}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            {emailTemplate && (
                                <Button
                                    onClick={handleCopyEmailTemplate}
                                    variant="default"
                                >
                                    {copyEmailSuccess
                                        ? "Copied!"
                                        : "Copy Email Content"}
                                </Button>
                            )}
                            <Button
                                onClick={() => setShowEmailModal(false)}
                                variant="outline"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
