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

const nextConfig: NextConfig = {
    /* config options here */
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "images.unsplash.com"
            }
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
