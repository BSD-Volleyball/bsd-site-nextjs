"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createDiscount } from "../manage-discounts/actions"
import { deleteSignupEntry, type SignupEntry } from "./actions"
import { getDisplayName } from "./signup-display-name"

interface DeleteResult {
    status: boolean
    message: string
}

interface SignupDeleteDialogProps {
    signupToDelete: SignupEntry | null
    setSignupToDelete: (entry: SignupEntry | null) => void
    deleteResult: DeleteResult | null
    setDeleteResult: (result: DeleteResult | null) => void
    seasonLabel: string
    onDeleted: (deleted: SignupEntry) => void
}

export function SignupDeleteDialog({
    signupToDelete,
    setSignupToDelete,
    deleteResult,
    setDeleteResult,
    seasonLabel,
    onDeleted
}: SignupDeleteDialogProps) {
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteReason, setDeleteReason] = useState("")
    const [postDeleteUser, setPostDeleteUser] = useState<{
        userId: string
        name: string
    } | null>(null)
    const [discountPercentage, setDiscountPercentage] = useState("100")
    const [discountExpiration, setDiscountExpiration] = useState("")
    const [discountReason, setDiscountReason] = useState("")
    const [isCreatingDiscount, setIsCreatingDiscount] = useState(false)
    const [discountCreateResult, setDiscountCreateResult] =
        useState<DeleteResult | null>(null)

    const handleDeleteSignup = async () => {
        if (!signupToDelete) {
            return
        }

        setIsDeleting(true)

        const result = await deleteSignupEntry(
            signupToDelete.signupId,
            deleteReason
        )
        setDeleteResult({
            status: result.status,
            message: result.message ?? ""
        })
        setIsDeleting(false)

        if (result.status) {
            const expirationDate = new Date()
            expirationDate.setMonth(expirationDate.getMonth() + 13)
            const expirationStr = expirationDate.toISOString().split("T")[0]

            setDiscountPercentage("100")
            setDiscountExpiration(expirationStr)
            setDiscountReason(`Credit from Season ${seasonLabel}`)
            setDiscountCreateResult(null)
            setPostDeleteUser({
                userId: signupToDelete.userId,
                name: getDisplayName(signupToDelete)
            })
            setDeleteReason("")
            onDeleted(signupToDelete)
            setSignupToDelete(null)
        }
    }

    const handleCreateDiscount = async () => {
        if (!postDeleteUser) return
        setIsCreatingDiscount(true)
        const result = await createDiscount({
            userId: postDeleteUser.userId,
            percentage: discountPercentage,
            expiration: discountExpiration || null,
            reason: discountReason || null,
            scope: "season"
        })
        setDiscountCreateResult({
            status: result.status,
            message: result.message ?? ""
        })
        setIsCreatingDiscount(false)
        if (result.status) {
            setPostDeleteUser(null)
        }
    }

    const handleSkipDiscount = () => {
        setPostDeleteUser(null)
    }

    return (
        <Dialog
            open={signupToDelete !== null || postDeleteUser !== null}
            onOpenChange={(open) => {
                if (!open && !isDeleting && !isCreatingDiscount) {
                    setSignupToDelete(null)
                    setPostDeleteUser(null)
                    setDeleteReason("")
                }
            }}
        >
            <DialogContent>
                {signupToDelete && (
                    <>
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
                                        This will make it as if this player
                                        never signed up.
                                    </p>
                                    <p>
                                        This will not refund their payment.
                                        Refunds must be done manually and
                                        separately.
                                    </p>
                                    <p>This action cannot be reversed.</p>
                                </div>
                            </div>

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

                            <div className="space-y-1.5">
                                <Label htmlFor="delete-reason">
                                    Reason for deletion{" "}
                                    <span className="text-red-600">*</span>
                                </Label>
                                <Textarea
                                    id="delete-reason"
                                    value={deleteReason}
                                    onChange={(e) =>
                                        setDeleteReason(e.target.value)
                                    }
                                    placeholder="e.g. Player withdrew from the season"
                                    rows={2}
                                    disabled={isDeleting}
                                />
                            </div>

                            {deleteResult && !deleteResult.status && (
                                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                                    {deleteResult.message}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSignupToDelete(null)
                                    setDeleteReason("")
                                    setDeleteResult(null)
                                }}
                                disabled={isDeleting}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleDeleteSignup}
                                disabled={isDeleting || !deleteReason.trim()}
                            >
                                {isDeleting ? "Deleting..." : "Confirm Delete"}
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {postDeleteUser && (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                Create Discount for {postDeleteUser.name}?
                            </DialogTitle>
                            <DialogDescription>
                                The signup was deleted. Would you like to issue
                                a discount credit for this player?
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            {discountCreateResult &&
                                !discountCreateResult.status && (
                                    <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                                        {discountCreateResult.message}
                                    </div>
                                )}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label>Discount %</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={discountPercentage}
                                        onChange={(e) =>
                                            setDiscountPercentage(
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Expiration</Label>
                                    <Input
                                        type="date"
                                        value={discountExpiration}
                                        onChange={(e) =>
                                            setDiscountExpiration(
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label>Reason</Label>
                                    <Input
                                        value={discountReason}
                                        onChange={(e) =>
                                            setDiscountReason(e.target.value)
                                        }
                                        placeholder="e.g. Credit from Season Fall 2025"
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={handleSkipDiscount}
                                disabled={isCreatingDiscount}
                            >
                                Continue without discount
                            </Button>
                            <Button
                                onClick={handleCreateDiscount}
                                disabled={isCreatingDiscount}
                            >
                                {isCreatingDiscount
                                    ? "Creating..."
                                    : "Create Discount"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
