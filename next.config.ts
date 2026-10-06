import type { NextConfig } from "next"
import { withBotId } from "botid/next/config"

const securityHeaders = [
    {
        key: "X-Frame-Options",
        value: "DENY"
    },
    {
        key: "X-Content-Type-Options",
        value: "nosniff"
    },
    {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin"
    },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()"
    },
    {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload"
    }
] as const

/**
 * Content-Security-Policy, in Report-Only mode until a crawl of the key pages
 * (payments, live draft, uploads) shows no violations; then it is enforced.
 * Third parties: Square Web Payments (script, API, 3-D Secure frames),
 * Liveblocks (live draft), R2 (presigned uploads go browser → R2 directly)
 * and Vercel Analytics. 'unsafe-inline' scripts are required by Next's inline
 * bootstrap on statically rendered pages, which cannot carry a nonce.
 * img-src allows any https image because staff can choose to load the
 * remote images in an inbound email.
 */
const contentSecurityPolicy = [
    "default-src 'self'",
    [
        "script-src 'self' 'unsafe-inline'",
        "https://web.squarecdn.com https://sandbox.web.squarecdn.com",
        "https://va.vercel-scripts.com",
        process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""
    ].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://*.squarecdn.com",
    [
        "connect-src 'self'",
        "https://*.squareup.com https://*.squareupsandbox.com https://*.squarecdn.com",
        "https://*.liveblocks.io wss://*.liveblocks.io",
        "https://*.r2.cloudflarestorage.com",
        "https://vitals.vercel-insights.com https://va.vercel-scripts.com"
    ].join(" "),
    "frame-src https://*.squarecdn.com https://*.squareup.com https://*.squareupsandbox.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
].join("; ")

// Parse PLAYER_PIC_URL to extract hostname for next/image remotePatterns
const playerPicRemotePattern = (() => {
    const url = process.env.PLAYER_PIC_URL
    if (!url) return null
    try {
        const { hostname, protocol } = new URL(url)
        return {
            protocol: protocol.replace(":", "") as "https" | "http",
            hostname
        }
    } catch {
        return null
    }
})()

const nextConfig: NextConfig = {
    /* config options here */
    images: {
        minimumCacheTTL: 31536000,
        remotePatterns: [
            // Cloudflare R2 default public bucket domains
            { protocol: "https", hostname: "*.r2.dev" },
            { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
            // Dynamic pattern from PLAYER_PIC_URL env var if set
            ...(playerPicRemotePattern ? [playerPicRemotePattern] : [])
        ]
    },
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    ...securityHeaders,
                    {
                        key: "Content-Security-Policy-Report-Only",
                        value: contentSecurityPolicy
                    }
                ]
            }
        ]
    },
    async redirects() {
        return [
            {
                // Legacy season-specific URL; the page is now season-agnostic.
                source: "/spring-2026-season-info",
                destination: "/season-info",
                permanent: true
            }
        ]
    }
}

export default withBotId(nextConfig)
