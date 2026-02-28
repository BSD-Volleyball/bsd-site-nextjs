"use client"

import { useState, useMemo } from "react"
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
import { RiDownloadLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup,
    formatHeight
} from "@/components/player-detail"
import { deleteSignupEntry, type SignupEntry } from "./actions"

interface SignupsListProps {
    signups: SignupEntry[]
    playerPicUrl: string
    seasonLabel: string
    lateAmount: string
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
        "Captain In",
        "Drafted In",
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
        "Last Season",
        "Last Division",
        "Last Captain",
        "Last Overall"
    ]

    const rows = signups.map((entry) => [
        entry.oldId !== 0 ? String(entry.oldId) : "",
        entry.firstName,
        entry.lastName,
        entry.preferredName || "",
        entry.email,
        entry.phone || "",
        entry.pairPickName || "",
        entry.pairReason || "",
        entry.male === true ? "M" : entry.male === false ? "NM" : "",
        entry.age || "",
        entry.captain === "yes"
            ? "Yes"
            : entry.captain === "only_if_needed"
              ? "If needed"
              : entry.captain === "no"
                ? "No"
                : "",
        entry.captainIn || "",
        entry.draftedIn || "",
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
    const [selectedEntry, setSelectedEntry] = useState<SignupEntry | null>(null)
    const [signupToDelete, setSignupToDelete] = useState<SignupEntry | null>(
        null
    )
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteResult, setDeleteResult] = useState<{
        status: boolean
        message: string
    } | null>(null)

    const modal = usePlayerDetailModal()

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

    const handlePlayerClick = (entry: SignupEntry) => {
        setSelectedEntry(entry)
        modal.openPlayerDetail(entry.userId)
    }

    const handleCloseModal = () => {
        setSelectedEntry(null)
        modal.closePlayerDetail()
    }

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
                                    {entry.pairPickName || "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.male === true
                                        ? "M"
                                        : entry.male === false
                                          ? "F"
                                          : "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.age || "\u2014"}
                                </td>
                                <td className="px-4 py-2 capitalize">
                                    {entry.captain === "yes"
                                        ? "Yes"
                                        : entry.captain === "only_if_needed"
                                          ? "If needed"
                                          : entry.captain === "no"
                                            ? "No"
                                            : "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.amountPaid
                                        ? `$${entry.amountPaid}`
                                        : "\u2014"}
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

            <AdminPlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={handleCloseModal}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                signupHistory={modal.signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={selectedEntry?.pairPickName}
                pairReason={selectedEntry?.pairReason}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
            />

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
