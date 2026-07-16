import { Navbar } from "@/components/layout/navbar"
import { FooterSection } from "@/components/layout/sections/footer"
import { getSeasonConfig, formatSeasonLabel } from "@/lib/site-config"

// The navbar/footer season label is read from the DB. Revalidate hourly so
// marketing pages pick up a season change without a redeploy; season-affecting
// mutations also call revalidatePath for an immediate refresh.
export const revalidate = 3600

export default async function MarketingLayout({
    children
}: {
    children: React.ReactNode
}) {
    const config = await getSeasonConfig()
    const seasonLabel = formatSeasonLabel(config)

    return (
        <>
            <Navbar seasonLabel={seasonLabel} />
            {children}
            <FooterSection />
        </>
    )
}
