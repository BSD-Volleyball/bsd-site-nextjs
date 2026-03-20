"use client"

export async function copyRichHtmlToClipboard(
    html: string,
    plainText: string
): Promise<boolean> {
    if (
        typeof ClipboardItem !== "undefined" &&
        typeof navigator !== "undefined" &&
        navigator.clipboard?.write
    ) {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([plainText], {
                        type: "text/plain"
                    })
                })
            ])
            return true
        } catch {
            // Fall through to the DOM-based fallback below.
        }
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
        return false
    }

    const selection = window.getSelection()
    if (!selection) return false

    const container = document.createElement("div")
    container.contentEditable = "true"
    container.setAttribute("aria-hidden", "true")
    container.style.position = "fixed"
    container.style.left = "-9999px"
    container.style.top = "0"
    container.innerHTML = html
    document.body.appendChild(container)

    const range = document.createRange()
    range.selectNodeContents(container)
    selection.removeAllRanges()
    selection.addRange(range)

    try {
        const copied = document.execCommand("copy")
        if (copied) {
            return true
        }
    } catch {
        // Ignore and fall back to plain text below.
    } finally {
        selection.removeAllRanges()
        document.body.removeChild(container)
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(plainText)
            return true
        } catch {
            return false
        }
    }

    return false
}
