"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
    addInboundEmailComment,
    assignInboundEmail,
    closeInboundEmail,
    getEmailThread,
    markInboundEmailAsSpam,
    quickReplyInboundEmail,
    reopenInboundEmail,
    sendEmailReply,
    sendEmailReplyAndAssign,
    sendEmailReplyAndClose,
    unmarkInboundEmailAsSpam,
    type ThreadItem,
    type InboundEmailRow
} from "./actions"
import type { AssignableAdmin } from "./data"
import { EmailCardSummary, EmailMetadata, OriginalEmail } from "./email-display"
import { EmailStatusControls } from "./email-status-controls"
import { ThreadItems } from "./email-thread"
import { InternalNoteComposer, ReplyComposer } from "./email-composers"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { sanitizeInboundEmailHtml } from "@/lib/email-attachments-client"

/**
 * One inbound email. All of the card's state lives here rather than in the
 * sub-components: the expanded body unmounts when the card collapses, and
 * drafts, messages and the remote-image choice must survive that.
 */
export function EmailCard({
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
    const [showRemoteImages, setShowRemoteImages] = useState(false)
    // Memoized: the card re-renders on every keystroke in its reply box.
    const body = useMemo(
        () =>
            email.body_html
                ? sanitizeInboundEmailHtml(email.body_html, email.attachments, {
                      allowRemoteImages: showRemoteImages
                  })
                : null,
        [email.body_html, email.attachments, showRemoteImages]
    )
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

    // New emails only: claim and reply, keeping the conversation open. The
    // email moves to Active, so follow it there the same way "Assign to Me"
    // does.
    function handleSendReplyAndAssign() {
        if (!replyBody.trim()) return
        setReplyMsg(null)
        startTransition(async () => {
            const result = await sendEmailReplyAndAssign(email.id, replyBody)
            if (result.status) {
                setReplyBody("")
                onUpdate()
                onFocusEmail(email.id)
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
                        <EmailCardSummary
                            email={email}
                            expanded={expanded}
                            onPlayerClick={onPlayerClick}
                        />
                    </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="space-y-4 border-t px-4 pt-4 pb-4">
                        <EmailMetadata
                            email={email}
                            onPlayerClick={onPlayerClick}
                        />

                        <OriginalEmail
                            email={email}
                            body={body}
                            onLoadImages={() => setShowRemoteImages(true)}
                        />

                        <EmailStatusControls
                            email={email}
                            assignableAdmins={assignableAdmins}
                            currentUserId={currentUserId}
                            isPending={isPending}
                            onAssignChange={handleAssignChange}
                            onAssignToMe={handleAssignToMe}
                            onClose={handleClose}
                            onReopen={handleReopen}
                            onMarkSpam={handleMarkSpam}
                            onUnmarkSpam={handleUnmarkSpam}
                        />

                        {assignMsg && (
                            <p className="text-destructive text-sm">
                                {assignMsg}
                            </p>
                        )}

                        {/* Thread: replies + internal comments (chronological) */}
                        <div className="space-y-3 border-t pt-2">
                            <p className="font-medium text-sm">Thread</p>

                            <ThreadItems
                                items={threadItems}
                                loaded={threadLoaded}
                            />

                            {/* Reply composer — active emails only */}
                            {email.status === "active" && (
                                <ReplyComposer
                                    heading={
                                        <>
                                            Send Reply to{" "}
                                            {email.from_name ??
                                                email.from_address}
                                        </>
                                    }
                                    textareaRef={replyRef}
                                    value={replyBody}
                                    onChange={setReplyBody}
                                    error={replyMsg}
                                    isPending={isPending}
                                    primaryLabel="Send Reply"
                                    onPrimary={handleSendReply}
                                    secondaryLabel="Send & Close"
                                    onSecondary={handleSendReplyAndClose}
                                />
                            )}

                            {/* Quick reply — new emails only: assign to me,
                                send, and close in one step */}
                            {email.status === "new" && (
                                <ReplyComposer
                                    heading={
                                        <>
                                            Quick Reply to{" "}
                                            {email.from_name ??
                                                email.from_address}
                                        </>
                                    }
                                    description="Assigns the email to you and sends the reply — optionally closing it too."
                                    value={replyBody}
                                    onChange={setReplyBody}
                                    error={replyMsg}
                                    isPending={isPending}
                                    primaryLabel="Send & Assign to Me"
                                    onPrimary={handleSendReplyAndAssign}
                                    secondaryLabel="Send, Assign to Me & Close"
                                    onSecondary={handleQuickReply}
                                />
                            )}

                            <InternalNoteComposer
                                value={newComment}
                                onChange={setNewComment}
                                error={commentMsg}
                                isPending={isPending}
                                onSubmit={handleAddComment}
                            />
                        </div>
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}
