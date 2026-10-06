import DOMPurify from "isomorphic-dompurify"

/**
 * Client-safe helpers for rendering email attachments. Kept separate from
 * `email-attachments.ts`, which is server-only.
 */

interface AttachmentRef {
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

/** CSS that can lift content out of its box and over the app's own UI. */
const ESCAPING_CSS = /\b(position|z-index)\s*:/i

/**
 * Sanitize an inbound email's HTML for display inside the staff dashboard.
 * The sender is anyone on the internet and the result renders on our origin,
 * so beyond DOMPurify's defaults (no scripts, no event handlers, no
 * javascript: URLs) this:
 *  - drops active and layout-hijacking tags (style, form, iframe, …);
 *  - drops inline styles that position content, which could float a fake
 *    "sign in again" panel over the real UI, while keeping colors and fonts;
 *  - blocks remote images unless `allowRemoteImages`, because they are how
 *    senders learn that, when and from where staff opened their mail. Inline
 *    (cid:) images are rewritten to our own route first and always load.
 * Returns the HTML and how many remote images were held back.
 */
export function sanitizeInboundEmailHtml(
    html: string,
    attachments: AttachmentRef[],
    { allowRemoteImages = false }: { allowRemoteImages?: boolean } = {}
): { html: string; blockedImages: number } {
    let blockedImages = 0
    DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
        if (data.attrName === "style" && ESCAPING_CSS.test(data.attrValue)) {
            data.keepAttr = false
        }
    })
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.nodeName !== "IMG" || allowRemoteImages) return
        const src = node.getAttribute("src") ?? ""
        if (src && !src.startsWith("/api/email-attachments/")) {
            node.removeAttribute("src")
            node.removeAttribute("srcset")
            blockedImages++
        }
    })
    try {
        const clean = DOMPurify.sanitize(rewriteCidImages(html, attachments), {
            FORBID_TAGS: [
                "style",
                "iframe",
                "object",
                "embed",
                "form",
                "link",
                "meta",
                "base"
            ],
            FORBID_ATTR: ["formaction", "background"]
        })
        return { html: clean, blockedImages }
    } finally {
        DOMPurify.removeHook("uponSanitizeAttribute")
        DOMPurify.removeHook("afterSanitizeAttributes")
    }
}
