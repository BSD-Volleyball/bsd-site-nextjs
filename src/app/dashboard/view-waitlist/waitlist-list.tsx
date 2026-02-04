"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiCloseLine } from "@remixicon/react"
import {
    getPlayerDetails,
    type PlayerDetails
} from "@/app/dashboard/player-lookup/actions"
import type { WaitlistEntry } from "./actions"

interface WaitlistListProps {
    entries: WaitlistEntry[]
    playerPicUrl: string
}

function formatHeight(inches: number | null): string {
    if (!inches) return "—"
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}"`
}

function getDisplayName(entry: WaitlistEntry): string {
    const preferred = entry.preferredName ? ` (${entry.preferredName})` : ""
    return `${entry.firstName}${preferred} ${entry.lastName}`
}

export function WaitlistList({ entries, playerPicUrl }: WaitlistListProps) {
    const [search, setSearch] = useState("")
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(
        null
    )
    const [isLoading, setIsLoading] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)

    const filteredEntries = useMemo(() => {
        if (!search) return entries
        const lower = search.toLowerCase()
        return entries.filter((e) => {
            const name = `${e.firstName} ${e.lastName}`.toLowerCase()
            const preferred = e.preferredName?.toLowerCase() || ""
            const email = e.email.toLowerCase()
            return (
                name.includes(lower) ||
                preferred.includes(lower) ||
                email.includes(lower)
            )
        })
    }, [entries, search])

    const handlePlayerClick = async (userId: string) => {
        setSelectedUserId(userId)
        setIsLoading(true)
        setPlayerDetails(null)

        const result = await getPlayerDetails(userId)

        if (result.status && result.player) {
            setPlayerDetails(result.player)
        }

        setIsLoading(false)
    }

    const handleCloseModal = useCallback(() => {
        setSelectedUserId(null)
        setPlayerDetails(null)
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground text-sm">
                    {entries.length} on waitlist
                </span>
                <Input
                    placeholder="Filter by name or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-xs"
                />
            </div>

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                #
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Name
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Email
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Gender
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Last Division
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Date Added
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEntries.map((entry, idx) => (
                            <tr
                                key={entry.waitlistId}
                                className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50"
                                onClick={() => handlePlayerClick(entry.userId)}
                            >
                                <td className="px-4 py-2 text-muted-foreground">
                                    {idx + 1}
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    {getDisplayName(entry)}
                                </td>
                                <td className="px-4 py-2">{entry.email}</td>
                                <td className="px-4 py-2">
                                    {entry.male === true
                                        ? "M"
                                        : entry.male === false
                                          ? "F"
                                          : "—"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.lastDivision ? (
                                        entry.lastDivision
                                    ) : (
                                        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700 text-xs dark:bg-blue-900 dark:text-blue-300">
                                            New
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-2">
                                    {new Date(
                                        entry.createdAt
                                    ).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {filteredEntries.length === 0 && (
                            <tr>
                                <td
                                    colSpan={6}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No waitlist entries found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

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
                                                    Email:
                                                </span>
                                                <span className="ml-2 font-medium">
                                                    {playerDetails.email}
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
                                            <div>
                                                <span className="text-muted-foreground">
                                                    Role:
                                                </span>
                                                <span className="ml-2 font-medium">
                                                    {playerDetails.role || "—"}
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
                                            {playerDetails.emergency_contact ||
                                                "—"}
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
                                        </div>
                                    </div>
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
