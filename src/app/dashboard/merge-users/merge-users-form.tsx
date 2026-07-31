"use client"

import { useState } from "react"
import type { UserOption } from "./actions"
import { mergeUsers } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { UserEmailCombobox } from "@/components/user-combobox"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"

export function MergeUsersForm({
    oldUsers,
    newUsers
}: {
    oldUsers: UserOption[]
    newUsers: UserOption[]
}) {
    const [oldUserId, setOldUserId] = useState<string>("")
    const [newUserId, setNewUserId] = useState<string>("")
    const [showConfirm, setShowConfirm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [result, setResult] = useState<{
        status: boolean
        message: string
    } | null>(null)

    const oldUser = oldUsers.find((u) => u.id === oldUserId)
    const newUser = newUsers.find((u) => u.id === newUserId)

    const handleMergeClick = () => {
        if (!oldUserId || !newUserId) {
            return
        }
        setShowConfirm(true)
    }

    const handleConfirm = async () => {
        setIsSubmitting(true)
        setResult(null)

        const response = await mergeUsers(oldUserId, newUserId)
        setResult({
            status: response.status,
            message: response.message ?? ""
        })
        setIsSubmitting(false)
        setShowConfirm(false)

        if (response.status) {
            setOldUserId("")
            setNewUserId("")
        }
    }

    return (
        <>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Select Users to Merge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <label className="font-medium text-sm">
                            Old User (will be deleted)
                        </label>
                        <UserEmailCombobox
                            users={oldUsers}
                            value={oldUserId}
                            onChange={setOldUserId}
                            placeholder="Select old user..."
                        />
                        <p className="text-muted-foreground text-xs">
                            All records are transferred off this account, then
                            it is deleted.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="font-medium text-sm">
                            New User (will be kept)
                        </label>
                        <UserEmailCombobox
                            users={newUsers}
                            value={newUserId}
                            onChange={setNewUserId}
                            placeholder="Select new user..."
                        />
                        <p className="text-muted-foreground text-xs">
                            This account survives the merge and inherits the old
                            account&apos;s records.
                        </p>
                    </div>

                    <Button
                        onClick={handleMergeClick}
                        disabled={!oldUserId || !newUserId}
                    >
                        Merge Users
                    </Button>

                    {result && (
                        <div
                            className={`rounded-md p-4 ${
                                result.status
                                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                            }`}
                        >
                            {result.message}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm User Merge</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. Please confirm you
                            want to merge these users.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-md bg-red-50 p-4 dark:bg-red-950">
                            <p className="font-medium text-red-800 text-sm dark:text-red-200">
                                Old User (will be DELETED)
                            </p>
                            {oldUser && (
                                <div className="mt-2 text-red-700 text-sm dark:text-red-300">
                                    <p>Name: {oldUser.name}</p>
                                    <p>Email: {oldUser.email}</p>
                                </div>
                            )}
                        </div>

                        <div className="rounded-md bg-green-50 p-4 dark:bg-green-950">
                            <p className="font-medium text-green-800 text-sm dark:text-green-200">
                                New User (will be KEPT)
                            </p>
                            {newUser && (
                                <div className="mt-2 text-green-700 text-sm dark:text-green-300">
                                    <p>Name: {newUser.name}</p>
                                    <p>Email: {newUser.email}</p>
                                </div>
                            )}
                        </div>

                        <p className="text-muted-foreground text-sm">
                            All records from the old user will be transferred to
                            the new user, including signups, team captaincy,
                            draft picks, waitlist entries, discounts,
                            evaluations, and commissioner roles.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowConfirm(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirm}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Merging..." : "Confirm Merge"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
