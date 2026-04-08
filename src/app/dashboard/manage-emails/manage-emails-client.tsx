"use client"

import { useState, useTransition } from "react"
import {
    addInboundEmailComment,
    assignInboundEmail,
    closeInboundEmail,
    getEmailThread,
    reopenInboundEmail,
    sendEmailReply,
    type AssignableAdmin,
    type ThreadItem,
    type InboundEmailRow
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
import { usePlayerDetailModal } from "@/components/player-detail/use-player-detail-modal"
import { AdminPlayerDetailPopup } from "@/components/player-detail/admin-player-detail-popup"

function formatDate(date: Date | string) {
    return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })
}

function splitQuotedText(text: string): {
    main: string
    quoted: string | null
} {
    const lines = text.split("\n")
    const firstQuoteIdx = lines.findIndex((l) => /^\s*>/.test(l))
    if (firstQuoteIdx === -1) return { main: text, quoted: null }
    return {
        main: lines.slice(0, firstQuoteIdx).join("\n").trimEnd(),
        quoted: lines.slice(firstQuoteIdx).join("\n")
    }
}

function MessageBody({ text }: { text: string }) {
    const [showQuoted, setShowQuoted] = useState(false)
    const { main, quoted } = splitQuotedText(text)
    return (
        <>
            <p className="whitespace-pre-wrap text-foreground">
                {main || "(No body)"}
            </p>
            {quoted && (
                <>
                    <button
                        type="button"
                        onClick={() => setShowQuoted((v) => !v)}
                        className="mt-1 text-xs text-muted-foreground underline hover:text-foreground"
                    >
                        {showQuoted ? "Hide Quoted Text" : "Show Quoted Text"}
                    </button>
                    {showQuoted && (
                        <p className="mt-1 whitespace-pre-wrap border-l-2 border-muted-foreground/30 pl-2 text-muted-foreground text-xs">
                            {quoted}
                        </p>
                    )}
                </>
            )}
        </>
    )
}

