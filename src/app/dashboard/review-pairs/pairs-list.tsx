"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
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
import { RiCloseLine } from "@remixicon/react"
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
import {
    bustMatchedPair,
    bustUnmatchedPair,
    completeUnmatchedPair,
    type MatchedPair,
    type UnmatchedPair
} from "./actions"

interface PairsListProps {
    matched: MatchedPair[]
    unmatched: UnmatchedPair[]
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

function formatHeight(inches: number | null): string {
    if (!inches) return "—"
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}'${remainingInches}"`
}

export function PairsList({
    matched,
    unmatched,
    playerPicUrl
}: PairsListProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [actionMessage, setActionMessage] = useState<string | null>(null)
    const [actionError, setActionError] = useState(false)

    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [selectedContext, setSelectedContext] =
        useState<SelectedPairContext | null>(null)
    const [playerDetails, setPlayerDetails] = useState<PlayerDetails | null>(
        null
    )
    const [draftHistory, setDraftHistory] = useState<PlayerDraftHistory[]>([])
    const [isLoadingDetails, setIsLoadingDetails] = useState(false)
    const [showImageModal, setShowImageModal] = useState(false)
    const [confirmDialog, setConfirmDialog] =
        useState<PairConfirmDialogState | null>(null)

    const handlePlayerClick = async (
        userId: string,
        context: SelectedPairContext
    ) => {
        setSelectedUserId(userId)
        setSelectedContext(context)
        setPlayerDetails(null)
        setIsLoadingDetails(true)

        const result = await getPlayerDetails(userId)

        if (result.status && result.player) {
            setPlayerDetails(result.player)
            setDraftHistory(result.draftHistory)
        } else {
            setDraftHistory([])
        }

        setIsLoadingDetails(false)
    }

    const handleCloseModal = useCallback(() => {
        setSelectedUserId(null)
        setSelectedContext(null)
        setPlayerDetails(null)
        setDraftHistory([])
        setShowImageModal(false)
    }, [])

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

    const runAction = (
        action: () => Promise<{ status: boolean; message: string }>
    ) => {
        startTransition(async () => {
            const result = await action()
            setActionMessage(result.message)
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
        highlight = false
    ) => {
        const content = (
            <button
                type="button"
                className="text-left hover:underline"
                onClick={() => handlePlayerClick(userId, context)}
            >
                <div className="font-medium">{name}</div>
                <div className="text-muted-foreground text-xs">{email}</div>
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
                                                }
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
                                                }
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
                        {unmatched.length}
                    </span>
                </div>

                {unmatched.length === 0 ? (
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
                                                }
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
                                                <div className="mt-1 text-muted-foreground text-xs">
                                                    Requested player already has
                                                    a different pair.
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
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

                        {isLoadingDetails && (
                            <div className="p-8 text-center text-muted-foreground">
                                Loading player details...
                            </div>
                        )}

                        {playerDetails && !isLoadingDetails && (
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

                                    <div>
                                        <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                            Emergency Contact
                                        </h3>
                                        <p className="text-sm">
                                            {playerDetails.emergency_contact ||
                                                "—"}
                                        </p>
                                    </div>

                                    {(selectedContext?.pairPickName ||
                                        selectedContext?.pairReason) && (
                                        <div>
                                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                                Pair Request
                                            </h3>
                                            <div className="grid grid-cols-1 gap-3 text-sm">
                                                {selectedContext.pairPickName && (
                                                    <div>
                                                        <span className="text-muted-foreground">
                                                            Pair Pick:
                                                        </span>
                                                        <span className="ml-2 font-medium">
                                                            {
                                                                selectedContext.pairPickName
                                                            }
                                                        </span>
                                                    </div>
                                                )}
                                                {selectedContext.pairReason && (
                                                    <div>
                                                        <span className="text-muted-foreground">
                                                            Reason:
                                                        </span>
                                                        <span className="ml-2 font-medium">
                                                            {
                                                                selectedContext.pairReason
                                                            }
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

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

                        {!isLoadingDetails && !playerDetails && (
                            <div className="p-8 text-center text-muted-foreground">
                                Failed to load player details.
                            </div>
                        )}
                    </div>
                </div>
            )}

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
