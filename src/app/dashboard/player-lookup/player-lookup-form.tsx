"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { getPlayerDetails, type PlayerListItem, type PlayerDetails, type PlayerSignup } from "./actions"

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

export function PlayerLookupForm({ players, playerPicUrl }: PlayerLookupFormProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(null)
    const [signupHistory, setSignupHistory] = useState<PlayerSignup[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showImageModal, setShowImageModal] = useState(false)

    const selectedPlayer = useMemo(
        () => players.find(p => p.id === selectedPlayerId),
        [players, selectedPlayerId]
    )

    const filteredPlayers = useMemo(() => {
        if (!search) return players
        const lowerSearch = search.toLowerCase()
        return players.filter(p => {
            const fullName = `${p.first_name} ${p.last_name}`.toLowerCase()
            const oldIdStr = p.old_id?.toString() || ""
            return fullName.includes(lowerSearch) || oldIdStr.includes(lowerSearch)
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
        } else {
            setError(result.message || "Failed to load player details")
            setPlayerDetails(null)
            setSignupHistory([])
        }

        setIsLoading(false)
    }

    const handleClear = () => {
        setSelectedPlayerId(null)
        setPlayerDetails(null)
        setSignupHistory([])
        setSearch("")
        setError(null)
    }

    const formatSeasonLabel = (signup: PlayerSignup) => {
        const seasonName = signup.seasonName.charAt(0).toUpperCase() + signup.seasonName.slice(1)
        return `${seasonName} ${signup.seasonYear}`
    }

    const getDisplayName = (player: PlayerListItem) => {
        const oldIdPart = player.old_id ? `[${player.old_id}] ` : ""
        const preferredPart = player.preffered_name ? ` (${player.preffered_name})` : ""
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
                        <span className={cn(!selectedPlayer && "text-muted-foreground")}>
                            {selectedPlayer ? getDisplayName(selectedPlayer) : "Search for a player..."}
                        </span>
                        <div className="flex items-center gap-1">
                            {selectedPlayer && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    className="rounded-sm hover:bg-accent p-0.5"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleClear()
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
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
                <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
                    <Input
                        placeholder="Search by name or old ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="mb-2"
                    />
                    <div className="max-h-60 overflow-y-auto">
                        {filteredPlayers.length === 0 ? (
                            <p className="text-muted-foreground text-sm py-2 text-center">
                                No players found
                            </p>
                        ) : (
                            filteredPlayers.map(player => (
                                <button
                                    key={player.id}
                                    type="button"
                                    className={cn(
                                        "w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-accent",
                                        selectedPlayerId === player.id && "bg-accent"
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
                <p className="text-muted-foreground">Loading player details...</p>
            )}

            {playerDetails && !isLoading && (
                <Card className="max-w-2xl">
                    <CardHeader>
                        <div className="flex items-start gap-4">
                            {playerPicUrl && playerDetails.picture && (
                                <button
                                    type="button"
                                    onClick={() => setShowImageModal(true)}
                                    className="shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                                >
                                    <img
                                        src={`${playerPicUrl}${playerDetails.picture}`}
                                        alt={`${playerDetails.first_name} ${playerDetails.last_name}`}
                                        className="w-48 h-72 rounded-md object-cover"
                                    />
                                </button>
                            )}
                            <CardTitle className="pt-1">
                                {playerDetails.first_name} {playerDetails.last_name}
                                {playerDetails.preffered_name && (
                                    <span className="text-muted-foreground font-normal text-base ml-2">
                                        ({playerDetails.preffered_name})
                                    </span>
                                )}
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Basic Info */}
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                                Basic Information
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Old ID:</span>
                                    <span className="ml-2 font-medium">{playerDetails.old_id || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">User ID:</span>
                                    <span className="ml-2 font-medium font-mono text-xs">{playerDetails.id}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Email:</span>
                                    <span className="ml-2 font-medium">{playerDetails.email}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Email Verified:</span>
                                    <span className="ml-2 font-medium">{playerDetails.emailVerified ? "Yes" : "No"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Phone:</span>
                                    <span className="ml-2 font-medium">{playerDetails.phone || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Pronouns:</span>
                                    <span className="ml-2 font-medium">{playerDetails.pronouns || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Gender:</span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.male === true ? "Male" : playerDetails.male === false ? "Female" : "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Role:</span>
                                    <span className="ml-2 font-medium">{playerDetails.role || "—"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Emergency Contact */}
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                                Emergency Contact
                            </h3>
                            <p className="text-sm">{playerDetails.emergency_contact || "—"}</p>
                        </div>

                        {/* Volleyball Profile */}
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                                Volleyball Profile
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Experience:</span>
                                    <span className="ml-2 font-medium capitalize">{playerDetails.experience || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Self Assessment:</span>
                                    <span className="ml-2 font-medium capitalize">{playerDetails.assessment || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Height:</span>
                                    <span className="ml-2 font-medium">{formatHeight(playerDetails.height)}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Skills:</span>
                                    <span className="ml-2 font-medium">
                                        {[
                                            playerDetails.skill_passer && "Passer",
                                            playerDetails.skill_setter && "Setter",
                                            playerDetails.skill_hitter && "Hitter",
                                            playerDetails.skill_other && "Other"
                                        ].filter(Boolean).join(", ") || "—"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Account Info */}
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                                Account Information
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Onboarding:</span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.onboarding_completed ? "Completed" : "Not completed"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Created:</span>
                                    <span className="ml-2 font-medium">
                                        {new Date(playerDetails.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Updated:</span>
                                    <span className="ml-2 font-medium">
                                        {new Date(playerDetails.updatedAt).toLocaleDateString()}
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
                    <h2 className="font-semibold text-lg">Season Signup History</h2>
                    {signupHistory.map((signup) => (
                        <Card key={signup.id} className="max-w-2xl">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">
                                    {formatSeasonLabel(signup)}
                                    <span className="text-muted-foreground font-normal text-sm ml-2">
                                        (ID: {signup.seasonId})
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">Signup Date:</span>
                                        <span className="ml-2 font-medium">
                                            {new Date(signup.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Amount Paid:</span>
                                        <span className="ml-2 font-medium">
                                            {signup.amountPaid ? `$${signup.amountPaid}` : "—"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Age Group:</span>
                                        <span className="ml-2 font-medium">{signup.age || "—"}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Captain Interest:</span>
                                        <span className="ml-2 font-medium capitalize">
                                            {signup.captain === "yes"
                                                ? "Yes"
                                                : signup.captain === "only_if_needed"
                                                  ? "Only if needed"
                                                  : signup.captain === "no"
                                                    ? "No"
                                                    : "—"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Week 1 Tryouts:</span>
                                        <span className="ml-2 font-medium">
                                            {signup.play1stWeek ? "Requested" : "Not requested"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Pair Request:</span>
                                        <span className="ml-2 font-medium">
                                            {signup.pair ? "Yes" : "No"}
                                        </span>
                                    </div>
                                    {signup.pairPickName && (
                                        <div>
                                            <span className="text-muted-foreground">Paired With:</span>
                                            <span className="ml-2 font-medium">{signup.pairPickName}</span>
                                        </div>
                                    )}
                                    {signup.pairReason && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">Pair Reason:</span>
                                            <span className="ml-2 font-medium">{signup.pairReason}</span>
                                        </div>
                                    )}
                                    {signup.datesMissing && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">Dates Missing:</span>
                                            <span className="ml-2 font-medium">{signup.datesMissing}</span>
                                        </div>
                                    )}
                                    {signup.orderId && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">Order ID:</span>
                                            <span className="ml-2 font-medium font-mono text-xs">{signup.orderId}</span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {playerDetails && signupHistory.length === 0 && !isLoading && (
                <p className="text-muted-foreground text-sm">No signup history found for this player.</p>
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
                            className="absolute -top-3 -right-3 rounded-full bg-white p-1 text-black hover:bg-gray-200"
                        >
                            <RiCloseLine className="h-6 w-6" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
