"use client"

import type { ThreadItem } from "./actions"
import { MessageBody } from "./email-display"
import { AttachmentList } from "@/components/attachment-list"
import { formatTimestamp } from "@/lib/date-utils"

/** Replies, received follow-ups and internal comments, in chronological order. */
export function ThreadItems({
    items,
    loaded
}: {
    items: ThreadItem[]
    loaded: boolean
}) {
    return (
        <>
            {items.length === 0 && loaded && (
                <p className="text-muted-foreground text-sm">
                    No activity yet.
                </p>
            )}

            {items.map((item) =>
                item.type === "reply" ? (
                    <div
                        key={`reply-${item.id}`}
                        className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/40"
                    >
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-medium text-blue-800 dark:text-blue-200">
                                ↪ Reply sent by {item.sent_by_name}
                            </span>
                            <span className="text-muted-foreground text-sm">
                                {formatTimestamp(item.sent_at)}
                            </span>
                        </div>
                        <p className="mb-1 text-muted-foreground text-sm">
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
                                {item.from_name ?? item.from_address}
                            </span>
                            <span className="text-muted-foreground text-sm">
                                {formatTimestamp(item.received_at)}
                            </span>
                        </div>
                        <p className="mb-1 text-muted-foreground text-sm">
                            Subject: {item.subject}
                        </p>
                        <MessageBody text={item.body_text ?? "(No body)"} />
                        <AttachmentList attachments={item.attachments} />
                    </div>
                ) : (
                    <div
                        key={`comment-${item.id}`}
                        className="rounded-md border bg-muted/30 p-3 text-sm"
                    >
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-medium">
                                🔒 {item.author_name}
                                <span className="ml-1 font-normal text-muted-foreground text-sm">
                                    (internal)
                                </span>
                            </span>
                            <span className="text-muted-foreground text-sm">
                                {formatTimestamp(item.created_at)}
                            </span>
                        </div>
                        <p className="whitespace-pre-wrap text-foreground">
                            {item.content}
                        </p>
                    </div>
                )
            )}
        </>
    )
}
