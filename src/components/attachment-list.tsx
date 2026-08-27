import { RiAttachment2 } from "@remixicon/react"
import type { AttachmentMeta } from "@/lib/email-attachments"
import {
    attachmentDownloadUrl,
    formatFileSize
} from "@/lib/email-attachments-client"
import { cn } from "@/lib/utils"

/**
 * Chips for the files attached to an inbound message. Each links to the
 * authorised download route; nothing is served from a public bucket URL.
 */
export function AttachmentList({
    attachments,
    className
}: {
    attachments: AttachmentMeta[]
    className?: string
}) {
    if (attachments.length === 0) return null

    return (
        <ul className={cn("mt-2 flex flex-wrap gap-2", className)}>
            {attachments.map((attachment) => (
                <li key={attachment.id}>
                    <a
                        href={attachmentDownloadUrl(attachment.id)}
                        download={attachment.filename}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted"
                        title={`${attachment.filename} (${attachment.content_type})`}
                    >
                        <RiAttachment2 size={14} className="shrink-0" />
                        <span className="truncate">{attachment.filename}</span>
                        <span className="shrink-0 text-muted-foreground">
                            {formatFileSize(attachment.size_bytes)}
                        </span>
                    </a>
                </li>
            ))}
        </ul>
    )
}