/** Renders sender name (optionally as a player-detail link) + email as mailto */
function FromDisplay({
    name,
    email,
    userId,
    subject,
    onPlayerClick
}: {
    name: string | null
    email: string
    userId: string | null
    subject: string
    onPlayerClick: (userId: string) => void
}) {
    const mailtoHref = `mailto:${email}?subject=${encodeURIComponent(`Re: ${subject}`)}`

    return (
        <span>
            {name && (
                <>
                    {userId ? (
                        <button
                            type="button"
                            className="font-medium underline hover:no-underline"
                            onClick={(e) => {
                                e.stopPropagation()
                                onPlayerClick(userId)
                            }}
                        >
                            {name}
                        </button>
                    ) : (
                        <span>{name}</span>
                    )}{" "}
                    &lt;
                </>
            )}
            <a
                href={mailtoHref}
                className="underline hover:no-underline"
                onClick={(e) => e.stopPropagation()}
            >
                {email}
            </a>
            {name && <>&gt;</>}
        </span>
    )
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

function EmailCard({
    email,
    assignableAdmins,
    onUpdate,
    onPlayerClick
}: {
    email: InboundEmailRow
    assignableAdmins: AssignableAdmin[]
    onUpdate: () => void
    onPlayerClick: (userId: string) => void
}) {
    const [isPending, startTransition] = useTransition()
    const [expanded, setExpanded] = useState(false)
    const [threadItems, setThreadItems] = useState<ThreadItem[]>([])
    const [threadLoaded, setThreadLoaded] = useState(false)
    const [newComment, setNewComment] = useState("")
    const [commentMsg, setCommentMsg] = useState<string | null>(null)
    const [replyBody, setReplyBody] = useState("")
    const [replyMsg, setReplyMsg] = useState<string | null>(null)

    function loadThread() {
        if (threadLoaded) return
        startTransition(async () => {
            const result = await getEmailThread(email.id)
            if (result.status) {
                setThreadItems(result.items)
                setThreadLoaded(true)
            }
        })
    }

    function refreshThread() {
        startTransition(async () => {
            const result = await getEmailThread(email.id)
            if (result.status) setThreadItems(result.items)
        })
    }

    function handleToggle(open: boolean) {
        setExpanded(open)
        if (open) loadThread()
    }

    function handleAssignChange(assigneeId: string) {
        startTransition(async () => {
            await assignInboundEmail(
                email.id,
                assigneeId === "unassigned" ? null : assigneeId
            )
            onUpdate()
        })
    }

    function handleClose() {
        startTransition(async () => {
            await closeInboundEmail(email.id)
            onUpdate()
        })
    }

    function handleReopen() {
        startTransition(async () => {
            await reopenInboundEmail(email.id)
            onUpdate()
        })
    }

    function handleAddComment() {
        if (!newComment.trim()) return
        setCommentMsg(null)
        startTransition(async () => {
            const result = await addInboundEmailComment(email.id, newComment)
            if (result.status) {
                setNewComment("")
                refreshThread()
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
            const result = await sendEmailReply(email.id, replyBody)
            if (result.status) {
                setReplyBody("")
                refreshThread()
                setReplyMsg(null)
            } else {
                setReplyMsg(result.message)
            }
        })
    }

    return (
        <Collapsible open={expanded} onOpenChange={handleToggle}>
            <div className="rounded-lg border bg-card">
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
                                    #{email.id}
                                </span>
                                <StatusBadge status={email.status} />
                                <Badge variant="outline" className="text-xs">
                                    Email
                                </Badge>
                            </div>
                            <p className="mt-1 truncate font-medium text-sm">
                                {email.subject}
                            </p>
                            <p className="truncate text-muted-foreground text-sm">
                                <span className="font-medium text-foreground">
                                    From:{" "}
                                </span>
                                <FromDisplay
                                    name={email.from_name}
                                    email={email.from_address}
                                    userId={email.from_user_id}
                                    subject={email.subject}
                                    onPlayerClick={onPlayerClick}
                                />
                            </p>
                        </div>
                        <div className="shrink-0 text-right text-muted-foreground text-xs">
                            <div>{formatDate(email.created_at)}</div>
                            {email.assigned_to_name && (
                                <div className="mt-0.5">
                                    Assigned: {email.assigned_to_name}
                                </div>
                            )}
                        </div>
                    </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="space-y-4 border-t px-4 pt-4 pb-4">
                        {/* Email metadata */}
                        <div className="grid gap-3 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-2">
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    From
                                </p>
                                <FromDisplay
                                    name={email.from_name}
                                    email={email.from_address}
                                    userId={email.from_user_id}
                                    subject={email.subject}
                                    onPlayerClick={onPlayerClick}
                                />
                            </div>
                            <div>
                                <p className="font-medium text-muted-foreground">
                                    To
                                </p>
                                <p>{email.to_address}</p>
                            </div>
                            <div className="sm:col-span-2">
                                <p className="font-medium text-muted-foreground">
                                    Subject
                                </p>
                                <p>{email.subject}</p>
                            </div>
                        </div>

                        {/* Email body */}
                        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-950/40">
                            <p className="mb-1 font-medium text-green-800 dark:text-green-200">
                                Original Email
                            </p>
                            {email.body_html ? (
                                <div
                                    className="prose prose-sm dark:prose-invert mt-1 max-w-none"
                                    dangerouslySetInnerHTML={{
                                        __html: email.body_html
                                    }}
                                />
                            ) : (
                                <p className="mt-1 whitespace-pre-wrap text-foreground">
                                    {email.body_text || "(No body)"}
                                </p>
                            )}
                        </div>

                        {/* Management controls */}
                        <div className="flex flex-wrap gap-3 border-t pt-2">
                            <div className="space-y-1">
                                <p className="font-medium text-muted-foreground text-xs">
                                    Assign To
                                </p>
                                <Select
                                    value={email.assigned_to ?? "unassigned"}
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
                                        {assignableAdmins.map((u) => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {email.status === "active" && (
                                <div className="space-y-1">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Action
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={handleClose}
                                        disabled={isPending}
                                    >
                                        Close Email
                                    </Button>
                                </div>
                            )}

                            {email.status === "closed" && (
                                <div className="space-y-1">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Action
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={handleReopen}
                                        disabled={isPending}
                                    >
                                        Reopen
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Thread: replies + internal comments (chronological) */}
                        <div className="space-y-3 border-t pt-2">
                            <p className="font-medium text-sm">Thread</p>

                            {threadItems.length === 0 && threadLoaded && (
                                <p className="text-muted-foreground text-sm">
                                    No activity yet.
                                </p>
                            )}

                            {threadItems.map((item) =>
                                item.type === "reply" ? (
                                    <div
                                        key={`reply-${item.id}`}
                                        className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/40"
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="font-medium text-blue-800 dark:text-blue-200">
                                                ↪ Reply sent by{" "}
                                                {item.sent_by_name}
                                            </span>
                                            <span className="text-muted-foreground text-xs">
                                                {formatDate(item.sent_at)}
                                            </span>
                                        </div>
                                        <p className="mb-1 text-muted-foreground text-xs">
                                            Subject: {item.subject}
                                        </p>
                                        <p className="whitespace-pre-wrap text-foreground">
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
                                        <MessageBody
                                            text={item.body_text ?? "(No body)"}
                                        />
                                    </div>
                                ) : (
                                    <div
                                        key={`comment-${item.id}`}
                                        className="rounded-md border bg-muted/30 p-3 text-sm"
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="font-medium">
                                                🔒 {item.author_name}
                                                <span className="ml-1 font-normal text-muted-foreground text-xs">
                                                    (internal)
                                                </span>
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

                            {/* Reply composer — active emails only */}
                            {email.status === "active" && (
                                <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
                                    <p className="font-medium text-sm">
                                        Send Reply to{" "}
                                        {email.from_name ?? email.from_address}
                                    </p>
                                    <Textarea
                                        rows={4}
                                        placeholder="Write your reply…"
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
                                        {isPending ? "Sending…" : "Send Reply"}
                                    </Button>
                                </div>
                            )}

                            {/* Internal comment composer */}
                            <div className="space-y-2">
                                <p className="font-medium text-muted-foreground text-sm">
                                    Add Internal Note
                                </p>
                                <Textarea
                                    rows={3}
                                    placeholder="Internal note (not visible to sender)…"
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
                                    variant="outline"
                                    onClick={handleAddComment}
                                    disabled={isPending || !newComment.trim()}
                                >
                                    {isPending ? "Saving…" : "Add Note"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}

function EmailSection({
    title,
    emails,
    assignableAdmins,
    defaultOpen,
    onUpdate,
    onPlayerClick
}: {
    title: string
    emails: InboundEmailRow[]
    assignableAdmins: AssignableAdmin[]
    defaultOpen: boolean
    onUpdate: () => void
    onPlayerClick: (userId: string) => void
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
                        {emails.length}
                    </Badge>
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="mt-2 space-y-2">
                    {emails.length === 0 ? (
                        <p className="px-2 py-4 text-center text-muted-foreground text-sm">
                            No emails in this category.
                        </p>
                    ) : (
                        emails.map((e) => (
                            <EmailCard
                                key={e.id}
                                email={e}
                                assignableAdmins={assignableAdmins}
                                onUpdate={onUpdate}
                                onPlayerClick={onPlayerClick}
                            />
                        ))
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

export function ManageEmailsClient({
    initialEmails,
    assignableAdmins,
    playerPicUrl
}: {
    initialEmails: InboundEmailRow[]
    assignableAdmins: AssignableAdmin[]
    playerPicUrl: string
}) {
    const [emails, setEmails] = useState(initialEmails)
    const [_isRefreshing, startRefresh] = useTransition()

    const {
        selectedUserId,
        playerDetails,
        draftHistory,
        signupHistory,
        ratingAverages,
        sharedRatingNotes,
        privateRatingNotes,
        viewerRating,
        pairPickName,
        pairReason,
        isLoading: playerLoading,
        openPlayerDetail,
        closePlayerDetail
    } = usePlayerDetailModal()

    function refresh() {
        startRefresh(async () => {
            const { getInboundEmails } = await import("./actions")
            const result = await getInboundEmails()
            if (result.status) {
                setEmails(result.emails)
            }
        })
    }

    const newEmails = emails.filter((e) => e.status === "new")
    const activeEmails = emails.filter((e) => e.status === "active")
    const closedEmails = emails.filter((e) => e.status === "closed")

    return (
        <div className="space-y-4">
            <EmailSection
                title="New Emails"
                emails={newEmails}
                assignableAdmins={assignableAdmins}
                defaultOpen={true}
                onUpdate={refresh}
                onPlayerClick={openPlayerDetail}
            />
            <EmailSection
                title="Active Emails"
                emails={activeEmails}
                assignableAdmins={assignableAdmins}
                defaultOpen={true}
                onUpdate={refresh}
                onPlayerClick={openPlayerDetail}
            />
            <EmailSection
                title="Closed Emails"
                emails={closedEmails}
                assignableAdmins={assignableAdmins}
                defaultOpen={false}
                onUpdate={refresh}
                onPlayerClick={openPlayerDetail}
            />
            <AdminPlayerDetailPopup
                open={!!selectedUserId}
                onClose={closePlayerDetail}
                playerDetails={playerDetails}
                draftHistory={draftHistory}
                signupHistory={signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={playerLoading}
                pairPickName={pairPickName}
                pairReason={pairReason}
                ratingAverages={ratingAverages}
                sharedRatingNotes={sharedRatingNotes}
                privateRatingNotes={privateRatingNotes}
                viewerRating={viewerRating}
            />
        </div>
    )
}
