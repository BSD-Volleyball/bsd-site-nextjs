"use client"

import { useState } from "react"
import {
    RiArrowDownSLine,
    RiArrowRightSLine,
    RiAttachment2
} from "@remixicon/react"
import type { InboundEmailRow } from "./actions"
import { Badge } from "@/components/ui/badge"
import { AttachmentList } from "@/components/attachment-list"
import type { sanitizeInboundEmailHtml } from "@/lib/email-attachments-client"
import { formatTimestamp } from "@/lib/date-utils"
import { cn } from "@/lib/utils"

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

export function MessageBody({ text }: { text: string }) {
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
                        className="mt-1 text-muted-foreground text-sm underline hover:text-foreground"
                    >
                        {showQuoted ? "Hide Quoted Text" : "Show Quoted Text"}
                    </button>
                    {showQuoted && (
                        <p className="mt-1 whitespace-pre-wrap border-muted-foreground/30 border-l-2 pl-2 text-muted-foreground text-sm">
                            {quoted}
                        </p>
                    )}
                </>
            )}
        </>
    )
}

/** Renders sender name (optionally as a player-detail link) + email as mailto */
export function FromDisplay({
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

export function StatusBadge({ status }: { status: string }) {
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

/** The always-visible summary row inside the card's collapsible trigger. */
export function EmailCardSummary({
    email,
    expanded,
    onPlayerClick
}: {
    email: InboundEmailRow
    expanded: boolean
    onPlayerClick: (userId: string) => void
}) {
    return (
        <>
            <div className="mt-0.5 shrink-0 text-muted-foreground">
                {expanded ? (
                    <RiArrowDownSLine size={18} />
                ) : (
                    <RiArrowRightSLine size={18} />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">#{email.id}</span>
                    <StatusBadge status={email.status} />
                    <Badge variant="outline" className="text-xs">
                        Email
                    </Badge>
                    {email.attachments.length > 0 && (
                        <Badge
                            variant="outline"
                            className="gap-1 text-xs"
                            title={`${email.attachments.length} attachment(s)`}
                        >
                            <RiAttachment2 size={12} />
                            {email.attachments.length}
                        </Badge>
                    )}
                </div>
                <p className="mt-1 truncate font-medium text-sm">
                    {email.subject}
                </p>
                <p className="truncate text-muted-foreground text-sm">
                    <span className="font-medium text-foreground">From: </span>
                    <FromDisplay
                        name={email.from_name}
                        email={email.from_address}
                        userId={email.from_user_id}
                        subject={email.subject}
                        onPlayerClick={onPlayerClick}
                    />
                </p>
            </div>
            <div className="shrink-0 text-right text-muted-foreground text-sm">
                <div>{formatTimestamp(email.created_at)}</div>
                {email.assigned_to_name && (
                    <div className="mt-0.5">
                        Assigned: {email.assigned_to_name}
                    </div>
                )}
            </div>
        </>
    )
}

export function EmailMetadata({
    email,
    onPlayerClick
}: {
    email: InboundEmailRow
    onPlayerClick: (userId: string) => void
}) {
    return (
        <div className="grid gap-3 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-2">
            <div>
                <p className="font-medium text-muted-foreground">From</p>
                <FromDisplay
                    name={email.from_name}
                    email={email.from_address}
                    userId={email.from_user_id}
                    subject={email.subject}
                    onPlayerClick={onPlayerClick}
                />
            </div>
            <div>
                <p className="font-medium text-muted-foreground">To</p>
                <p>{email.to_address}</p>
            </div>
            <div className="sm:col-span-2">
                <p className="font-medium text-muted-foreground">Subject</p>
                <p>{email.subject}</p>
            </div>
        </div>
    )
}

/**
 * The original inbound message. `body` is the output of
 * sanitizeInboundEmailHtml (null for a text-only email); the card owns that
 * call so its memo and the remote-image toggle survive collapsing.
 */
export function OriginalEmail({
    email,
    body,
    onLoadImages
}: {
    email: InboundEmailRow
    body: ReturnType<typeof sanitizeInboundEmailHtml> | null
    onLoadImages: () => void
}) {
    return (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-950/40">
            <p className="mb-1 font-medium text-green-800 dark:text-green-200">
                Original Email
            </p>
            {body ? (
                <>
                    {body.blockedImages > 0 && (
                        <button
                            type="button"
                            className="mt-1 text-muted-foreground text-xs underline"
                            onClick={onLoadImages}
                        >
                            {body.blockedImages} remote{" "}
                            {body.blockedImages === 1 ? "image" : "images"}{" "}
                            blocked to protect your privacy. Load images
                        </button>
                    )}
                    <div
                        className="prose prose-sm dark:prose-invert mt-1 max-w-none"
                        // Sanitized: see sanitizeInboundEmailHtml.
                        dangerouslySetInnerHTML={{
                            __html: body.html
                        }}
                    />
                </>
            ) : (
                <p className="mt-1 whitespace-pre-wrap text-foreground">
                    {email.body_text || "(No body)"}
                </p>
            )}
            <AttachmentList attachments={email.attachments} />
        </div>
    )
}
