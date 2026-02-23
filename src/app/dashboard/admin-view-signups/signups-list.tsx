"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiCloseLine, RiDownloadLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    getPlayerDetails,
    type PlayerDetails
} from "@/app/dashboard/player-lookup/actions"
import type { SignupEntry } from "./actions"

interface SignupsListProps {
    signups: SignupEntry[]
    playerPicUrl: string
    seasonLabel: string
}

function formatHeight(inches: number | null): string {
    if (!inches) return "—"
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}"`
}

function getDisplayName(entry: SignupEntry): string {
    const preferred = entry.preferredName ? ` (${entry.preferredName})` : ""
    return `${entry.firstName}${preferred} ${entry.lastName}`
}

function escapeCsvField(field: string): string {
    if (field.includes(",") || field.includes('"') || field.includes("\n")) {
        return `"${field.replace(/"/g, '""')}"`
    }
    return field
}

function generateCsvContent(signups: SignupEntry[]): string {
    const headers = [
        "id",
        "First Name",
        "Last Name",
        "Preferred Name",
        "Email",
        "Phone",
        "Pair Pick",
        "Pair Reason",
        "Gender",
        "Age",
        "Captain",
        "Paid",
        "Signup Date",
        "Experience",
        "Assessment",
        "Height",
        "Picture",
        "Skill: Passer",
        "Skill: Setter",
        "Skill: Hitter",
        "Skill: Other",
        "Dates Missing",
        "Play 1st Week",
        "Last Draft Season",
        "Last Draft Division",
        "Last Draft Captain",
        "Last Draft Overall"
    ]

    const rows = signups.map((entry) => [
        entry.oldId !== null ? String(entry.oldId) : "",
        escapeCsvField(entry.firstName),
        escapeCsvField(entry.lastName),
        escapeCsvField(entry.preferredName || ""),
        escapeCsvField(entry.email),
        escapeCsvField(entry.phone || ""),
        escapeCsvField(entry.pairPickName || ""),
        escapeCsvField(entry.pairReason || ""),
        entry.male === true ? "M" : entry.male === false ? "F" : "",
        entry.age || "",
        entry.captain === "yes"
            ? "Yes"
            : entry.captain === "only_if_needed"
              ? "If needed"
              : entry.captain === "no"
                ? "No"
                : "",
        entry.amountPaid || "",
        new Date(entry.signupDate).toLocaleDateString(),
        entry.experience || "",
        entry.assessment || "",
        formatHeight(entry.height),
        entry.picture || "",
        entry.skillPasser ? "Yes" : "No",
        entry.skillSetter ? "Yes" : "No",
        entry.skillHitter ? "Yes" : "No",
        entry.skillOther ? "Yes" : "No",
        escapeCsvField(entry.datesMissing || ""),
        entry.playFirstWeek ? "Yes" : "No",
        escapeCsvField(entry.lastDraftSeason || ""),
        escapeCsvField(entry.lastDraftDivision || ""),
        escapeCsvField(entry.lastDraftCaptain || ""),
        entry.lastDraftOverall !== null ? String(entry.lastDraftOverall) : ""
    ])

    return [headers, ...rows].map((row) => row.join(",")).join("\n")
}

