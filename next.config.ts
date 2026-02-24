import type { NextConfig } from "next"
import { withBotId } from "botid/next/config"

const nextConfig: NextConfig = {
    /* config options here */
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "images.unsplash.com"
            }
        ]
    }
}

export default withBotId(nextConfig)
