"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { formatDate, formatMatchTime } from "./find-sub-helpers"
import {
    cancelSubRequest,
    getSubRequestsForTeam,
    respondToSubRequest,
    type SubRequestView
} from "./sub-request-actions"

const STATUS_BADGES: Record<
    string,
    {
        label: string
        variant: "default" | "secondary" | "destructive" | "outline"
    }
> = {
    pending: { label: "Pending", variant: "default" },
    approved: { label: "Approved", variant: "secondary" },
    declined: { label: "Declined", variant: "destructive" },
    cancelled: { label: "Cancelled", variant: "outline" },
    expired: { label: "Expired", variant: "outline" }
}

function StatusBadge({ status }: { status: string }) {
    const badge = STATUS_BADGES[status] ?? {
        label: status,
        variant: "outline" as const
    }
    return (
        <Badge variant={badge.variant} className="text-xs">
            {badge.label}
        </Badge>
    )
}

function matchLine(request: SubRequestView): string {
    const parts = [
        request.matchDate ? formatDate(request.matchDate) : "Date TBD"
    ]
    if (request.matchTime) parts.push(formatMatchTime(request.matchTime))
    if (request.court != null) parts.push(`Court ${request.court}`)
    return parts.join(" · ")
}

export function SubRequestsCard({ teamId }: { teamId: number }) {
    const router = useRouter()
    const [incoming, setIncoming] = useState<SubRequestView[]>([])
    const [outgoing, setOutgoing] = useState<SubRequestView[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [respondingTo, setRespondingTo] = useState<{
        id: number
        decision: "approve" | "decline"
    } | null>(null)
    const [responseNote, setResponseNote] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    const load = useCallback(async () => {
        const result = await getSubRequestsForTeam(teamId)
        if (result.status) {
            setIncoming(result.data.incoming)
            setOutgoing(result.data.outgoing)
        }
        setIsLoading(false)
    }, [teamId])

    useEffect(() => {
        setIsLoading(true)
        void load()
    }, [load])

    async function handleConfirmResponse() {
        if (!respondingTo) return
        setIsSubmitting(true)
        try {
            const result = await respondToSubRequest({
                requestId: respondingTo.id,
                decision: respondingTo.decision,
                responseNote: responseNote.trim() || undefined
            })
            if (result.status) {
                toast.success(result.message)
                setRespondingTo(null)
                setResponseNote("")
                await load()
                router.refresh()
            } else {
                toast.error(result.message)
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    async function handleCancel(requestId: number) {
        setIsSubmitting(true)
        try {
            const result = await cancelSubRequest(requestId)
            if (result.status) {
                toast.success(result.message)
                await load()
            } else {
                toast.error(result.message)
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading || (incoming.length === 0 && outgoing.length === 0)) {
        return null
    }

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle className="text-base">Sub Requests</CardTitle>
                <CardDescription>
                    Requests to borrow players between teams. Approving locks
                    the sub in for that match.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {incoming.length > 0 && (
                    <div>
                        <p className="mb-2 font-medium text-sm">
                            Incoming — your players
                        </p>
                        <div className="space-y-2">
                            {incoming.map((request) => (
                                <div
                                    key={request.id}
                                    className="rounded-md border p-3 text-sm"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p>
                                                <span className="font-medium">
                                                    {request.requestingTeamName}
                                                </span>{" "}
                                                asks to borrow{" "}
                                                <span className="font-medium">
                                                    {request.candidateName}
                                                </span>{" "}
                                                to cover{" "}
                                                {request.coveredPlayerName}
                                            </p>
                                            <p className="text-muted-foreground text-sm">
                                                {matchLine(request)} · requested
                                                by {request.requesterName}
                                            </p>
                                            {request.message && (
                                                <p className="mt-1 text-muted-foreground text-sm">
                                                    “{request.message}”
                                                </p>
                                            )}
                                            {request.responseNote && (
                                                <p className="mt-1 text-muted-foreground text-sm">
                                                    Response:{" "}
                                                    {request.responseNote}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <StatusBadge
                                                status={request.status}
                                            />
                                            {request.status === "pending" && (
                                                <>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        disabled={isSubmitting}
                                                        onClick={() => {
                                                            setResponseNote("")
                                                            setRespondingTo({
                                                                id: request.id,
                                                                decision:
                                                                    "approve"
                                                            })
                                                        }}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-2 text-xs"
                                                        disabled={isSubmitting}
                                                        onClick={() => {
                                                            setResponseNote("")
                                                            setRespondingTo({
                                                                id: request.id,
                                                                decision:
                                                                    "decline"
                                                            })
                                                        }}
                                                    >
                                                        Decline
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {respondingTo?.id === request.id && (
                                        <div className="mt-3 space-y-2 border-t pt-3">
                                            <label
                                                htmlFor={`response-note-${request.id}`}
                                                className="block font-medium text-sm"
                                            >
                                                {respondingTo.decision ===
                                                "approve"
                                                    ? "Approve this request?"
                                                    : "Decline this request?"}{" "}
                                                Optional note to the other
                                                captain:
                                            </label>
                                            <textarea
                                                id={`response-note-${request.id}`}
                                                value={responseNote}
                                                onChange={(e) =>
                                                    setResponseNote(
                                                        e.target.value
                                                    )
                                                }
                                                rows={2}
                                                disabled={isSubmitting}
                                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={isSubmitting}
                                                    onClick={() =>
                                                        setRespondingTo(null)
                                                    }
                                                >
                                                    Back
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={
                                                        respondingTo.decision ===
                                                        "decline"
                                                            ? "destructive"
                                                            : "default"
                                                    }
                                                    disabled={isSubmitting}
                                                    onClick={
                                                        handleConfirmResponse
                                                    }
                                                >
                                                    {isSubmitting
                                                        ? "Working..."
                                                        : respondingTo.decision ===
                                                            "approve"
                                                          ? "Confirm Approval"
                                                          : "Confirm Decline"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {outgoing.length > 0 && (
                    <div>
                        <p className="mb-2 font-medium text-sm">
                            Outgoing — your requests
                        </p>
                        <div className="space-y-2">
                            {outgoing.map((request) => (
                                <div
                                    key={request.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                                >
                                    <div>
                                        <p>
                                            <span className="font-medium">
                                                {request.candidateName}
                                            </span>{" "}
                                            ({request.targetTeamName}) to cover{" "}
                                            {request.coveredPlayerName}
                                        </p>
                                        <p className="text-muted-foreground text-sm">
                                            {matchLine(request)}
                                        </p>
                                        {request.responseNote && (
                                            <p className="mt-1 text-muted-foreground text-sm">
                                                Response: {request.responseNote}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <StatusBadge status={request.status} />
                                        {request.status === "pending" && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                disabled={isSubmitting}
                                                onClick={() =>
                                                    handleCancel(request.id)
                                                }
                                            >
                                                Cancel
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
