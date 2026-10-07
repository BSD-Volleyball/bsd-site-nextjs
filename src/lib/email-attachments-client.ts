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
 * Point `src="cid:..."` (and a leading `srcset="cid:..."`) references in an HTML email body at our download
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
        /(src(?:set)?\s*=\s*["']?)cid:([^"'\s>,]+)/gi,
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

/**
 * Media and vector containers have no place in a support email and each
 * carries its own remote-fetch attributes, so they are dropped outright.
 */
const REMOTE_MEDIA_TAGS = new Set([
    "picture",
    "source",
    "video",
    "audio",
    "svg",
    "image",
    "use",
    "input"
])

/**
 * Resolve CSS backslash escapes (`\72 ` -> "r", `\(` -> "("), for deciding
 * whether a dropped style would have fetched something.
 */
function cssUnescape(value: string): string {
    return value
        .replace(/\\([0-9a-f]{1,6})\s?/gi, (_m, hex: string) => {
            const code = Number.parseInt(hex, 16)
            return code > 0 && code <= 0x10ffff
                ? String.fromCodePoint(code)
                : "\ufffd"
        })
        .replace(/\\(.)/g, "$1")
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
 *  - blocks every remote fetch a browser would make on render (img/srcset/
 *    poster/svg image/CSS url()) unless `allowRemoteImages`, because they are
 *    how senders learn that, when and from where staff opened their mail. Inline
 *    (cid:) images are rewritten to our own route first and always load.
 * Returns the HTML and how many remote images were held back.
 */
export function sanitizeInboundEmailHtml(
    html: string,
    attachments: AttachmentRef[],
    { allowRemoteImages = false }: { allowRemoteImages?: boolean } = {}
): { html: string; blockedImages: number } {
    let blockedImages = 0
    /** Attributes a browser fetches on render. `src` on IMG is the common case. */
    const URL_ATTRS = ["src", "srcset", "poster", "href", "xlink:href", "data"]
    const CSS_URL = /\b(url|image-set)\s*\(/i
    const isOurs = (value: string) =>
        value.trim().startsWith("/api/email-attachments/")

    DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
        if (data.attrName === "style") {
            // CSS resolves backslash escapes inside identifiers (u\72 l( is
            // url(, posit\69 on is position), so no text check below can be
            // trusted on a value that has one. Mail clients do not write
            // them; drop the whole style.
            if (data.attrValue.includes("\\")) {
                data.keepAttr = false
                if (
                    !allowRemoteImages &&
                    CSS_URL.test(cssUnescape(data.attrValue))
                ) {
                    blockedImages++
                }
            } else if (ESCAPING_CSS.test(data.attrValue)) {
                data.keepAttr = false
            } else if (!allowRemoteImages && CSS_URL.test(data.attrValue)) {
                data.keepAttr = false
                blockedImages++
            }
        }
    })
    /** URL attributes on `node` that point somewhere other than our route. */
    const remoteUrlAttrs = (node: Element): string[] =>
        URL_ATTRS.filter((attr) => {
            const value = node.getAttribute(attr)
            if (value === null || value === "") return false
            // srcset lists several candidates; every one must be ours.
            const candidates =
                attr === "srcset"
                    ? value.split(",").map((c) => c.trim().split(/\s+/)[0])
                    : [value]
            return !candidates.every(isOurs)
        })

    // Media and vector elements are forbidden outright (FORBID_TAGS below),
    // so the attribute hook never sees them; count the ones that would have
    // fetched something, so the "held back" figure stays honest. (Duck-typed:
    // on the server isomorphic-dompurify runs in jsdom, with no global
    // Element to test against.)
    DOMPurify.addHook("uponSanitizeElement", (node, data) => {
        if (allowRemoteImages || !REMOTE_MEDIA_TAGS.has(data.tagName)) return
        if (!("getAttribute" in node)) return
        const element = node as Element
        // A forbidden <svg> is discarded with its whole subtree, so its
        // children (<image href>, <use href>) never reach this hook.
        const subtree =
            data.tagName === "svg"
                ? [element, ...element.querySelectorAll("*")]
                : [element]
        if (subtree.some((el) => remoteUrlAttrs(el).length > 0)) {
            blockedImages++
        }
    })
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (allowRemoteImages) return
        // Anchors keep their href: a link is only fetched on click, and
        // staff need to see where a sender is pointing them.
        if (node.nodeName === "A") return
        const remote = remoteUrlAttrs(node)
        for (const attr of remote) node.removeAttribute(attr)
        if (remote.length > 0) blockedImages++
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
                "base",
                ...REMOTE_MEDIA_TAGS
            ],
            FORBID_ATTR: ["formaction", "background"]
        })
        return { html: clean, blockedImages }
    } finally {
        DOMPurify.removeHook("uponSanitizeAttribute")
        DOMPurify.removeHook("uponSanitizeElement")
        DOMPurify.removeHook("afterSanitizeAttributes")
    }
}
