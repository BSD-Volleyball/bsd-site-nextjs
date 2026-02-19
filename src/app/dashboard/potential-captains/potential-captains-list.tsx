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
import {
    getPlayerDetails,
    type PlayerDetails,
    type PlayerDraftHistory
} from "@/app/dashboard/player-lookup/actions"
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

export function PotentialCaptainsList({
    divisions,
    playerPicUrl
}: {
    divisions: DivisionCaptains[]
    playerPicUrl: string
}) {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(
        null
    )
    const [draftHistory, setDraftHistory] = useState<PlayerDraftHistory[]>([])
    const [pairPickName, setPairPickName] = useState<string | null>(null)
    const [pairReason, setPairReason] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)

    const handlePlayerClick = async (playerId: string) => {
        setSelectedUserId(playerId)
        setIsLoading(true)
        setPlayerDetails(null)
        setDraftHistory([])
        setPairPickName(null)
        setPairReason(null)

        const result = await getPlayerDetails(playerId)

        if (result.status && result.player) {
            setPlayerDetails(result.player)
            setDraftHistory(result.draftHistory)

            // Get pair info from most recent signup
            if (result.signupHistory.length > 0) {
                const mostRecentSignup = result.signupHistory[0]
                setPairPickName(mostRecentSignup.pairPickName)
                setPairReason(mostRecentSignup.pairReason)
            }
        }

        setIsLoading(false)
    }

    const handleCloseModal = useCallback(() => {
        setSelectedUserId(null)
        setPlayerDetails(null)
        setDraftHistory([])
        setPairPickName(null)
        setPairReason(null)
    }, [])

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
                                                    <button
                                                        key={player.id}
                                                        type="button"
                                                        onClick={() =>
                                                            handlePlayerClick(
                                                                player.id
                                                            )
                                                        }
                                                        className="flex items-center justify-between rounded-md border bg-background p-3 transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                                    >
                                                        <span className="text-sm">
                                                            {player.displayName}{" "}
                                                            {player.lastName}
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
                                                    data={draftHistory.map(
                                                        (d) => {
                                                            // Map division names to Y-axis values
                                                            const divisionValues: Record<
                                                                string,
                                                                number
                                                            > = {
                                                                AA: 6,
                                                                A: 5,
                                                                ABA: 4,
                                                                ABB: 3,
                                                                BBB: 2,
                                                                BB: 1
                                                            }
                                                            return {
                                                                ...d,
                                                                label: `${d.seasonName.charAt(0).toUpperCase() + d.seasonName.slice(1)} ${d.seasonYear}`,
                                                                divisionValue:
                                                                    divisionValues[
                                                                        d
                                                                            .divisionName
                                                                    ] || 0
                                                            }
                                                        }
                                                    )}
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
                                                        {draftHistory.map(
                                                            (d, index) => {
                                                                // Color code by division name
                                                                const colors: Record<
                                                                    string,
                                                                    string
                                                                > = {
                                                                    AA: "#ef4444",
                                                                    A: "#f97316",
                                                                    ABA: "#eab308",
                                                                    ABB: "#22c55e",
                                                                    BBB: "#3b82f6",
                                                                    BB: "#8b5cf6"
                                                                }
                                                                return (
                                                                    <Cell
                                                                        key={
                                                                            index
                                                                        }
                                                                        fill={
                                                                            colors[
                                                                                d
                                                                                    .divisionName
                                                                            ] ||
                                                                            "hsl(var(--primary))"
                                                                        }
                                                                    />
                                                                )
                                                            }
                                                        )}
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
                                Failed to load player details.
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
        </div>
    )
}