export function SignupsList({
    signups,
    playerPicUrl,
    seasonLabel
}: SignupsListProps) {
    const [search, setSearch] = useState("")
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [selectedEntry, setSelectedEntry] = useState<SignupEntry | null>(null)
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(
        null
    )
    const [isLoading, setIsLoading] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)

    const filteredSignups = useMemo(() => {
        if (!search) return signups
        const lower = search.toLowerCase()
        return signups.filter((s) => {
            const name = `${s.firstName} ${s.lastName}`.toLowerCase()
            const preferred = s.preferredName?.toLowerCase() || ""
            const pairPick = s.pairPickName?.toLowerCase() || ""
            return (
                name.includes(lower) ||
                preferred.includes(lower) ||
                pairPick.includes(lower)
            )
        })
    }, [signups, search])

    const signupNumberById = useMemo(() => {
        return new Map(
            signups.map((entry, index) => [
                entry.signupId,
                signups.length - index
            ])
        )
    }, [signups])

    const newCount = useMemo(
        () => signups.filter((s) => s.isNew).length,
        [signups]
    )

    const maleCount = useMemo(
        () => signups.filter((s) => s.male === true).length,
        [signups]
    )

    const nonMaleCount = useMemo(
        () => signups.filter((s) => s.male !== true).length,
        [signups]
    )

    const handlePlayerClick = async (entry: SignupEntry) => {
        setSelectedUserId(entry.userId)
        setSelectedEntry(entry)
        setIsLoading(true)
        setPlayerDetails(null)

        const result = await getPlayerDetails(entry.userId)

        if (result.status && result.player) {
            setPlayerDetails(result.player)
        }

        setIsLoading(false)
    }

    const handleCloseModal = useCallback(() => {
        setSelectedUserId(null)
        setSelectedEntry(null)
        setPlayerDetails(null)
    }, [])

    const handleDownloadCsv = () => {
        const csvContent = generateCsvContent(filteredSignups)

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-3 py-1.5 font-medium text-sm">
                        {signups.length} total
                    </span>
                    <span className="rounded-md bg-blue-100 px-3 py-1.5 font-medium text-blue-700 text-sm dark:bg-blue-900 dark:text-blue-300">
                        {maleCount} male
                    </span>
                    <span className="rounded-md bg-purple-100 px-3 py-1.5 font-medium text-purple-700 text-sm dark:bg-purple-900 dark:text-purple-300">
                        {nonMaleCount} non-male
                    </span>
                    {newCount > 0 && (
                        <span className="rounded-md bg-green-100 px-3 py-1.5 font-medium text-green-700 text-sm dark:bg-green-900 dark:text-green-300">
                            {newCount} new
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleDownloadCsv}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                    >
                        <RiDownloadLine className="h-4 w-4" />
                        Export CSV
                    </Button>
                    <Input
                        placeholder="Filter by name or pair pick..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-xs"
                    />
                </div>
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
                                Pair Pick
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Gender
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Age
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Captain
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Paid
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Date
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSignups.map((entry, idx) => (
                            <tr
                                key={entry.signupId}
                                className={cn(
                                    "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50",
                                    entry.isNew &&
                                        "bg-blue-50 dark:bg-blue-950/40"
                                )}
                                onClick={() => handlePlayerClick(entry)}
                            >
                                <td className="px-4 py-2 text-muted-foreground">
                                    {signupNumberById.get(entry.signupId) ??
                                        idx + 1}
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    <div className="flex items-center gap-2">
                                        {getDisplayName(entry)}
                                        {entry.isNew && (
                                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700 text-xs dark:bg-blue-900 dark:text-blue-300">
                                                new
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-2">
                                    {entry.pairPickName || "—"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.male === true
                                        ? "M"
                                        : entry.male === false
                                          ? "F"
                                          : "—"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.age || "—"}
                                </td>
                                <td className="px-4 py-2 capitalize">
                                    {entry.captain === "yes"
                                        ? "Yes"
                                        : entry.captain === "only_if_needed"
                                          ? "If needed"
                                          : entry.captain === "no"
                                            ? "No"
                                            : "—"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.amountPaid
                                        ? `$${entry.amountPaid}`
                                        : "—"}
                                </td>
                                <td className="px-4 py-2">
                                    {new Date(
                                        entry.signupDate
                                    ).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {filteredSignups.length === 0 && (
                            <tr>
                                <td
                                    colSpan={8}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No signups found.
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

                                    {/* Pair Pick */}
                                    {(selectedEntry?.pairPickName ||
                                        selectedEntry?.pairReason) && (
                                        <div>
                                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                                Pair Request
                                            </h3>
                                            <div className="grid grid-cols-1 gap-3 text-sm">
                                                {selectedEntry.pairPickName && (
                                                    <div>
                                                        <span className="text-muted-foreground">
                                                            Pair Pick:
                                                        </span>
                                                        <span className="ml-2 font-medium">
                                                            {
                                                                selectedEntry.pairPickName
                                                            }
                                                        </span>
                                                    </div>
                                                )}
                                                {selectedEntry.pairReason && (
                                                    <div>
                                                        <span className="text-muted-foreground">
                                                            Reason:
                                                        </span>
                                                        <span className="ml-2 font-medium">
                                                            {
                                                                selectedEntry.pairReason
                                                            }
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
