"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { RiCloseLine, RiDownloadLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    getPlayerDetails,
    type PlayerDetails,
    type PlayerDraftHistory
} from "@/app/dashboard/player-lookup/actions"
import {
    Bar,
    BarChart,
    Cell,
    ReferenceArea,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts"
import { deleteSignupEntry, type SignupEntry } from "./actions"

interface SignupsListProps {
    signups: SignupEntry[]
    playerPicUrl: string
    seasonLabel: string
    lateAmount: string
}

function formatHeight(inches: number | null): string {
    if (!inches) return "—"
    const numericInches = Number(inches)
    if (!Number.isFinite(numericInches)) return "—"

    const feet = Math.floor(numericInches / 12)
    const remainingInches = numericInches % 12
    const formattedFeet = String(feet).replace(/\.0+$/, "")
    const formattedInches = String(remainingInches).replace(/\.0+$/, "")

    return `${formattedFeet}'${formattedInches}"`
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

function getDisplayName(entry: SignupEntry): string {
    const preferred = entry.preferredName ? ` (${entry.preferredName})` : ""
    return `${entry.firstName}${preferred} ${entry.lastName}`
}

function serializeCsvField(value: unknown): string {
    const stringValue =
        value === null || value === undefined ? "" : String(value)
    return `"${stringValue.replace(/"/g, '""')}"`
}

function generateCsvContent(
    signups: SignupEntry[],
    playerPicUrl: string
): string {
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
        entry.firstName,
        entry.lastName,
        entry.preferredName || "",
        entry.email,
        entry.phone || "",
        entry.pairPickName || "",
        entry.pairReason || "",
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
        buildPlayerPictureUrl(playerPicUrl, entry.picture),
        entry.skillPasser ? "Yes" : "No",
        entry.skillSetter ? "Yes" : "No",
        entry.skillHitter ? "Yes" : "No",
        entry.skillOther ? "Yes" : "No",
        entry.datesMissing || "",
        entry.playFirstWeek ? "Yes" : "No",
        entry.lastDraftSeason || "",
        entry.lastDraftDivision || "",
        entry.lastDraftCaptain || "",
        entry.lastDraftOverall !== null ? String(entry.lastDraftOverall) : ""
    ])

    return [headers, ...rows]
        .map((row) => row.map((value) => serializeCsvField(value)).join(","))
        .join("\r\n")
}

