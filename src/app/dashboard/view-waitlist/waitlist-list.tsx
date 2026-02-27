"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import { setWaitlistApproval, type WaitlistEntry } from "./actions"
import { useRouter } from "next/navigation"

interface WaitlistListProps {
    entries: WaitlistEntry[]
    playerPicUrl: string
}

function getDisplayName(entry: WaitlistEntry): string {
    const preferred = entry.preferredName ? ` (${entry.preferredName})` : ""
    return `${entry.firstName}${preferred} ${entry.lastName}`
}

export function WaitlistList({ entries, playerPicUrl }: WaitlistListProps) {
    const router = useRouter()
    const [search, setSearch] = useState("")
    const [approvalLoadingId, setApprovalLoadingId] = useState<number | null>(
        null
    )

    const modal = usePlayerDetailModal()

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

    const handleToggleApproval = async (entry: WaitlistEntry) => {
        setApprovalLoadingId(entry.waitlistId)
        await setWaitlistApproval(entry.waitlistId, !entry.approved)
        setApprovalLoadingId(null)
        router.refresh()
    }

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
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Approval
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEntries.map((entry, idx) => (
                            <tr
                                key={entry.waitlistId}
                                className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50"
                                onClick={() =>
                                    modal.openPlayerDetail(entry.userId)
                                }
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
                                          : "\u2014"}
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
                                <td className="px-4 py-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            void handleToggleApproval(entry)
                                        }}
                                        disabled={
                                            approvalLoadingId ===
                                            entry.waitlistId
                                        }
                                        className={
                                            entry.approved
                                                ? "bg-red-600 text-white hover:bg-red-700"
                                                : "bg-green-600 text-white hover:bg-green-700"
                                        }
                                    >
                                        {approvalLoadingId === entry.waitlistId
                                            ? "Saving..."
                                            : entry.approved
                                              ? "Unapprove"
                                              : "Approve"}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {filteredEntries.length === 0 && (
                            <tr>
                                <td
                                    colSpan={7}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No waitlist entries found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <AdminPlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                signupHistory={modal.signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
            />
        </div>
    )
}
