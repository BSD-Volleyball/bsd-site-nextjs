"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import {
    usePlayerDetailModal,
    AdminPlayerDetailPopup
} from "@/components/player-detail"
import { UserCombobox } from "@/components/user-combobox"
import {
    assignPairPartner,
    bustMatchedPair,
    bustUnmatchedPair,
    completeUnmatchedPair,
    type MatchedPair,
    type PairCandidate,
    type PairUser,
    type UnmatchedPair
} from "./actions"

interface PairsListProps {
    matched: MatchedPair[]
    unmatched: UnmatchedPair[]
    incomplete: PairUser[]
    candidates: PairCandidate[]
    playerPicUrl: string
}

interface SelectedPairContext {
    pairPickName: string | null
    pairReason: string | null
}

interface PairConfirmDialogState {
    title: string
    description: string
    confirmLabel: string
    confirmVariant: "default" | "destructive"
    details: {
        leftLabel: string
        leftName: string
        leftEmail: string
        rightLabel: string
        rightName: string
        rightEmail: string
    }
    onConfirm: () => void
}

function PairRequiredBadge() {
    return (
        <span className="ml-1.5 inline-block rounded bg-red-600 px-1.5 py-0.5 align-middle font-semibold text-white text-xs dark:bg-red-700">
            14–15
        </span>
    )
}

