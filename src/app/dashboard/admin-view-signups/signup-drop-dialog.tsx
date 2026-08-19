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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
    DROP_CATEGORY_LABELS,
    SIGNUP_DROP_CATEGORIES,
    type SignupDropCategory
} from "@/lib/signup-drops-display"
import { createDiscount } from "../manage-discounts/actions"
import { dropSignup, type SignupEntry } from "./actions"
import { getDisplayName } from "./signup-display-name"

interface DropResult {
    status: boolean
    message: string
}

interface SignupDropDialogProps {
    signupToDrop: SignupEntry | null
    setSignupToDrop: (entry: SignupEntry | null) => void
    dropResult: DropResult | null
    setDropResult: (result: DropResult | null) => void
    seasonLabel: string
    onDropped: (dropped: SignupEntry) => void
}

export function SignupDropDialog({
    signupToDrop,
    setSignupToDrop,
    dropResult,
    setDropResult,
    seasonLabel,
    onDropped
}: SignupDropDialogProps) {
    const [isDropping, setIsDropping] = useState(false)
    const [dropCategory, setDropCategory] = useState<SignupDropCategory | "">(
        ""
    )
    const [dropNote, setDropNote] = useState("")
    const [postDropUser, setPostDropUser] = useState<{
        userId: string
        name: string
    } | null>(null)
    const [discountPercentage, setDiscountPercentage] = useState("100")
    const [discountExpiration, setDiscountExpiration] = useState("")
    const [discountReason, setDiscountReason] = useState("")
    const [isCreatingDiscount, setIsCreatingDiscount] = useState(false)
    const [discountCreateResult, setDiscountCreateResult] =
        useState<DropResult | null>(null)

    const isDrafted = Boolean(signupToDrop?.draftedIn)

    const handleDropSignup = async () => {
        if (!signupToDrop || !dropCategory) {
            return
        }

        setIsDropping(true)

        const result = await dropSignup(
            signupToDrop.signupId,
            dropCategory,
            dropNote
        )
        setDropResult({
            status: result.status,
            message: result.message ?? ""
        })
        setIsDropping(false)

        if (result.status) {
            const expirationDate = new Date()
            expirationDate.setMonth(expirationDate.getMonth() + 13)
            const expirationStr = expirationDate.toISOString().split("T")[0]

            setDiscountPercentage("100")
            setDiscountExpiration(expirationStr)
            setDiscountReason(`Credit from Season ${seasonLabel}`)
            setDiscountCreateResult(null)
            setPostDropUser({
                userId: signupToDrop.userId,
                name: getDisplayName(signupToDrop)
            })
            setDropCategory("")
            setDropNote("")
            onDropped(signupToDrop)
            setSignupToDrop(null)
        }
    }

    const handleCreateDiscount = async () => {
        if (!postDropUser) return
        setIsCreatingDiscount(true)
        const result = await createDiscount({
            userId: postDropUser.userId,
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
            setPostDropUser(null)
        }
    }

    const handleSkipDiscount = () => {
        setPostDropUser(null)
    }

    return (
        <Dialog
            open={signupToDrop !== null || postDropUser !== null}
            onOpenChange={(open) => {
                if (!open && !isDropping && !isCreatingDiscount) {
                    setSignupToDrop(null)
                    setPostDropUser(null)
                    setDropCategory("")
                    setDropNote("")
                }
            }}
        >
            <DialogContent>
                {signupToDrop && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Confirm Player Drop</DialogTitle>
                            <DialogDescription>
                                The drop is recorded with its reason and can be
                                restored later.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="rounded-md bg-red-50 p-4 dark:bg-red-950">
                                <p className="font-medium text-red-800 text-sm dark:text-red-200">
                                    Warning
                                </p>
                                <div className="mt-2 space-y-1 text-red-700 text-sm dark:text-red-300">
                                    {isDrafted ? (
                                        <p>
                                            This player is drafted, so their
                                            signup and roster slot are kept. A
                                            "Dropped" badge shows until a
                                            permanent sub is locked in.
                                        </p>
                                    ) : (
                                        <p>
                                            This removes the player&apos;s
                                            signup for the season. It can be
                                            restored from the Dropped Players
                                            list below.
                                        </p>
                                    )}
                                    <p>
                                        This will not refund their payment.
                                        Refunds must be done manually and
                                        separately.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-md border p-3 text-sm">
                                <p>
                                    <span className="font-medium">Player:</span>{" "}
                                    {getDisplayName(signupToDrop)}
                                </p>
                                <p>
                                    <span className="font-medium">Email:</span>{" "}
                                    {signupToDrop.email}
                                </p>
                                <p>
                                    <span className="font-medium">
                                        Signup ID:
                                    </span>{" "}
                                    {signupToDrop.signupId}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="drop-category">
                                    Reason{" "}
                                    <span className="text-red-600">*</span>
                                </Label>
                                <Select
                                    value={dropCategory}
                                    onValueChange={(value) =>
                                        setDropCategory(
                                            value as SignupDropCategory
                                        )
                                    }
                                    disabled={isDropping}
                                >
                                    <SelectTrigger id="drop-category">
                                        <SelectValue placeholder="Select a reason" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SIGNUP_DROP_CATEGORIES.map(
                                            (category) => (
                                                <SelectItem
                                                    key={category}
                                                    value={category}
                                                >
                                                    {
                                                        DROP_CATEGORY_LABELS[
                                                            category
                                                        ]
                                                    }
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="drop-note">
                                    Note (optional)
                                </Label>
                                <Textarea
                                    id="drop-note"
                                    value={dropNote}
                                    onChange={(e) =>
                                        setDropNote(e.target.value)
                                    }
                                    placeholder="e.g. Emailed 8/12, out with a knee injury"
                                    rows={2}
                                    disabled={isDropping}
                                />
                            </div>

                            {dropResult && !dropResult.status && (
                                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                                    {dropResult.message}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSignupToDrop(null)
                                    setDropCategory("")
                                    setDropNote("")
                                    setDropResult(null)
                                }}
                                disabled={isDropping}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleDropSignup}
                                disabled={isDropping || !dropCategory}
                            >
                                {isDropping ? "Dropping..." : "Confirm Drop"}
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {postDropUser && (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                Create Discount for {postDropUser.name}?
                            </DialogTitle>
                            <DialogDescription>
                                The player was dropped. Would you like to issue
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
