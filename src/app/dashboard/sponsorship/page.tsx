import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { formatSeasonLabel, getSeasonConfig } from "@/lib/site-config"
import { getSponsorshipForUser } from "@/lib/sponsors"
import { SponsorshipView } from "./sponsorship-view"

export const metadata: Metadata = {
    title: "Your Sponsorship"
}

export const dynamic = "force-dynamic"

export default async function SponsorshipPage() {
    const session = await requireSessionOrRedirect()
    const config = await getSeasonConfig()
    if (!config.seasonId) redirect("/dashboard")

    const sponsorship = await getSponsorshipForUser(
        session.user.id,
        config.seasonId
    )
    // Only sponsor contacts have anything to see here.
    if (!sponsorship) redirect("/dashboard")

    const seasonLabel = formatSeasonLabel(config)

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${sponsorship.name} — ${seasonLabel} Sponsorship`}
                description={
                    sponsorship.status === "paid"
                        ? "Thank you for sponsoring the league! Keep your business details and logo up to date below."
                        : `Pay your $${sponsorship.amount} sponsorship by card and tell us how to show your business on the site and the championship t-shirt.`
                }
            />
            <SponsorshipView
                sponsorship={sponsorship}
                seasonLabel={seasonLabel}
                squareAppId={process.env.NEXT_PUBLIC_SQUARE_APP_ID || ""}
                squareLocationId={
                    process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || ""
                }
            />
        </div>
    )
}
