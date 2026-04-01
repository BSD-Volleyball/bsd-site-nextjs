"use client"

import { useState, useTransition } from "react"
import {
    addInboundEmailComment,
    assignInboundEmail,
    closeInboundEmail,
    getInboundEmailComments,
    reopenInboundEmail,
    type AssignableAdmin,
    type InboundEmailComment,
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

function EmailCard({
    email,
    assignableAdmins,
    onUpdate
}: {
    email: InboundEmailRow
    assignableAdmins: AssignableAdmin[]
    onUpdate: () => void
}) {
    const [isPending, startTransition] = useTransition()
    const [expanded, setExpanded] = useState(false)
    const [comments, setComments] = useState<InboundEmailComment[]>([])
    const [commentsLoaded, setCommentsLoaded] = useState(false)
    const [newComment, setNewComment] = useState("")
    const [commentMsg, setCommentMsg] = useState<string | null>(null)

    function loadComments() {
        if (commentsLoaded) return
        startTransition(async () => {
            const result = await getInboundEmailComments(email.id)
            if (result.status) {
                setComments(result.comments)
                setCommentsLoaded(true)
            }
        })
    }

    function handleToggle(open: boolean) {
        setExpanded(open)
        if (open) loadComments()
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
                const updated = await getInboundEmailComments(email.id)
                if (updated.status) setComments(updated.comments)
                setCommentMsg(null)
            } else {
                setCommentMsg(result.message)
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
                            <p className="mt-1 truncate text-sm font-medium">
                                {email.subject}
                            </p>
                            <p className="truncate text-muted-foreground text-sm">
                                <span className="font-medium text-foreground">
                                    From:{" "}
                                </span>
                                <a
                                    href={`mailto:${email.from_address}`}
                                    className="underline hover:no-underline"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {email.from_name
                                        ? `${email.from_name} <${email.from_address}>`
                                        : email.from_address}
                                </a>
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
                                <a
                                    href={`mailto:${email.from_address}`}
                                    className="underline hover:no-underline"
                                >
                                    {email.from_name
                                        ? `${email.from_name} <${email.from_address}>`
                                        : email.from_address}
                                </a>
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
                        <div className="text-sm">
                            <p className="font-medium text-muted-foreground">
                                Body
                            </p>
                            {email.body_html ? (
                                <div
                                    className="prose prose-sm dark:prose-invert mt-1 max-w-none rounded-md border bg-background p-3"
                                    dangerouslySetInnerHTML={{
                                        __html: email.body_html
                                    }}
                                />
                            ) : (
                                <p className="mt-1 whitespace-pre-wrap">
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

                        {/* Comments */}
                        <div className="space-y-3 border-t pt-2">
                            <p className="font-medium text-sm">
                                Internal Comments
                            </p>

                            {comments.length === 0 && commentsLoaded && (
                                <p className="text-muted-foreground text-sm">
                                    No comments yet.
                                </p>
                            )}

                            {comments.map((c) => (
                                <div
                                    key={c.id}
                                    className="rounded-md border bg-muted/30 p-3 text-sm"
                                >
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="font-medium">
                                            {c.author_name}
                                        </span>
                                        <span className="text-muted-foreground text-xs">
                                            {formatDate(c.created_at)}
                                        </span>
                                    </div>
                                    <p className="whitespace-pre-wrap text-foreground">
                                        {c.content}
                                    </p>
                                </div>
                            ))}

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

function EmailSection({
    title,
    emails,
    assignableAdmins,
    defaultOpen,
    onUpdate
}: {
    title: string
    emails: InboundEmailRow[]
    assignableAdmins: AssignableAdmin[]
    defaultOpen: boolean
    onUpdate: () => void
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
    assignableAdmins
}: {
    initialEmails: InboundEmailRow[]
    assignableAdmins: AssignableAdmin[]
}) {
    const [emails, setEmails] = useState(initialEmails)
    const [_isRefreshing, startRefresh] = useTransition()

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
            />
            <EmailSection
                title="Active Emails"
                emails={activeEmails}
                assignableAdmins={assignableAdmins}
                defaultOpen={true}
                onUpdate={refresh}
            />
            <EmailSection
                title="Closed Emails"
                emails={closedEmails}
                assignableAdmins={assignableAdmins}
                defaultOpen={false}
                onUpdate={refresh}
            />
        </div>
    )
}
