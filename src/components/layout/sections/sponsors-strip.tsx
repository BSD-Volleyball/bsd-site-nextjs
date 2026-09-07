import Link from "next/link"
import { formatSeasonLabel, getSeasonConfig } from "@/lib/site-config"
import { getPublicSponsors } from "@/lib/sponsors"

function SponsorLogo({
    sponsor
}: {
    sponsor: { name: string; logoUrl: string | null }
}) {
    return sponsor.logoUrl ? (
        <img
            src={sponsor.logoUrl}
            alt={`${sponsor.name} logo`}
            className="h-16 w-auto max-w-[180px] object-contain"
            loading="lazy"
        />
    ) : (
        <span className="font-semibold text-lg text-muted-foreground">
            {sponsor.name}
        </span>
    )
}

/**
 * Homepage logo row for the current season's paid sponsors. Renders nothing
 * until at least one sponsorship is paid, so an empty season leaves no gap.
 */
export async function SponsorsStrip() {
    const config = await getSeasonConfig()
    if (!config.seasonId) return null
    const sponsors = await getPublicSponsors(config.seasonId)
    if (sponsors.length === 0) return null

    const seasonLabel = formatSeasonLabel(config)

    return (
        <section className="border-border border-t py-16">
            <div className="container mx-auto px-4">
                <div className="mx-auto max-w-5xl text-center">
                    <p className="mb-2 font-semibold text-primary text-sm uppercase tracking-wider">
                        Thanks to our {seasonLabel} sponsors
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-8">
                        {sponsors.map((sponsor) =>
                            sponsor.website ? (
                                <a
                                    key={sponsor.id}
                                    href={sponsor.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={sponsor.name}
                                    className="opacity-80 transition-opacity hover:opacity-100"
                                >
                                    <SponsorLogo sponsor={sponsor} />
                                </a>
                            ) : (
                                <Link
                                    key={sponsor.id}
                                    href="/sponsors"
                                    title={sponsor.name}
                                    className="opacity-80 transition-opacity hover:opacity-100"
                                >
                                    <SponsorLogo sponsor={sponsor} />
                                </Link>
                            )
                        )}
                    </div>
                    <Link
                        href="/sponsors"
                        className="mt-8 inline-block text-muted-foreground text-sm underline-offset-4 hover:underline"
                    >
                        Meet all our sponsors →
                    </Link>
                </div>
            </div>
        </section>
    )
}
