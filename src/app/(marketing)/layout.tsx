import { Navbar } from "@/components/layout/navbar"
import { FooterSection } from "@/components/layout/sections/footer"
import { formatSeasonLabel } from "@/lib/site-config"
import { getCachedSeasonConfig } from "@/next/public-cache"

// The navbar/footer season label is read through the shared public cache
// (one DB read an hour for every marketing page together). Revalidate hourly
// so marketing pages pick up a season change without a redeploy;
// season-affecting mutations also revalidate the cache tag and paths.
export const revalidate = 3600

export default async function MarketingLayout({
    children
}: {
    children: React.ReactNode
}) {
    const config = await getCachedSeasonConfig()
    const seasonLabel = formatSeasonLabel(config)

    return (
        <>
            <Navbar seasonLabel={seasonLabel} />
            {children}
            <FooterSection />
        </>
    )
}