export function SignupsList({
    signups,
    playerPicUrl,
    seasonLabel,
    lateAmount
}: SignupsListProps) {
    const router = useRouter()
    const [search, setSearch] = useState("")
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [selectedEntry, setSelectedEntry] = useState<SignupEntry | null>(null)
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(
        null
    )
    const [draftHistory, setDraftHistory] = useState<PlayerDraftHistory[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)
    const [signupToDelete, setSignupToDelete] = useState<SignupEntry | null>(
        null
    )
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteResult, setDeleteResult] = useState<{
        status: boolean
        message: string
    } | null>(null)

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

    const totalPaid = useMemo(() => {
        return signups.reduce((sum, entry) => {
            if (!entry.amountPaid) return sum
            const amount = Number.parseFloat(entry.amountPaid)
            return Number.isFinite(amount) ? sum + amount : sum
        }, 0)
    }, [signups])

    const discountUsage = useMemo(() => {
        return signups
            .filter((entry) => entry.discountCodeName)
            .map((entry) => ({
                signupId: entry.signupId,
                playerName: getDisplayName(entry),
                discountCodeName: entry.discountCodeName as string,
                amountPaid: Number.parseFloat(entry.amountPaid || "0")
            }))
            .sort((a, b) => a.playerName.localeCompare(b.playerName))
    }, [signups])

    const discountUsageTotalPaid = useMemo(() => {
        return discountUsage.reduce((sum, entry) => {
            return Number.isFinite(entry.amountPaid)
                ? sum + entry.amountPaid
                : sum
        }, 0)
    }, [discountUsage])

    const lateFeeUsers = useMemo(() => {
        const lateAmountValue = Number.parseFloat(lateAmount)
        if (!Number.isFinite(lateAmountValue)) {
            return [] as Array<{
                signupId: number
                playerName: string
                amountPaid: number
            }>
        }

        return signups
            .map((entry) => ({
                signupId: entry.signupId,
                playerName: getDisplayName(entry),
                amountPaid: Number.parseFloat(entry.amountPaid || "")
            }))
            .filter(
                (entry) =>
                    Number.isFinite(entry.amountPaid) &&
                    Math.abs(entry.amountPaid - lateAmountValue) < 0.005
            )
            .sort((a, b) => a.playerName.localeCompare(b.playerName))
    }, [signups, lateAmount])

    const totalPaidDisplay = useMemo(
        () =>
            new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD"
            }).format(totalPaid),
        [totalPaid]
    )

    const discountUsageTotalPaidDisplay = useMemo(
        () =>
            new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD"
            }).format(discountUsageTotalPaid),
        [discountUsageTotalPaid]
    )

    const lateAmountDisplay = useMemo(() => {
        const lateAmountValue = Number.parseFloat(lateAmount)
        if (!Number.isFinite(lateAmountValue)) {
            return "Not configured"
        }

        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(lateAmountValue)
    }, [lateAmount])

    const handlePlayerClick = async (entry: SignupEntry) => {
        setSelectedUserId(entry.userId)
        setSelectedEntry(entry)
        setIsLoading(true)
        setPlayerDetails(null)
        setDraftHistory([])

        const result = await getPlayerDetails(entry.userId)

        if (result.status && result.player) {
            setPlayerDetails(result.player)
            setDraftHistory(result.draftHistory)
        }

        setIsLoading(false)
    }

    const handleCloseModal = useCallback(() => {
        setSelectedUserId(null)
        setSelectedEntry(null)
        setPlayerDetails(null)
        setDraftHistory([])
    }, [])

    const handleDownloadCsv = () => {
        const csvContent = generateCsvContent(filteredSignups, playerPicUrl)

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

    const handleDeleteSignup = async () => {
        if (!signupToDelete) {
            return
        }

        setIsDeleting(true)

        const result = await deleteSignupEntry(signupToDelete.signupId)
        setDeleteResult(result)
        setIsDeleting(false)

        if (result.status) {
            if (selectedEntry?.signupId === signupToDelete.signupId) {
                handleCloseModal()
            }
            setSignupToDelete(null)
            router.refresh()
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

            {deleteResult && (
                <div
                    className={cn(
                        "rounded-md p-4 text-sm",
                        deleteResult.status
                            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                    )}
                >
                    {deleteResult.message}
                </div>
            )}

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
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Actions
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
                                <td className="px-4 py-2">
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            setDeleteResult(null)
                                            setSignupToDelete(entry)
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {filteredSignups.length === 0 && (
                            <tr>
                                <td
                                    colSpan={9}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No signups found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Accounting</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-md border bg-muted/30 p-4">
                        <p className="text-muted-foreground text-sm">
                            Total Paid This Season
                        </p>
                        <p className="font-semibold text-2xl">
                            {totalPaidDisplay}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm">
                                Discount Code Usage
                            </h3>
                            <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-xs">
                                {discountUsage.length} user
                                {discountUsage.length !== 1 && "s"}
                            </span>
                        </div>
                        <p className="text-muted-foreground text-sm">
                            Total paid by discount users:{" "}
                            {discountUsageTotalPaidDisplay}
                        </p>
                        {discountUsage.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No signups used a discount code.
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-md border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/50">
                                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                Player
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                Discount Code
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                Amount Paid
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {discountUsage.map((entry) => (
                                            <tr
                                                key={entry.signupId}
                                                className="border-b last:border-0"
                                            >
                                                <td className="px-3 py-2">
                                                    {entry.playerName}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {entry.discountCodeName}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {new Intl.NumberFormat(
                                                        "en-US",
                                                        {
                                                            style: "currency",
                                                            currency: "USD"
                                                        }
                                                    ).format(entry.amountPaid)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm">
                                Late Fee Payments
                            </h3>
                            <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-xs">
                                {lateFeeUsers.length} user
                                {lateFeeUsers.length !== 1 && "s"}
                            </span>
                        </div>
                        <p className="text-muted-foreground text-sm">
                            Late fee amount: {lateAmountDisplay}
                        </p>
                        {lateFeeUsers.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No users paid the late fee amount.
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-md border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/50">
                                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                Player
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                                                Amount Paid
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lateFeeUsers.map((entry) => (
                                            <tr
                                                key={entry.signupId}
                                                className="border-b last:border-0"
                                            >
                                                <td className="px-3 py-2">
                                                    {entry.playerName}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {new Intl.NumberFormat(
                                                        "en-US",
                                                        {
                                                            style: "currency",
                                                            currency: "USD"
                                                        }
                                                    ).format(entry.amountPaid)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

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

                                    {draftHistory.length > 0 &&
                                        (() => {
                                            const divisionBands = [
                                                {
                                                    y1: 0,
                                                    y2: 49,
                                                    label: "AA",
                                                    color: "#ef4444"
                                                },
                                                {
                                                    y1: 50,
                                                    y2: 99,
                                                    label: "A",
                                                    color: "#f97316"
                                                },
                                                {
                                                    y1: 100,
                                                    y2: 149,
                                                    label: "ABA",
                                                    color: "#eab308"
                                                },
                                                {
                                                    y1: 150,
                                                    y2: 199,
                                                    label: "ABB",
                                                    color: "#22c55e"
                                                },
                                                {
                                                    y1: 200,
                                                    y2: 249,
                                                    label: "BBB",
                                                    color: "#3b82f6"
                                                },
                                                {
                                                    y1: 250,
                                                    y2: 299,
                                                    label: "BB",
                                                    color: "#8b5cf6"
                                                }
                                            ]

                                            const maxOverall = Math.max(
                                                ...draftHistory.map(
                                                    (draft) => draft.overall
                                                )
                                            )
                                            const yMax = Math.min(
                                                Math.ceil(
                                                    (maxOverall + 10) / 50
                                                ) * 50,
                                                300
                                            )
                                            const visibleBands =
                                                divisionBands.filter(
                                                    (band) => band.y1 < yMax
                                                )

                                            return (
                                                <div>
                                                    <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                                        Draft Pick History
                                                    </h3>
                                                    <div className="h-[300px] w-full">
                                                        <ResponsiveContainer
                                                            width="100%"
                                                            height="100%"
                                                        >
                                                            <BarChart
                                                                data={draftHistory.map(
                                                                    (
                                                                        draft
                                                                    ) => ({
                                                                        ...draft,
                                                                        label: `${draft.seasonName.charAt(0).toUpperCase() + draft.seasonName.slice(1)} ${draft.seasonYear}`
                                                                    })
                                                                )}
                                                                margin={{
                                                                    top: 5,
                                                                    right: 20,
                                                                    bottom: 5,
                                                                    left: 10
                                                                }}
                                                            >
                                                                {visibleBands.map(
                                                                    (band) => (
                                                                        <ReferenceArea
                                                                            key={
                                                                                band.label
                                                                            }
                                                                            y1={
                                                                                band.y1
                                                                            }
                                                                            y2={Math.min(
                                                                                band.y2,
                                                                                yMax
                                                                            )}
                                                                            fill={
                                                                                band.color
                                                                            }
                                                                            fillOpacity={
                                                                                0.15
                                                                            }
                                                                            ifOverflow="hidden"
                                                                        />
                                                                    )
                                                                )}
                                                                <XAxis
                                                                    dataKey="label"
                                                                    tick={{
                                                                        fontSize: 12
                                                                    }}
                                                                />
                                                                <YAxis
                                                                    reversed
                                                                    domain={[
                                                                        0,
                                                                        yMax
                                                                    ]}
                                                                    ticks={visibleBands.map(
                                                                        (
                                                                            band
                                                                        ) =>
                                                                            band.y1 +
                                                                            25
                                                                    )}
                                                                    tickFormatter={(
                                                                        value: number
                                                                    ) => {
                                                                        const band =
                                                                            visibleBands.find(
                                                                                (
                                                                                    item
                                                                                ) =>
                                                                                    value >=
                                                                                        item.y1 &&
                                                                                    value <=
                                                                                        item.y2
                                                                            )

                                                                        return (
                                                                            band?.label ||
                                                                            ""
                                                                        )
                                                                    }}
                                                                    tick={{
                                                                        fontSize: 11
                                                                    }}
                                                                    width={40}
                                                                />
                                                                <Tooltip
                                                                    content={({
                                                                        active,
                                                                        payload
                                                                    }) => {
                                                                        if (
                                                                            !active ||
                                                                            !payload?.length
                                                                        ) {
                                                                            return null
                                                                        }

                                                                        const draft =
                                                                            payload[0]
                                                                                .payload

                                                                        return (
                                                                            <div className="rounded-md border bg-background p-3 text-sm shadow-md">
                                                                                <p className="font-medium">
                                                                                    {
                                                                                        draft.label
                                                                                    }
                                                                                </p>
                                                                                <p className="text-muted-foreground">
                                                                                    Division:{" "}
                                                                                    {
                                                                                        draft.divisionName
                                                                                    }
                                                                                </p>
                                                                                <p className="text-muted-foreground">
                                                                                    Team:{" "}
                                                                                    {
                                                                                        draft.teamName
                                                                                    }
                                                                                </p>
                                                                                <p className="text-muted-foreground">
                                                                                    Round:{" "}
                                                                                    {
                                                                                        draft.round
                                                                                    }
                                                                                </p>
                                                                                <p className="text-muted-foreground">
                                                                                    Overall
                                                                                    Pick:{" "}
                                                                                    {
                                                                                        draft.overall
                                                                                    }
                                                                                </p>
                                                                            </div>
                                                                        )
                                                                    }}
                                                                />
                                                                <Bar
                                                                    dataKey="overall"
                                                                    radius={[
                                                                        4, 4, 0,
                                                                        0
                                                                    ]}
                                                                >
                                                                    {draftHistory.map(
                                                                        (
                                                                            _,
                                                                            index
                                                                        ) => (
                                                                            <Cell
                                                                                key={
                                                                                    index
                                                                                }
                                                                                className="fill-primary"
                                                                            />
                                                                        )
                                                                    )}
                                                                </Bar>
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>
                                            )
                                        })()}
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

            <Dialog
                open={signupToDelete !== null}
                onOpenChange={(open) => {
                    if (!open && !isDeleting) {
                        setSignupToDelete(null)
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Signup Deletion</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-md bg-red-50 p-4 dark:bg-red-950">
                            <p className="font-medium text-red-800 text-sm dark:text-red-200">
                                Warning
                            </p>
                            <div className="mt-2 space-y-1 text-red-700 text-sm dark:text-red-300">
                                <p>
                                    This will make it as if this player never
                                    signed up.
                                </p>
                                <p>
                                    This will not refund their payment. Refunds
                                    must be done manually and separately.
                                </p>
                                <p>This action cannot be reversed.</p>
                            </div>
                        </div>

                        {signupToDelete && (
                            <div className="rounded-md border p-3 text-sm">
                                <p>
                                    <span className="font-medium">Player:</span>{" "}
                                    {getDisplayName(signupToDelete)}
                                </p>
                                <p>
                                    <span className="font-medium">Email:</span>{" "}
                                    {signupToDelete.email}
                                </p>
                                <p>
                                    <span className="font-medium">
                                        Signup ID:
                                    </span>{" "}
                                    {signupToDelete.signupId}
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setSignupToDelete(null)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteSignup}
                            disabled={isDeleting}
                        >
                            {isDeleting ? "Deleting..." : "Confirm Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
