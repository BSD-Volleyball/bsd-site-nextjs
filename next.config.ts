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
                headers: [...securityHeaders]
            }
        ]
    }
}

export default withBotId(nextConfig)