export function PairsList({
    matched,
    unmatched,
    incomplete,
    candidates,
    playerPicUrl
}: PairsListProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [actionMessage, setActionMessage] = useState<string | null>(null)
    const [actionError, setActionError] = useState(false)
    const [selectedContext, setSelectedContext] =
        useState<SelectedPairContext | null>(null)
    const [confirmDialog, setConfirmDialog] =
        useState<PairConfirmDialogState | null>(null)
    const [assignSelections, setAssignSelections] = useState<
        Record<string, string | null>
    >({})

    const modal = usePlayerDetailModal()

    const handlePlayerClick = (
        userId: string,
        context: SelectedPairContext
    ) => {
        setSelectedContext(context)
        modal.openPlayerDetail(userId)
    }

    const handleCloseModal = () => {
        setSelectedContext(null)
        modal.closePlayerDetail()
    }

    const runAction = (
        action: () => Promise<{ status: boolean; message?: string }>
    ) => {
        startTransition(async () => {
            const result = await action()
            setActionMessage(result.message ?? "")
            setActionError(!result.status)
            if (result.status) {
                router.refresh()
            }
        })
    }

    const handleBustMatched = (pair: MatchedPair) => {
        setConfirmDialog({
            title: "Confirm Bust Pair",
            description:
                "This action will split this matched pair and remove both pair picks.",
            confirmLabel: "Bust Pair",
            confirmVariant: "destructive",
            details: {
                leftLabel: "Player A",
                leftName: pair.userA.name,
                leftEmail: pair.userA.email,
                rightLabel: "Player B",
                rightName: pair.userB.name,
                rightEmail: pair.userB.email
            },
            onConfirm: () =>
                runAction(() =>
                    bustMatchedPair(pair.userA.userId, pair.userB.userId)
                )
        })
    }

    const handleBustUnmatched = (pair: UnmatchedPair) => {
        setConfirmDialog({
            title: "Confirm Bust Pair",
            description:
                "This action will remove only the requester's pair request.",
            confirmLabel: "Bust Pair",
            confirmVariant: "destructive",
            details: {
                leftLabel: "Requester (will be updated)",
                leftName: pair.requester.name,
                leftEmail: pair.requester.email,
                rightLabel: "Requested (no changes)",
                rightName: pair.requested.name,
                rightEmail: pair.requested.email
            },
            onConfirm: () =>
                runAction(() => bustUnmatchedPair(pair.requester.userId))
        })
    }

    const handleCompletePair = (pair: UnmatchedPair) => {
        setConfirmDialog({
            title: "Confirm Complete Pair",
            description:
                "This action will set the requested player to pair back to the requester.",
            confirmLabel: "Complete Pair",
            confirmVariant: "default",
            details: {
                leftLabel: "Requester (already points to requested)",
                leftName: pair.requester.name,
                leftEmail: pair.requester.email,
                rightLabel: "Requested (will be updated)",
                rightName: pair.requested.name,
                rightEmail: pair.requested.email
            },
            onConfirm: () =>
                runAction(() =>
                    completeUnmatchedPair(
                        pair.requester.userId,
                        pair.requested.userId
                    )
                )
        })
    }

    const handleBustIncomplete = (requester: PairUser) => {
        setConfirmDialog({
            title: "Confirm Bust Pair",
            description:
                "This action will remove the requester's pair request.",
            confirmLabel: "Bust Pair",
            confirmVariant: "destructive",
            details: {
                leftLabel: "Requester (will be updated)",
                leftName: requester.name,
                leftEmail: requester.email,
                rightLabel: "Requested",
                rightName: "No partner selected",
                rightEmail: "—"
            },
            onConfirm: () =>
                runAction(() => bustUnmatchedPair(requester.userId))
        })
    }

    const handleAssignPair = (requester: PairUser, partner: PairCandidate) => {
        setConfirmDialog({
            title: "Confirm Assign Pair",
            description: "This action will pair both players with each other.",
            confirmLabel: "Assign Pair",
            confirmVariant: "default",
            details: {
                leftLabel: "Requester (will be updated)",
                leftName: requester.name,
                leftEmail: requester.email,
                rightLabel: "Partner (will be updated)",
                rightName: partner.name,
                rightEmail: partner.email
            },
            onConfirm: () =>
                runAction(() =>
                    assignPairPartner(requester.userId, partner.userId)
                )
        })
    }

    const handleConfirmAction = () => {
        if (!confirmDialog) {
            return
        }

        confirmDialog.onConfirm()
        setConfirmDialog(null)
    }

    const renderPlayerCell = (
        userId: string,
        name: string,
        email: string,
        context: SelectedPairContext,
        pairRequired = false,
        highlight = false
    ) => {
        const content = (
            <button
                type="button"
                className="text-left hover:underline"
                onClick={() => handlePlayerClick(userId, context)}
            >
                <div
                    className={
                        pairRequired
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "font-medium"
                    }
                >
                    {name}
                    {pairRequired && <PairRequiredBadge />}
                </div>
                <div className="text-muted-foreground text-sm">{email}</div>
            </button>
        )

        if (!highlight) {
            return content
        }

        return (
            <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-300">
                {content}
            </span>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3 text-sm">
                <span className="font-medium">Legend:</span>
                <div className="flex items-center gap-2">
                    <PairRequiredBadge />
                    <span className="text-muted-foreground">
                        Aged 14–15 — must be paired with a registered
                        parent/guardian.
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-block h-4 w-8 rounded bg-red-100 dark:bg-red-900" />
                    <span className="text-muted-foreground">
                        Requested player has not requested the pair back.
                    </span>
                </div>
            </div>

            {actionMessage && (
                <div
                    className={
                        actionError
                            ? "rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200"
                            : "rounded-md bg-green-50 p-3 text-green-800 text-sm dark:bg-green-950 dark:text-green-200"
                    }
                >
                    {actionMessage}
                </div>
            )}

            {/* Matched Pairs */}
            <div>
                <div className="mb-3 flex items-center gap-2">
                    <h2 className="font-semibold text-lg">Matched Pairs</h2>
                    <span className="rounded-md bg-green-100 px-2.5 py-1 font-medium text-green-700 text-sm dark:bg-green-900 dark:text-green-300">
                        {matched.length}
                    </span>
                </div>

                {matched.length === 0 ? (
                    <div className="rounded-lg border px-4 py-6 text-center text-muted-foreground">
                        No matched pairs found.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Player A
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Reason
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Player B
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Reason
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {matched.map((pair) => (
                                    <tr
                                        key={`matched-${pair.userA.userId}-${pair.userB.userId}`}
                                        className="border-b last:border-0"
                                    >
                                        <td className="px-4 py-2">
                                            {renderPlayerCell(
                                                pair.userA.userId,
                                                pair.userA.name,
                                                pair.userA.email,
                                                {
                                                    pairPickName:
                                                        pair.userB.name,
                                                    pairReason:
                                                        pair.userA.pairReason
                                                },
                                                pair.userA.pairRequired
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            {pair.userA.pairReason || "—"}
                                        </td>
                                        <td className="px-4 py-2">
                                            {renderPlayerCell(
                                                pair.userB.userId,
                                                pair.userB.name,
                                                pair.userB.email,
                                                {
                                                    pairPickName:
                                                        pair.userA.name,
                                                    pairReason:
                                                        pair.userB.pairReason
                                                },
                                                pair.userB.pairRequired
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            {pair.userB.pairReason || "—"}
                                        </td>
                                        <td className="px-4 py-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                disabled={isPending}
                                                onClick={() =>
                                                    handleBustMatched(pair)
                                                }
                                            >
                                                Bust Pair
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Unmatched Pairs */}
            <div>
                <div className="mb-3 flex items-center gap-2">
                    <h2 className="font-semibold text-lg">Unmatched Pairs</h2>
                    <span className="rounded-md bg-red-100 px-2.5 py-1 font-medium text-red-700 text-sm dark:bg-red-900 dark:text-red-300">
                        {unmatched.length + incomplete.length}
                    </span>
                </div>

                {unmatched.length === 0 && incomplete.length === 0 ? (
                    <div className="rounded-lg border px-4 py-6 text-center text-muted-foreground">
                        No unmatched pairs found.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Requester
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Reason
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Requested
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {unmatched.map((pair) => (
                                    <tr
                                        key={`unmatched-${pair.requester.userId}-${pair.requested.userId}`}
                                        className="border-b last:border-0"
                                    >
                                        <td className="px-4 py-2">
                                            {renderPlayerCell(
                                                pair.requester.userId,
                                                pair.requester.name,
                                                pair.requester.email,
                                                {
                                                    pairPickName:
                                                        pair.requested.name,
                                                    pairReason:
                                                        pair.requester
                                                            .pairReason
                                                },
                                                pair.requester.pairRequired
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            {pair.requester.pairReason || "—"}
                                        </td>
                                        <td className="px-4 py-2">
                                            {renderPlayerCell(
                                                pair.requested.userId,
                                                pair.requested.name,
                                                pair.requested.email,
                                                {
                                                    pairPickName: null,
                                                    pairReason: null
                                                },
                                                pair.requested.pairRequired,
                                                true
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="destructive"
                                                    disabled={isPending}
                                                    onClick={() =>
                                                        handleBustUnmatched(
                                                            pair
                                                        )
                                                    }
                                                >
                                                    Bust Pair
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={
                                                        isPending ||
                                                        pair.requested
                                                            .hasDifferentPairRequest
                                                    }
                                                    onClick={() =>
                                                        handleCompletePair(pair)
                                                    }
                                                >
                                                    Complete Pair
                                                </Button>
                                            </div>
                                            {pair.requested
                                                .hasDifferentPairRequest && (
                                                <div className="mt-1 text-muted-foreground text-sm">
                                                    Requested player already has
                                                    a different pair.
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {incomplete.map((requester) => {
                                    const selectedId =
                                        assignSelections[requester.userId] ??
                                        null
                                    const selectedPartner =
                                        candidates.find(
                                            (c) => c.userId === selectedId
                                        ) ?? null

                                    return (
                                        <tr
                                            key={`incomplete-${requester.userId}`}
                                            className="border-b last:border-0"
                                        >
                                            <td className="px-4 py-2">
                                                {renderPlayerCell(
                                                    requester.userId,
                                                    requester.name,
                                                    requester.email,
                                                    {
                                                        pairPickName: null,
                                                        pairReason:
                                                            requester.pairReason
                                                    },
                                                    requester.pairRequired
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                {requester.pairReason || "—"}
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="max-w-64">
                                                    <UserCombobox
                                                        users={candidates
                                                            .filter(
                                                                (c) =>
                                                                    c.userId !==
                                                                    requester.userId
                                                            )
                                                            .map((c) => ({
                                                                id: c.userId,
                                                                name: c.pairRequired
                                                                    ? `${c.name} (14–15)`
                                                                    : c.name
                                                            }))}
                                                        value={selectedId}
                                                        onChange={(userId) =>
                                                            setAssignSelections(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [requester.userId]:
                                                                        userId
                                                                })
                                                            )
                                                        }
                                                        placeholder="Select a partner..."
                                                    />
                                                </div>
                                                <div className="mt-1 text-muted-foreground text-sm">
                                                    Wants to pair but didn't
                                                    pick a partner.
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="destructive"
                                                        disabled={isPending}
                                                        onClick={() =>
                                                            handleBustIncomplete(
                                                                requester
                                                            )
                                                        }
                                                    >
                                                        Bust Pair
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={
                                                            isPending ||
                                                            !selectedPartner
                                                        }
                                                        onClick={() => {
                                                            if (
                                                                selectedPartner
                                                            ) {
                                                                handleAssignPair(
                                                                    requester,
                                                                    selectedPartner
                                                                )
                                                            }
                                                        }}
                                                    >
                                                        Assign Pair
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Dialog
                open={confirmDialog !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setConfirmDialog(null)
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmDialog?.title}</DialogTitle>
                        <DialogDescription>
                            {confirmDialog?.description}
                        </DialogDescription>
                    </DialogHeader>

                    {confirmDialog && (
                        <div className="space-y-4 py-4">
                            <div className="rounded-md bg-muted/50 p-4">
                                <p className="font-medium text-sm">
                                    {confirmDialog.details.leftLabel}
                                </p>
                                <div className="mt-2 text-muted-foreground text-sm">
                                    <p>
                                        Name: {confirmDialog.details.leftName}
                                    </p>
                                    <p>
                                        Email: {confirmDialog.details.leftEmail}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-md bg-muted/50 p-4">
                                <p className="font-medium text-sm">
                                    {confirmDialog.details.rightLabel}
                                </p>
                                <div className="mt-2 text-muted-foreground text-sm">
                                    <p>
                                        Name: {confirmDialog.details.rightName}
                                    </p>
                                    <p>
                                        Email:{" "}
                                        {confirmDialog.details.rightEmail}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmDialog(null)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant={
                                confirmDialog?.confirmVariant || "destructive"
                            }
                            onClick={handleConfirmAction}
                            disabled={isPending}
                        >
                            {confirmDialog?.confirmLabel}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AdminPlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={handleCloseModal}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                signupHistory={modal.signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={selectedContext?.pairPickName}
                pairReason={selectedContext?.pairReason}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                emailSuppressions={modal.emailSuppressions}
                emailHistory={modal.emailHistory}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
