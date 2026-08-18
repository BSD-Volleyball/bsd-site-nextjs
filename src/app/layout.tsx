import { Providers } from "./providers"
import type { ReactNode } from "react"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import type { Metadata } from "next"
import { IBM_Plex_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google"
import { site } from "@/config/site"
import { cn } from "@/lib/utils"
import "@/styles/globals.css"

// Body/UI face: Inter (high x-height, built for 14–16px screen text).
const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap"
})

// Heading/brand face: Plus Jakarta Sans (applied to h1–h4 and CardTitle).
const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    variable: "--font-jakarta",
    display: "swap"
})

const plexMono = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: ["400", "500", "700"],
    variable: "--font-plex-mono",
    display: "swap"
})

export const metadata: Metadata = {
    metadataBase: new URL(site.url),
    title: {
        default: site.name,
        template: `%s | ${site.shortName} Volleyball`
    },
    description: site.description,
    openGraph: {
        type: "website",
        url: site.url,
        title: site.name,
        description: site.description,
        images: [
            { url: site.ogImage, width: 1200, height: 750, alt: site.name }
        ]
    },
    twitter: {
        card: "summary_large_image",
        title: site.name,
        description: site.description,
        images: [
            { url: site.ogImage, width: 1200, height: 750, alt: site.name }
        ]
    }
}

export default function RootLayout({
    children
}: Readonly<{
    children: ReactNode
}>) {
    return (
        <html
            lang="en"
            className={cn(inter.variable, jakarta.variable, plexMono.variable)}
            suppressHydrationWarning
        >
            <body className="flex min-h-svh flex-col antialiased">
                <Providers>{children}</Providers>
                <Analytics />
                <SpeedInsights />
            </body>
        </html>
    )
}
