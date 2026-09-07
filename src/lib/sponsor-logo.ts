/**
 * sponsor-logo.ts — object-key and path helpers for sponsor logos.
 *
 * Logos live in the same R2 bucket as player pictures under a separate
 * prefix, and are served through PLAYER_PIC_URL via buildPlayerPictureUrl().
 * Client-safe: no server-only imports.
 */

const SPONSOR_LOGO_OBJECT_PREFIX = "sponsorlogos"

// 2 MB — logos are small; the t-shirt printer gets the source file
// separately, so the web copy never needs to be print resolution.
export const SPONSOR_LOGO_MAX_BYTES = 2 * 1024 * 1024

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/webp": "webp"
}

export const SPONSOR_LOGO_ACCEPT = Object.keys(EXTENSION_BY_CONTENT_TYPE).join(
    ","
)

export function getSponsorLogoExtension(contentType: string): string | null {
    return EXTENSION_BY_CONTENT_TYPE[contentType] ?? null
}

/** `<sponsorId>-<nonce>.<ext>` — the nonce busts CDN caches on replacement. */
export function buildSponsorLogoFilename(
    sponsorId: number,
    extension: string,
    nonce: number = Date.now()
): string {
    return `${sponsorId}-${nonce}.${extension}`
}

const FILENAME_PATTERN = /^(\d+)-(\d+)\.(png|jpg|svg|webp)$/

/**
 * Finalize receives the filename back from the browser, so it must be
 * re-validated: right sponsor, allowed extension, no path segments.
 */
export function isSponsorLogoFilenameFor(
    sponsorId: number,
    filename: string
): boolean {
    const match = FILENAME_PATTERN.exec(filename)
    return match !== null && Number(match[1]) === sponsorId
}

export function getSponsorLogoObjectKey(filename: string): string {
    return `${SPONSOR_LOGO_OBJECT_PREFIX}/${filename}`
}

export function getSponsorLogoDbPath(filename: string): string {
    return `/${getSponsorLogoObjectKey(filename)}`
}

export function objectKeyFromLogoPath(logoPath: string): string {
    return logoPath.startsWith("/") ? logoPath.slice(1) : logoPath
}
