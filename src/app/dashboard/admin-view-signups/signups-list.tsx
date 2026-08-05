"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RiDownloadLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { buildTimestampedCsvFilename, downloadCsv } from "@/lib/csv-download"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import {
    logAdminCsvDownload,
    type SignupEntry,
    type DeletedSignupEntry
} from "./actions"
import { AccountingCard } from "./accounting-card"
import { DeletedSignupsCard } from "./deleted-signups-card"
import { SignupDeleteDialog } from "./signup-delete-dialog"
import { UndraftedSignupsTable, DraftedSignupsTable } from "./signup-tables"
import { generateCsvContent } from "./signups-csv"

interface SignupsListProps {
    signups: SignupEntry[]
    deletedSignups: DeletedSignupEntry[]
    playerPicUrl: string
    seasonLabel: string
    lateAmount: string
}

export function SignupsList({
    signups,
    deletedSignups,
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

    const draftedCount = useMemo(
        () => signups.filter((s) => !!s.draftedIn).length,
        [signups]
    )

    const undraftedSignups = useMemo(
        () => filteredSignups.filter((s) => !s.draftedIn),
        [filteredSignups]
    )

    const draftedSignups = useMemo(
        () => filteredSignups.filter((s) => !!s.draftedIn),
        [filteredSignups]
    )

    const maleCount = useMemo(
        () => signups.filter((s) => s.male === true).length,
        [signups]
    )

    const nonMaleCount = useMemo(
        () => signups.filter((s) => s.male !== true).length,
        [signups]
    )

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

        downloadCsv(
            csvContent,
            buildTimestampedCsvFilename("signups", seasonLabel)
        )

        logAdminCsvDownload()
    }

    const handleDeleteClick = (entry: SignupEntry) => {
        setDeleteResult(null)
        setSignupToDelete(entry)
    }

    const handleDeleted = (deleted: SignupEntry) => {
        if (selectedEntry?.signupId === deleted.signupId) {
            handleCloseModal()
        }
        router.refresh()
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
                    {draftedCount > 0 && (
                        <span className="rounded-md bg-amber-100 px-3 py-1.5 font-medium text-amber-700 text-sm dark:bg-amber-900 dark:text-amber-300">
                            {draftedCount} drafted
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

            <div className="space-y-6">
                <UndraftedSignupsTable
                    entries={undraftedSignups}
                    signupNumberById={signupNumberById}
                    onPlayerClick={handlePlayerClick}
                    onDeleteClick={handleDeleteClick}
                />

                <DraftedSignupsTable
                    entries={draftedSignups}
                    signupNumberById={signupNumberById}
                    onPlayerClick={handlePlayerClick}
                    onDeleteClick={handleDeleteClick}
                />
            </div>

            <AccountingCard signups={signups} lateAmount={lateAmount} />

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
                emailSuppressions={modal.emailSuppressions}
                viewerRating={modal.viewerRating}
            />

            <SignupDeleteDialog
                signupToDelete={signupToDelete}
                setSignupToDelete={setSignupToDelete}
                deleteResult={deleteResult}
                setDeleteResult={setDeleteResult}
                seasonLabel={seasonLabel}
                onDeleted={handleDeleted}
            />

            <DeletedSignupsCard deletedSignups={deletedSignups} />
        </div>
    )
}
