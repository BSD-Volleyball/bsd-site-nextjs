/**
 * Client-safe helpers for rendering email attachments. Kept separate from
 * `email-attachments.ts`, which is server-only.
 */

export interface AttachmentRef {
    id: number
    content_id: string | null
}

export function attachmentDownloadUrl(id: number, inline = false): string {
    return `/api/email-attachments/${id}${inline ? "?inline=1" : ""}`
}

/**
 * Point `src="cid:..."` references in an HTML email body at our download
 * route so inline images (signatures, pasted screenshots) render instead of
 * showing as broken. Mail clients wrap the Content-ID in angle brackets in
 * the MIME header but not in the `cid:` URL, so both forms are matched.
 */
export function rewriteCidImages(
    html: string,
    attachments: AttachmentRef[]
): string {
    const byCid = new Map<string, number>()
    for (const attachment of attachments) {
        if (!attachment.content_id) continue
        byCid.set(attachment.content_id.replace(/^<|>$/g, ""), attachment.id)
    }
    if (byCid.size === 0) return html

    return html.replace(
        /(src\s*=\s*["']?)cid:([^"'\s>]+)/gi,
        (match, prefix: string, cid: string) => {
            const id = byCid.get(decodeURIComponent(cid))
            return id === undefined
                ? match
                : `${prefix}${attachmentDownloadUrl(id, true)}`
        }
    )
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
