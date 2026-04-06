"use client"

import { useState, useTransition } from "react"
import {
    addConcernComment,
    assignConcern,
    closeConcern,
    getConcernThread,
    reopenConcern,
    sendConcernReply,
    type AssignableUser,
    type ConcernRow,
    type ConcernThreadItem
} from "./actions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    AdminPlayerDetailPopup,
    usePlayerDetailModal
} from "@/components/player-detail"

function formatDate(date: Date | string) {
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })
}

function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, string> = {
        new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        active: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
        closed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
    }
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-xs capitalize",
                variants[status] ?? variants.new
            )}
        >
            {status}
        </span>
    )
}

function ConcernCard({
    concern,
    assignableUsers,
    onUpdate,
    onOpenPlayer
}: {
    concern: ConcernRow
    assignableUsers: AssignableUser[]
    onUpdate: () => void
    onOpenPlayer: (userId: string) => void
}) {
    const [isPending, startTransition] = useTransition()
    const [expanded, setExpanded] = useState(false)
    const [thread, setThread] = useState<ConcernThreadItem[]>([])
    const [threadLoaded, setThreadLoaded] = useState(false)
    const [newComment, setNewComment] = useState("")
    const [commentMsg, setCommentMsg] = useState<string | null>(null)
    const [replyBody, setReplyBody] = useState("")
    const [replyMsg, setReplyMsg] = useState<string | null>(null)

    // Determine whether replies can be sent for this concern
    const canReply =
        concern.status === "active" &&
        (concern.source === "email"
            ? !!concern.contact_email
            : !concern.anonymous || !!concern.contact_email)

    function loadThread() {
        if (threadLoaded) return
        startTransition(async () => {
            const result = await getConcernThread(concern.id)
            if (result.status) {
                setThread(result.items)
                setThreadLoaded(true)
            }
        })
    }

    function handleToggle(open: boolean) {
        setExpanded(open)
        if (open) loadThread()
    }

    function handleAssignChange(assigneeId: string) {
        startTransition(async () => {
            await assignConcern(
                concern.id,
                assigneeId === "unassigned" ? null : assigneeId
            )
            onUpdate()
        })
    }

    function handleCloseConcern() {
        startTransition(async () => {
            await closeConcern(concern.id)
            onUpdate()
        })
    }

    function handleReopenConcern() {
        startTransition(async () => {
            await reopenConcern(concern.id)
            onUpdate()
        })
    }

    function handleAddComment() {
        if (!newComment.trim()) return
        setCommentMsg(null)
        startTransition(async () => {
            const result = await addConcernComment(concern.id, newComment)
            if (result.status) {
                setNewComment("")
                const updated = await getConcernThread(concern.id)
                if (updated.status) setThread(updated.items)
                setCommentMsg(null)
            } else {
                setCommentMsg(result.message)
            }
        })
    }

    function handleSendReply() {
        if (!replyBody.trim()) return
        setReplyMsg(null)
        startTransition(async () => {
            const result = await sendConcernReply(concern.id, replyBody)
            if (result.status) {
                setReplyBody("")
                const updated = await getConcernThread(concern.id)
                if (updated.status) setThread(updated.items)
                setReplyMsg(null)
            } else {
                setReplyMsg(result.message)
            }
        })
    }

    return (
        <Collapsible open={expanded} onOpenChange={handleToggle}>
            <div className="rounded-lg border bg-card">
                {/* Card header — always visible */}
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40"
                    >
                        <div className="mt-0.5 shrink-0 text-muted-foreground">
                            {expanded ? (
                                <RiArrowDownSLine size={18} />
                            ) : (
                                <RiArrowRightSLine size={18} />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm">
                                    #{concern.id}
                                </span>
                                <StatusBadge status={concern.status} />
                                {concern.anonymous && (
                                    <Badge
                                        variant="outline"
                                        className="text-xs"
                                    >
                                        Anonymous
                                    </Badge>
                                )}
                                {concern.want_followup && (
                                    <Badge
                                        variant="outline"
                                        className="border-blue-300 text-blue-700 text-xs dark:text-blue-300"
                                    >
                                        Follow-up Requested
                                    </Badge>
                                )}
                                {concern.source === "email" && (
                                    <Badge
                                        variant="outline"
                                        className="border-purple-300 text-purple-700 text-xs dark:text-purple-300"
                                    >
                                        Via Email
                                    </Badge>
                                )}
                            </div>
                            <p className="mt-1 truncate text-muted-foreground text-sm">
                                <span className="font-medium text-foreground">
                                    Incident:{" "}
                                </span>
                                {concern.incident_date} · {concern.location}
                            </p>
                            <p className="truncate text-muted-foreground text-sm">
                                <span className="font-medium text-foreground">
                                    {concern.source === "email"
                                        ? "Subject"
                                        : "Person involved"}
                                    :{" "}
                                </span>
                                {concern.person_involved}
                            </p>
                        </div>
                        <div className="shrink-0 text-right text-muted-foreground text-xs">
                            <div>{formatDate(concern.created_at)}</div>
                            {concern.assigned_to_name && (
                                <div className="mt-0.5">
                                    Assigned: {concern.assigned_to_name}
                                </div>
                            )}
                        </div>
                    </button>
                </CollapsibleTrigger>

                {/* Expanded content */}
                <CollapsibleContent>
                    <div className="space-y-4 border-t px-4 pt-4 pb-4">
                        {/* Submitter info */}
                        {!concern.anonymous &&
                            (concern.submitter_name ||
                                concern.contact_name) && (
                                <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                                    <p className="font-medium">Submitted by</p>
                                    {concern.user_id ? (
                                        <button
                                            type="button"
                                            className="text-left font-medium text-primary underline underline-offset-2"
                                            onClick={() => {
                                                if (concern.user_id) {
                                                    onOpenPlayer(
                                                        concern.user_id
                                                    )
                                                }
                                            }}
                                        >
                                            {concern.submitter_name ??
                                                concern.contact_name}
                                        </button>
                                    ) : (
                                        <p>
                                            {concern.submitter_name ??
                                                concern.contact_name}
                                        </p>
                                    )}
                                    {(concern.submitter_email ??
                                    concern.contact_email) ? (
                                        <p className="text-muted-foreground">
                                            <a
                                                href={`mailto:${concern.submitter_email ?? concern.contact_email}?subject=${encodeURIComponent(`Re: ${concern.source === "email" ? concern.person_involved : "Your concern"}`)}`}
                                                className="underline hover:no-underline"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                {concern.submitter_email ??
                                                    concern.contact_email}
                                            </a>
                                        </p>
                                    ) : null}
                                    {concern.contact_phone && (
                                        <p className="text-muted-foreground">
                                            {concern.contact_phone}
                                        </p>
                                    )}
                                </div>
                            )}

                        <div className="grid gap-3 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-2">
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    Contact Name
                                </p>
                                <p>{concern.contact_name || "Not provided"}</p>
                            </div>
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    Contact Email
                                </p>
                                {concern.contact_email ? (
                                    <a
                                        href={`mailto:${concern.contact_email}?subject=${encodeURIComponent(`Re: ${concern.source === "email" ? concern.person_involved : "Your concern"}`)}`}
                                        className="underline hover:no-underline"
                                    >
                                        {concern.contact_email}
                                    </a>
                                ) : (
                                    <p>Not provided</p>
                                )}
                            </div>
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    Contact Phone
                                </p>
                                <p>
                                    {concern.source === "email"
                                        ? "—"
                                        : concern.contact_phone ||
                                          "Not provided"}
                                </p>
                            </div>
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    Wants Follow-up
                                </p>
                                <p>
                                    {concern.source === "email"
                                        ? "—"
                                        : concern.want_followup
                                          ? "Yes"
                                          : "No"}
                                </p>
                            </div>
                        </div>

                        {/* Incident fields */}
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    Date of Incident
                                </p>
                                <p>{concern.incident_date}</p>
                            </div>
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    Location
                                </p>
                                <p>{concern.location}</p>
                            </div>
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    {concern.source === "email"
                                        ? "Subject"
                                        : "Person(s) Involved"}
                                </p>
                                <p>{concern.person_involved}</p>
                            </div>
                            {concern.witnesses && (
                                <div>
                                    <p className="font-medium text-muted-foreground">
                                        Witnesses
                                    </p>
                                    <p>{concern.witnesses}</p>
                                </div>
                            )}
                            {concern.team_match && (
                                <div>
                                    <p className="font-medium text-muted-foreground">
                                        Team / Match
                                    </p>
                                    <p>{concern.team_match}</p>
                                </div>
                            )}
                        </div>

                        <div className="text-sm">
                            <p className="font-medium text-muted-foreground">
                                Description
                            </p>
                            <p className="mt-1 whitespace-pre-wrap">
                                {concern.description}
                            </p>
                        </div>

                        {/* Management controls */}
                        <div className="flex flex-wrap gap-3 border-t pt-2">
                            <div className="space-y-1">
                                <p className="font-medium text-muted-foreground text-xs">
                                    Assign To
                                </p>
                                <Select
                                    value={concern.assigned_to ?? "unassigned"}
                                    onValueChange={handleAssignChange}
                                    disabled={isPending}
                                >
                                    <SelectTrigger className="h-8 w-48 text-sm">
                                        <SelectValue placeholder="Unassigned" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">
                                            Unassigned
                                        </SelectItem>
                                        {assignableUsers.map((u) => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.name}{" "}
                                                <span className="text-muted-foreground capitalize">
                                                    ({u.role})
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {concern.status === "active" && (
                                <div className="space-y-1">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Action
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={handleCloseConcern}
                                        disabled={isPending}
                                    >
                                        Close Concern
                                    </Button>
                                </div>
                            )}

                            {concern.status === "closed" && (
                                <div className="space-y-1">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Action
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={handleReopenConcern}
                                        disabled={isPending}
                                    >
                                        Reopen
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Thread: replies + internal comments */}
                        <div className="space-y-3 border-t pt-2">
                            <p className="font-medium text-sm">Thread</p>

                            {thread.length === 0 && threadLoaded && (
                                <p className="text-muted-foreground text-sm">
                                    No activity yet.
                                </p>
                            )}

                            {thread.map((item) =>
                                item.type === "reply" ? (
                                    <div
                                        key={`reply-${item.id}`}
                                        className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950"
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="font-medium text-blue-900 dark:text-blue-100">
                                                ↪ {item.sent_by_name}{" "}
                                                <span className="font-normal text-xs">
                                                    → {item.sent_to}
                                                </span>
                                            </span>
                                            <span className="text-blue-700 text-xs dark:text-blue-300">
                                                {formatDate(item.sent_at)}
                                            </span>
                                        </div>
                                        <p className="whitespace-pre-wrap text-blue-900 dark:text-blue-100">
                                            {item.body_text}
                                        </p>
                                    </div>
                                ) : item.type === "received" ? (
                                    <div
                                        key={`received-${item.id}`}
                                        className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-950/40"
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="font-medium text-green-800 dark:text-green-200">
                                                ↩ Reply from{" "}
                                                {item.from_name ??
                                                    item.from_address}
                                            </span>
                                            <span className="text-muted-foreground text-xs">
                                                {formatDate(item.received_at)}
                                            </span>
                                        </div>
                                        <p className="mb-1 text-muted-foreground text-xs">
                                            Subject: {item.subject}
                                        </p>
                                        <p className="whitespace-pre-wrap text-foreground">
                                            {item.body_text ?? "(No body)"}
                                        </p>
                                    </div>
                                ) : (
                                    <div
                                        key={`comment-${item.id}`}
                                        className="rounded-md border bg-muted/30 p-3 text-sm"
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="font-medium">
                                                {item.author_name}
                                            </span>
                                            <span className="text-muted-foreground text-xs">
                                                {formatDate(item.created_at)}
                                            </span>
                                        </div>
                                        <p className="whitespace-pre-wrap text-foreground">
                                            {item.content}
                                        </p>
                                    </div>
                                )
                            )}

                            {/* Reply composer — active concerns with a reachable address */}
                            {canReply && (
                                <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                                    <p className="font-medium text-sm">
                                        Send Reply
                                    </p>
                                    <Textarea
                                        rows={3}
                                        placeholder="Write a reply to send via email..."
                                        value={replyBody}
                                        onChange={(e) =>
                                            setReplyBody(e.target.value)
                                        }
                                    />
                                    {replyMsg && (
                                        <p className="text-destructive text-sm">
                                            {replyMsg}
                                        </p>
                                    )}
                                    <Button
                                        size="sm"
                                        onClick={handleSendReply}
                                        disabled={
                                            isPending || !replyBody.trim()
                                        }
                                    >
                                        {isPending
                                            ? "Sending..."
                                            : "Send Reply"}
                                    </Button>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Textarea
                                    rows={3}
                                    placeholder="Add an internal comment..."
                                    value={newComment}
                                    onChange={(e) =>
                                        setNewComment(e.target.value)
                                    }
                                />
                                {commentMsg && (
                                    <p className="text-destructive text-sm">
                                        {commentMsg}
                                    </p>
                                )}
                                <Button
                                    size="sm"
                                    onClick={handleAddComment}
                                    disabled={isPending || !newComment.trim()}
                                >
                                    {isPending ? "Saving..." : "Add Comment"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}

function ConcernSection({
    title,
    concerns,
    assignableUsers,
    defaultOpen,
    onUpdate,
    onOpenPlayer
}: {
    title: string
    concerns: ConcernRow[]
    assignableUsers: AssignableUser[]
    defaultOpen: boolean
    onUpdate: () => void
    onOpenPlayer: (userId: string) => void
}) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-left font-semibold transition-colors hover:bg-muted/60"
                >
                    {open ? (
                        <RiArrowDownSLine size={18} />
                    ) : (
                        <RiArrowRightSLine size={18} />
                    )}
                    <span>{title}</span>
                    <Badge variant="secondary" className="ml-auto">
                        {concerns.length}
                    </Badge>
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 space-y-2">
                    {concerns.length === 0 ? (
                        <p className="px-2 py-4 text-center text-muted-foreground text-sm">
                            No concerns in this category.
                        </p>
                    ) : (
                        concerns.map((c) => (
                            <ConcernCard
                                key={c.id}
                                concern={c}
                                assignableUsers={assignableUsers}
                                onUpdate={onUpdate}
                                onOpenPlayer={onOpenPlayer}
                            />
                        ))
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

export function ManageConcernsClient({
    initialConcerns,
    assignableUsers,
    playerPicUrl
}: {
    initialConcerns: ConcernRow[]
    assignableUsers: AssignableUser[]
    playerPicUrl: string
}) {
    const [concerns, setConcerns] = useState(initialConcerns)
    const [_isRefreshing, startRefresh] = useTransition()
    const modal = usePlayerDetailModal()

    function refresh() {
        // Re-fetch by triggering a server-side reload via router or re-fetching
        // We use a key-based trick: just force re-sort from existing state
        // For live updates, re-call the server action
        startRefresh(async () => {
            const { getConcerns } = await import("./actions")
            const result = await getConcerns()
            if (result.status) {
                setConcerns(result.concerns)
            }
        })
    }

    const newConcerns = concerns.filter((c) => c.status === "new")
    const activeConcerns = concerns.filter((c) => c.status === "active")
    const closedConcerns = concerns.filter((c) => c.status === "closed")

    return (
        <div className="space-y-4">
            <ConcernSection
                title="New Concerns"
                concerns={newConcerns}
                assignableUsers={assignableUsers}
                defaultOpen={true}
                onUpdate={refresh}
                onOpenPlayer={modal.openPlayerDetail}
            />
            <ConcernSection
                title="Active Concerns"
                concerns={activeConcerns}
                assignableUsers={assignableUsers}
                defaultOpen={true}
                onUpdate={refresh}
                onOpenPlayer={modal.openPlayerDetail}
            />
            <ConcernSection
                title="Closed Concerns"
                concerns={closedConcerns}
                assignableUsers={assignableUsers}
                defaultOpen={false}
                onUpdate={refresh}
                onOpenPlayer={modal.openPlayerDetail}
            />

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
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />
        </div>
    )
}
