"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    getPlayerDetails,
    type PlayerListItem,
    type PlayerDetails,
    type PlayerSignup,
    type PlayerDraftHistory
} from "./actions"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceArea
} from "recharts"

interface PlayerLookupFormProps {
    players: PlayerListItem[]
    playerPicUrl: string
}

function formatHeight(inches: number | null): string {
    if (!inches) return "—"
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}"`
}

export function PlayerLookupForm({
    players,
    playerPicUrl
}: PlayerLookupFormProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
        null
    )
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(
        null
    )
    const [signupHistory, setSignupHistory] = useState<PlayerSignup[]>([])
    const [draftHistory, setDraftHistory] = useState<PlayerDraftHistory[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showImageModal, setShowImageModal] = useState(false)

    const selectedPlayer = useMemo(
        () => players.find((p) => p.id === selectedPlayerId),
        [players, selectedPlayerId]
    )

    const filteredPlayers = useMemo(() => {
        if (!search) return players
        const lowerSearch = search.toLowerCase()
        return players.filter((p) => {
            const fullName = `${p.first_name} ${p.last_name}`.toLowerCase()
            const preferredName = (p.preffered_name || "").toLowerCase()
            const oldIdStr = p.old_id?.toString() || ""
            return (
                fullName.includes(lowerSearch) ||
                preferredName.includes(lowerSearch) ||
                oldIdStr.includes(lowerSearch)
            )
        })
    }, [players, search])

    const handleSelect = async (playerId: string) => {
        setSelectedPlayerId(playerId)
        setOpen(false)
        setSearch("")
        setIsLoading(true)
        setError(null)

        const result = await getPlayerDetails(playerId)

        if (result.status && result.player) {
            setPlayerDetails(result.player)
            setSignupHistory(result.signupHistory)
            setDraftHistory(result.draftHistory)
        } else {
            setError(result.message || "Failed to load player details")
            setPlayerDetails(null)
            setSignupHistory([])
            setDraftHistory([])
        }

        setIsLoading(false)
    }

    const handleClear = () => {
        setSelectedPlayerId(null)
        setPlayerDetails(null)
        setSignupHistory([])
        setDraftHistory([])
        setSearch("")
        setError(null)
    }

    const formatSeasonLabel = (signup: PlayerSignup) => {
        const seasonName =
            signup.seasonName.charAt(0).toUpperCase() +
            signup.seasonName.slice(1)
        return `${seasonName} ${signup.seasonYear}`
    }

    const getDisplayName = (player: PlayerListItem) => {
        const oldIdPart = player.old_id ? `[${player.old_id}] ` : ""
        const preferredPart = player.preffered_name
            ? ` (${player.preffered_name})`
            : ""
        return `${oldIdPart}${player.first_name}${preferredPart} ${player.last_name}`
    }

    return (
        <div className="space-y-6">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full max-w-md justify-between font-normal"
                    >
                        <span
                            className={cn(
                                !selectedPlayer && "text-muted-foreground"
                            )}
                        >
                            {selectedPlayer
                                ? getDisplayName(selectedPlayer)
                                : "Search for a player..."}
                        </span>
                        <div className="flex items-center gap-1">
                            {selectedPlayer && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    className="rounded-sm p-0.5 hover:bg-accent"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleClear()
                                    }}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                        ) {
                                            e.stopPropagation()
                                            handleClear()
                                        }
                                    }}
                                >
                                    <RiCloseLine className="h-4 w-4 text-muted-foreground" />
                                </span>
                            )}
                            <RiArrowDownSLine className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-(--radix-popover-trigger-width) p-2"
                    align="start"
                >
                    <Input
                        placeholder="Search by name or old ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoCorrect="off"
                        className="mb-2"
                    />
                    <div className="max-h-60 overflow-y-auto">
                        {filteredPlayers.length === 0 ? (
                            <p className="py-2 text-center text-muted-foreground text-sm">
                                No players found
                            </p>
                        ) : (
                            filteredPlayers.map((player) => (
                                <button
                                    key={player.id}
                                    type="button"
                                    className={cn(
                                        "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                                        selectedPlayerId === player.id &&
                                            "bg-accent"
                                    )}
                                    onClick={() => handleSelect(player.id)}
                                >
                                    {getDisplayName(player)}
                                </button>
                            ))
                        )}
                    </div>
                </PopoverContent>
            </Popover>

            {error && (
                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                    {error}
                </div>
            )}

            {isLoading && (
                <p className="text-muted-foreground">
                    Loading player details...
                </p>
            )}

            {playerDetails && !isLoading && (
                <Card className="max-w-2xl">
                    <CardHeader>
                        <div className="flex items-start gap-4">
                            {playerPicUrl && playerDetails.picture && (
                                <button
                                    type="button"
                                    onClick={() => setShowImageModal(true)}
                                    className="shrink-0 cursor-pointer transition-opacity hover:opacity-90"
                                >
                                    <img
                                        src={`${playerPicUrl}${playerDetails.picture}`}
                                        alt={`${playerDetails.first_name} ${playerDetails.last_name}`}
                                        className="h-72 w-48 rounded-md object-cover"
                                    />
                                </button>
                            )}
                            <CardTitle className="pt-1">
                                {playerDetails.first_name}{" "}
                                {playerDetails.last_name}
                                {playerDetails.preffered_name && (
                                    <span className="ml-2 font-normal text-base text-muted-foreground">
                                        ({playerDetails.preffered_name})
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
                                        Old ID:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.old_id || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        User ID:
                                    </span>
                                    <span className="ml-2 font-medium font-mono text-xs">
                                        {playerDetails.id}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Email:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.email}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Email Verified:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.emailVerified
                                            ? "Yes"
                                            : "No"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Phone:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.phone || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Pronouns:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.pronouns || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Gender:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.male === true
                                            ? "Male"
                                            : playerDetails.male === false
                                              ? "Female"
                                              : "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Role:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.role || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Captain Eligible:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.captain_eligible
                                            ? "Yes"
                                            : "No"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Emergency Contact */}
                        <div>
                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                Emergency Contact
                            </h3>
                            <p className="text-sm">
                                {playerDetails.emergency_contact || "—"}
                            </p>
                        </div>

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
                                        {playerDetails.experience || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Self Assessment:
                                    </span>
                                    <span className="ml-2 font-medium capitalize">
                                        {playerDetails.assessment || "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Height:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {formatHeight(playerDetails.height)}
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
                                            playerDetails.skill_other && "Other"
                                        ]
                                            .filter(Boolean)
                                            .join(", ") || "—"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Account Info */}
                        <div>
                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                Account Information
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">
                                        Onboarding:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.onboarding_completed
                                            ? "Completed"
                                            : "Not completed"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Created:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {new Date(
                                            playerDetails.createdAt
                                        ).toLocaleDateString()}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Updated:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {new Date(
                                            playerDetails.updatedAt
                                        ).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Signup History */}
            {signupHistory.length > 0 && !isLoading && (
                <div className="space-y-4">
                    <h2 className="font-semibold text-lg">
                        Season Signup History
                    </h2>
                    {signupHistory.map((signup) => (
                        <Card key={signup.id} className="max-w-2xl">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">
                                    {formatSeasonLabel(signup)}
                                    <span className="ml-2 font-normal text-muted-foreground text-sm">
                                        (ID: {signup.seasonId})
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">
                                            Signup Date:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {new Date(
                                                signup.createdAt
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Amount Paid:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {signup.amountPaid
                                                ? `$${signup.amountPaid}`
                                                : "—"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Age Group:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {signup.age || "—"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Captain Interest:
                                        </span>
                                        <span className="ml-2 font-medium capitalize">
                                            {signup.captain === "yes"
                                                ? "Yes"
                                                : signup.captain ===
                                                    "only_if_needed"
                                                  ? "Only if needed"
                                                  : signup.captain === "no"
                                                    ? "No"
                                                    : "—"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Week 1 Tryouts:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {signup.play1stWeek
                                                ? "Requested"
                                                : "Not requested"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Pair Request:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {signup.pair ? "Yes" : "No"}
                                        </span>
                                    </div>
                                    {signup.pairPickName && (
                                        <div>
                                            <span className="text-muted-foreground">
                                                Paired With:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {signup.pairPickName}
                                            </span>
                                        </div>
                                    )}
                                    {signup.pairReason && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">
                                                Pair Reason:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {signup.pairReason}
                                            </span>
                                        </div>
                                    )}
                                    {signup.datesMissing && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">
                                                Dates Missing:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {signup.datesMissing}
                                            </span>
                                        </div>
                                    )}
                                    {signup.orderId && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">
                                                Order ID:
                                            </span>
                                            <span className="ml-2 font-medium font-mono text-xs">
                                                {signup.orderId}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Draft Pick History Chart */}
            {draftHistory.length > 0 &&
                !isLoading &&
                (() => {
                    const divisionBands = [
                        { y1: 0, y2: 49, label: "AA", color: "#ef4444" },
                        { y1: 50, y2: 99, label: "A", color: "#f97316" },
                        { y1: 100, y2: 149, label: "ABA", color: "#eab308" },
                        { y1: 150, y2: 199, label: "ABB", color: "#22c55e" },
                        { y1: 200, y2: 249, label: "BBB", color: "#3b82f6" },
                        { y1: 250, y2: 299, label: "BB", color: "#8b5cf6" }
                    ]
                    const maxOverall = Math.max(
                        ...draftHistory.map((d) => d.overall)
                    )
                    const yMax = Math.min(
                        Math.ceil((maxOverall + 10) / 50) * 50,
                        300
                    )
                    const visibleBands = divisionBands.filter(
                        (b) => b.y1 < yMax
                    )

                    return (
                        <Card className="max-w-2xl">
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Draft Pick History
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart
                                        data={draftHistory.map((d) => ({
                                            ...d,
                                            label: `${d.seasonName.charAt(0).toUpperCase() + d.seasonName.slice(1)} ${d.seasonYear}`
                                        }))}
                                        margin={{
                                            top: 5,
                                            right: 20,
                                            bottom: 5,
                                            left: 10
                                        }}
                                    >
                                        {visibleBands.map((band) => (
                                            <ReferenceArea
                                                key={band.label}
                                                y1={band.y1}
                                                y2={Math.min(band.y2, yMax)}
                                                fill={band.color}
                                                fillOpacity={0.15}
                                                ifOverflow="hidden"
                                            />
                                        ))}
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 12 }}
                                        />
                                        <YAxis
                                            reversed
                                            domain={[0, yMax]}
                                            ticks={visibleBands.map(
                                                (b) => b.y1 + 25
                                            )}
                                            tickFormatter={(value: number) => {
                                                const band = visibleBands.find(
                                                    (b) =>
                                                        value >= b.y1 &&
                                                        value <= b.y2
                                                )
                                                return band?.label ?? ""
                                            }}
                                            tick={{ fontSize: 11 }}
                                            width={40}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length)
                                                    return null
                                                const d = payload[0].payload
                                                return (
                                                    <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                                        <p className="font-medium">
                                                            {d.label}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Division:{" "}
                                                            {d.divisionName}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Team: {d.teamName}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Round: {d.round}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Overall Pick:{" "}
                                                            {d.overall}
                                                        </p>
                                                    </div>
                                                )
                                            }}
                                        />
                                        <Bar
                                            dataKey="overall"
                                            radius={[4, 4, 0, 0]}
                                        >
                                            {draftHistory.map((_, index) => (
                                                <Cell
                                                    key={index}
                                                    className="fill-primary"
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    )
                })()}

            {playerDetails && signupHistory.length === 0 && !isLoading && (
                <p className="text-muted-foreground text-sm">
                    No signup history found for this player.
                </p>
            )}

            {/* Image Modal */}
            {showImageModal && playerDetails?.picture && playerPicUrl && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                    onClick={() => setShowImageModal(false)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setShowImageModal(false)
                    }}
                    role="button"
                    tabIndex={0}
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
