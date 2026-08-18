"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import DOMPurify from "isomorphic-dompurify"
import {
    addInboundEmailComment,
    assignInboundEmail,
    closeInboundEmail,
    getEmailThread,
    markInboundEmailAsSpam,
    quickReplyInboundEmail,
    reopenInboundEmail,
    sendEmailReply,
    sendEmailReplyAndClose,
    unmarkInboundEmailAsSpam,
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
import { formatTimestamp } from "@/lib/date-utils"
import { cn } from "@/lib/utils"
import { usePlayerDetailModal } from "@/components/player-detail/use-player-detail-modal"
import { AdminPlayerDetailPopup } from "@/components/player-detail/admin-player-detail-popup"

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
                        className="mt-1 text-muted-foreground text-xs underline hover:text-foreground"
                    >
                        {showQuoted ? "Hide Quoted Text" : "Show Quoted Text"}
                    </button>
                    {showQuoted && (
                        <p className="mt-1 whitespace-pre-wrap border-muted-foreground/30 border-l-2 pl-2 text-muted-foreground text-xs">
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
        closed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        spam: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
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
    currentUserId,
    initiallyExpanded = false,
    focusRequest,
    onUpdate,
    onFocusEmail,
    onPlayerClick
}: {
    email: InboundEmailRow
    assignableAdmins: AssignableAdmin[]
    currentUserId: string
    initiallyExpanded?: boolean
    focusRequest: number
    onUpdate: () => void
    onFocusEmail: (emailId: number) => void
    onPlayerClick: (userId: string) => void
}) {
    const [isPending, startTransition] = useTransition()
    const [expanded, setExpanded] = useState(initiallyExpanded)
    const [threadItems, setThreadItems] = useState<ThreadItem[]>([])
    const [threadLoaded, setThreadLoaded] = useState(false)
    const [newComment, setNewComment] = useState("")
    const [commentMsg, setCommentMsg] = useState<string | null>(null)
    const [replyBody, setReplyBody] = useState("")
    const [replyMsg, setReplyMsg] = useState<string | null>(null)
    const [assignMsg, setAssignMsg] = useState<string | null>(null)
    const [pendingFocus, setPendingFocus] = useState(0)
    const cardRef = useRef<HTMLDivElement | null>(null)
    const replyRef = useRef<HTMLTextAreaElement | null>(null)

    // Deep link (?email=<id>): the card mounts already expanded, so fetch the
    // thread and bring it into view without waiting for a toggle click.
    useEffect(() => {
        // A focus request handles its own scroll and thread load.
        if (!initiallyExpanded || focusRequest) return
        cardRef.current?.scrollIntoView({ block: "center" })
        getEmailThread(email.id).then((result) => {
            if (result.status) {
                setThreadItems(result.data)
                setThreadLoaded(true)
            }
        })
    }, [initiallyExpanded, focusRequest, email.id])

    // "Assign to Me" asks the parent to focus this email once the list has
    // refreshed. The card may have moved sections (and remounted) or may have
    // stayed put, so the request arrives as an incrementing nonce rather than a
    // boolean read at mount.
    useEffect(() => {
        if (!focusRequest) return
        setPendingFocus(focusRequest)
        setExpanded(true)
        getEmailThread(email.id).then((result) => {
            if (result.status) {
                setThreadItems(result.data)
                setThreadLoaded(true)
            }
        })
    }, [focusRequest, email.id])

    // Deferred to the commit where the card is expanded, so the reply composer
    // is mounted by the time we reach for it. Closed/spam emails have no
    // composer — they just scroll into view.
    useEffect(() => {
        if (!pendingFocus || !expanded) return
        setPendingFocus(0)
        cardRef.current?.scrollIntoView({ block: "center" })
        replyRef.current?.focus()
    }, [pendingFocus, expanded])

    function loadThread() {
        if (threadLoaded) return
        startTransition(async () => {
            const result = await getEmailThread(email.id)
            if (result.status) {
                setThreadItems(result.data)
                setThreadLoaded(true)
            }
        })
    }

    function refreshThread() {
        startTransition(async () => {
            const result = await getEmailThread(email.id)
            if (result.status) setThreadItems(result.data)
        })
    }

    function handleToggle(open: boolean) {
        setExpanded(open)
        if (open) loadThread()
    }

    function handleAssignChange(assigneeId: string) {
        setAssignMsg(null)
        startTransition(async () => {
            const result = await assignInboundEmail(
                email.id,
                assigneeId === "unassigned" ? null : assigneeId
            )
            // Resync either way: on failure the select is showing a value that
            // was never persisted.
            if (!result.status) setAssignMsg(result.message)
            onUpdate()
        })
    }

    // Shortcut past the admin dropdown: claim the email, which also promotes a
    // "new" email to "active", then ask the parent to focus it for a reply.
    function handleAssignToMe() {
        setAssignMsg(null)
        startTransition(async () => {
            const result = await assignInboundEmail(email.id, currentUserId)
            if (!result.status) {
                setAssignMsg(result.message)
                return
            }
            onUpdate()
            onFocusEmail(email.id)
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

    function handleMarkSpam() {
        startTransition(async () => {
            await markInboundEmailAsSpam(email.id)
            onUpdate()
        })
    }

    function handleUnmarkSpam() {
        startTransition(async () => {
            await unmarkInboundEmailAsSpam(email.id)
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

    // The email leaves the Active section on success, so the parent list
    // refresh (not a thread refresh) is what reflects the change.
    function handleSendReplyAndClose() {
        if (!replyBody.trim()) return
        setReplyMsg(null)
        startTransition(async () => {
            const result = await sendEmailReplyAndClose(email.id, replyBody)
            if (result.status) {
                setReplyBody("")
                onUpdate()
            } else {
                setReplyMsg(result.message)
            }
        })
    }

    // New emails only: claim, reply, and close in one step. On success the
    // email moves straight from New to Closed.
    function handleQuickReply() {
        if (!replyBody.trim()) return
        setReplyMsg(null)
        startTransition(async () => {
            const result = await quickReplyInboundEmail(email.id, replyBody)
            if (result.status) {
                setReplyBody("")
                onUpdate()
            } else {
                setReplyMsg(result.message)
            }
        })
    }

    return (
        <Collapsible open={expanded} onOpenChange={handleToggle}>
            <div ref={cardRef} className="rounded-lg border bg-card">
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
                            <div>{formatTimestamp(email.created_at)}</div>
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
                                        __html: DOMPurify.sanitize(
                                            email.body_html,
                                            {
                                                FORBID_TAGS: [
                                                    "script",
                                                    "style",
                                                    "iframe",
                                                    "object",
                                                    "embed",
                                                    "form"
                                                ],
                                                FORBID_ATTR: [
                                                    "onerror",
                                                    "onload",
                                                    "onclick",
                                                    "onmouseover",
                                                    "onfocus",
                                                    "formaction"
                                                ]
                                            }
                                        )
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

                            {email.assigned_to !== currentUserId && (
                                <div className="space-y-1">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Shortcut
                                    </p>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={handleAssignToMe}
                                        disabled={isPending}
                                    >
                                        Assign to Me
                                    </Button>
                                </div>
                            )}

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

                            {email.status !== "spam" && (
                                <div className="space-y-1">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Spam
                                    </p>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={handleMarkSpam}
                                        disabled={isPending}
                                    >
                                        Mark as Spam
                                    </Button>
                                </div>
                            )}

                            {email.status === "spam" && (
                                <div className="space-y-1">
                                    <p className="font-medium text-muted-foreground text-xs">
                                        Action
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={handleUnmarkSpam}
                                        disabled={isPending}
                                    >
                                        Move to New
                                    </Button>
                                </div>
                            )}
                        </div>

                        {assignMsg && (
                            <p className="text-destructive text-sm">
                                {assignMsg}
                            </p>
                        )}

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
                                                {formatTimestamp(item.sent_at)}
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
                                                {formatTimestamp(
                                                    item.received_at
                                                )}
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
                                                {formatTimestamp(
                                                    item.created_at
                                                )}
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
                                        ref={replyRef}
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
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            size="sm"
                                            onClick={handleSendReply}
                                            disabled={
                                                isPending || !replyBody.trim()
                                            }
                                        >
                                            {isPending
                                                ? "Sending…"
                                                : "Send Reply"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={handleSendReplyAndClose}
                                            disabled={
                                                isPending || !replyBody.trim()
                                            }
                                        >
                                            {isPending
                                                ? "Sending…"
                                                : "Send & Close"}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Quick reply — new emails only: assign to me,
                                send, and close in one step */}
                            {email.status === "new" && (
                                <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
                                    <p className="font-medium text-sm">
                                        Quick Reply to{" "}
                                        {email.from_name ?? email.from_address}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                        Assigns the email to you, sends the
                                        reply, and closes it.
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
                                        onClick={handleQuickReply}
                                        disabled={
                                            isPending || !replyBody.trim()
                                        }
                                    >
                                        {isPending
                                            ? "Sending…"
                                            : "Send, Assign to Me & Close"}
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
    currentUserId,
    defaultOpen,
    focusEmailId,
    focusNonce,
    onUpdate,
    onFocusEmail,
    onPlayerClick
}: {
    title: string
    emails: InboundEmailRow[]
    assignableAdmins: AssignableAdmin[]
    currentUserId: string
    defaultOpen: boolean
    focusEmailId: number | null
    focusNonce: number
    onUpdate: () => void
    onFocusEmail: (emailId: number) => void
    onPlayerClick: (userId: string) => void
}) {
    // A deep-linked email must be reachable even when it sits in a section
    // that is collapsed by default (Closed/Spam).
    const containsFocus =
        focusEmailId !== null && emails.some((e) => e.id === focusEmailId)
    const [open, setOpen] = useState(defaultOpen || containsFocus)

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
                                currentUserId={currentUserId}
                                initiallyExpanded={e.id === focusEmailId}
                                focusRequest={
                                    e.id === focusEmailId ? focusNonce : 0
                                }
                                onUpdate={onUpdate}
                                onFocusEmail={onFocusEmail}
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
    playerPicUrl,
    currentUserId,
    focusEmailId = null
}: {
    initialEmails: InboundEmailRow[]
    assignableAdmins: AssignableAdmin[]
    playerPicUrl: string
    currentUserId: string
    focusEmailId?: number | null
}) {
    const [emails, setEmails] = useState(initialEmails)
    const [_isRefreshing, startRefresh] = useTransition()
    // Which email the page is focused on. Seeded by the ?email=<id> deep link
    // and re-pointed by "Assign to Me"; the nonce re-fires focus even when the
    // target email hasn't changed.
    const [focusId, setFocusId] = useState(focusEmailId)
    const [focusNonce, setFocusNonce] = useState(0)

    function focusEmail(emailId: number) {
        setFocusId(emailId)
        setFocusNonce((n) => n + 1)
    }

    const {
        selectedUserId,
        playerDetails,
        draftHistory,
        signupHistory,
        ratingAverages,
        sharedRatingNotes,
        privateRatingNotes,
        emailSuppressions,
        emailHistory,
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
                setEmails(result.data)
            }
        })
    }

    const newEmails = emails.filter((e) => e.status === "new")
    const activeEmails = emails.filter((e) => e.status === "active")
    const closedEmails = emails.filter((e) => e.status === "closed")
    const spamEmails = emails.filter((e) => e.status === "spam")

    return (
        <div className="space-y-4">
            <EmailSection
                title="New Emails"
                emails={newEmails}
                assignableAdmins={assignableAdmins}
                currentUserId={currentUserId}
                focusEmailId={focusId}
                focusNonce={focusNonce}
                defaultOpen={true}
                onUpdate={refresh}
                onFocusEmail={focusEmail}
                onPlayerClick={openPlayerDetail}
            />
            <EmailSection
                title="Active Emails"
                emails={activeEmails}
                assignableAdmins={assignableAdmins}
                currentUserId={currentUserId}
                focusEmailId={focusId}
                focusNonce={focusNonce}
                defaultOpen={true}
                onUpdate={refresh}
                onFocusEmail={focusEmail}
                onPlayerClick={openPlayerDetail}
            />
            <EmailSection
                title="Closed Emails"
                emails={closedEmails}
                assignableAdmins={assignableAdmins}
                currentUserId={currentUserId}
                focusEmailId={focusId}
                focusNonce={focusNonce}
                defaultOpen={false}
                onUpdate={refresh}
                onFocusEmail={focusEmail}
                onPlayerClick={openPlayerDetail}
            />
            <EmailSection
                title="Spam"
                emails={spamEmails}
                assignableAdmins={assignableAdmins}
                currentUserId={currentUserId}
                focusEmailId={focusId}
                focusNonce={focusNonce}
                defaultOpen={false}
                onUpdate={refresh}
                onFocusEmail={focusEmail}
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
                emailSuppressions={emailSuppressions}
                emailHistory={emailHistory}
                viewerRating={viewerRating}
            />
        </div>
    )
}
