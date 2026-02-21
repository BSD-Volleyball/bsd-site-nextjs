"use client"

import { useState, useCallback, useEffect } from "react"
import type { SignupGroup } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiCloseLine } from "@remixicon/react"
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

function formatHeight(inches: number | null): string {
    if (!inches) return "—"
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}"`
}

export function SignupsList({
    groups,
    allSeasons,
    playerPicUrl
}: SignupsListProps) {
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
                                                        handlePlayerClick(
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
                                                            handlePlayerClick(
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
                                                    "—"
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                {player.gender}
                                            </td>
                                            <td className="px-4 py-2">
                                                {player.age || "—"}
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

            {/* Player Detail Modal */}
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
                                                          ? "Non-Male"
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
                                                        const draftBySeasonId =
                                                            new Map<
                                                                number,
                                                                PlayerDraftHistory
                                                            >()
                                                        for (const d of draftHistory) {
                                                            draftBySeasonId.set(
                                                                d.seasonId,
                                                                d
                                                            )
                                                        }
                                                        const firstSeasonId =
                                                            draftHistory[0]
                                                                .seasonId
                                                        const lastSeasonId =
                                                            draftHistory[
                                                                draftHistory.length -
                                                                    1
                                                            ].seasonId
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
                                                                    PlayerDraftHistory
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
                                                                                      "#94a3b8"
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
                                Failed to load player details.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Image Modal */}
            {showImageModal && playerDetails?.picture && playerPicUrl && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
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
