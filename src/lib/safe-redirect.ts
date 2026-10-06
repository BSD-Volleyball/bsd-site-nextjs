/**
 * Turn a redirect target that may have come from a query string (for example
 * better-auth-ui's ?redirectTo=) into a same-origin path, or the fallback.
 *
 * Accepts a path beginning with a single "/", or an absolute URL on
 * `origin`, which is reduced to its path. Rejects everything else,
 * including protocol-relative "//evil.example" and "/\evil.example", which
 * browsers treat as another host, and any javascript: or data: URL.
 */
export function safeRedirectPath(
    target: string | null | undefined,
    origin: string,
    fallback = "/dashboard"
): string {
    if (!target) return fallback
    // Control characters (tab, newline) are stripped by URL parsers, so
    // "/\t/evil.example" would otherwise become protocol-relative.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
    if (/[\u0000-\u001f\u007f]/.test(target)) return fallback

    let url: URL
    try {
        url = new URL(target, origin)
    } catch {
        return fallback
    }
    if (url.origin !== new URL(origin).origin) return fallback
    if (target.startsWith("/") && /^\/[/\\]/.test(target)) return fallback

    return `${url.pathname}${url.search}${url.hash}`
}
