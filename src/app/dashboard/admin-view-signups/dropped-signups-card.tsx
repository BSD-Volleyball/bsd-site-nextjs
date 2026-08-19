"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
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
import { formatFullTimestamp } from "@/lib/date-utils"
import { dropCategoryLabel, dropStageLabel } from "@/lib/signup-drops-display"
import { formatPlayerName } from "@/lib/utils"
import { restoreDrop, type SignupDropEntry } from "./actions"

interface DroppedSignupsCardProps {
    drops: SignupDropEntry[]
}

export function DroppedSignupsCard({ drops }: DroppedSignupsCardProps) {
    const router = useRouter()
    const [dropToRestore, setDropToRestore] = useState<SignupDropEntry | null>(
        null
    )
    const [isRestoring, setIsRestoring] = useState(false)
    const [restoreResult, setRestoreResult] = useState<{
        status: boolean
        message: string
    } | null>(null)

    if (drops.length === 0) {
        return null
    }

    const handleRestore = async () => {
        if (!dropToRestore) return
        setIsRestoring(true)
        const result = await restoreDrop(dropToRestore.dropId)
        setRestoreResult({
            status: result.status,
            message: result.message ?? ""
        })
        setIsRestoring(false)
        if (result.status) {
            setDropToRestore(null)
            router.refresh()
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base text-muted-foreground">
                    Dropped Players ({drops.length})
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {restoreResult && (
                    <div
                        className={`mx-4 mb-3 rounded-md p-3 text-sm ${
                            restoreResult.status
                                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                        }`}
                    >
                        {restoreResult.message}
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-muted-foreground text-sm">
                                <th className="px-4 py-2 font-medium">
                                    Player
                                </th>
                                <th className="px-4 py-2 font-medium">Email</th>
                                <th className="px-4 py-2 font-medium">Stage</th>
                                <th className="px-4 py-2 font-medium">
                                    Reason
                                </th>
                                <th className="px-4 py-2 font-medium">
                                    Dropped At
                                </th>
                                <th className="px-4 py-2 font-medium">
                                    Dropped By
                                </th>
                                <th className="px-4 py-2 font-medium" />
                            </tr>
                        </thead>
                        <tbody>
                            {drops.map((entry) => {
                                const displayName = formatPlayerName(
                                    entry.firstName,
                                    entry.lastName,
                                    entry.preferredName
                                )
                                const restored = entry.restoredAt !== null
                                return (
                                    <tr
                                        key={entry.dropId}
                                        className={`border-b last:border-0 ${restored ? "opacity-60" : ""}`}
                                    >
                                        <td className="px-4 py-2 font-medium">
                                            {displayName}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {entry.email}
                                        </td>
                                        <td className="px-4 py-2">
                                            <Badge variant="outline">
                                                {dropStageLabel(entry.stage)}
                                            </Badge>
                                            {entry.stage === "post_draft" &&
                                                entry.teamName && (
                                                    <span className="ml-2 text-muted-foreground text-xs">
                                                        {entry.teamName}
                                                        {entry.divisionName
                                                            ? ` (${entry.divisionName})`
                                                            : ""}
                                                    </span>
                                                )}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            <span className="font-medium text-foreground">
                                                {dropCategoryLabel(
                                                    entry.reasonCategory
                                                )}
                                            </span>
                                            {entry.reasonNote
                                                ? ` — ${entry.reasonNote}`
                                                : ""}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {formatFullTimestamp(
                                                entry.droppedAt
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {entry.droppedByName}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {restored ? (
                                                <span className="text-muted-foreground text-xs">
                                                    Restored{" "}
                                                    {formatFullTimestamp(
                                                        entry.restoredAt as Date
                                                    )}
                                                </span>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        setDropToRestore(entry)
                                                    }
                                                >
                                                    Restore
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>

            <Dialog
                open={dropToRestore !== null}
                onOpenChange={(open) => {
                    if (!open && !isRestoring) {
                        setDropToRestore(null)
                    }
                }}
            >
                <DialogContent>
                    {dropToRestore && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Restore Drop</DialogTitle>
                                <DialogDescription>
                                    {dropToRestore.stage === "pre_draft"
                                        ? "This re-creates the player's signup (same signup ID) along with their availability, discount link, and draft homework."
                                        : "This clears the Dropped status. The player's signup and roster slot were never removed."}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="rounded-md border p-3 text-sm">
                                <p>
                                    <span className="font-medium">Player:</span>{" "}
                                    {formatPlayerName(
                                        dropToRestore.firstName,
                                        dropToRestore.lastName,
                                        dropToRestore.preferredName
                                    )}
                                </p>
                                <p>
                                    <span className="font-medium">
                                        Dropped:
                                    </span>{" "}
                                    {formatFullTimestamp(
                                        dropToRestore.droppedAt
                                    )}{" "}
                                    (
                                    {dropCategoryLabel(
                                        dropToRestore.reasonCategory
                                    )}
                                    )
                                </p>
                            </div>

                            {restoreResult && !restoreResult.status && (
                                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                                    {restoreResult.message}
                                </div>
                            )}

                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setDropToRestore(null)}
                                    disabled={isRestoring}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleRestore}
                                    disabled={isRestoring}
                                >
                                    {isRestoring
                                        ? "Restoring..."
                                        : "Confirm Restore"}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    )
}
