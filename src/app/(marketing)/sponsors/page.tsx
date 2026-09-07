import Link from "next/link"
import { RiExternalLinkLine, RiMailLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { site } from "@/config/site"
import { formatSeasonLabel, getSeasonConfig } from "@/lib/site-config"
import { getPublicSponsors } from "@/lib/sponsors"

export const metadata = {
    title: `Our Sponsors - ${site.name}`,
    description:
        "The local businesses that support Bump Set Drink Volleyball each season."
}

// Matches the marketing layout; sponsor mutations also revalidate this path.
export const revalidate = 3600

export default async function SponsorsPage() {
    const config = await getSeasonConfig()
    const seasonLabel = formatSeasonLabel(config)
    const sponsors = config.seasonId
        ? await getPublicSponsors(config.seasonId)
        : []

    return (
        <div className="container mx-auto max-w-5xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    Our Sponsors
                </h1>
                <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                    These local businesses help keep BSD running
                    {seasonLabel ? ` for the ${seasonLabel} season` : ""}. Their
                    logos appear on our championship t-shirt, and we hope
                    you&apos;ll support them the way they support us.
                </p>
            </div>

            {sponsors.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 p-10 text-center">
                    <p className="text-muted-foreground">
                        Sponsor announcements for {seasonLabel || "this season"}{" "}
                        are coming soon.
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {sponsors.map((sponsor) => (
                        <Card key={sponsor.id} className="flex flex-col">
                            <CardContent className="flex flex-1 flex-col items-center gap-4 p-6 text-center">
                                <div className="flex h-28 w-full items-center justify-center rounded-md bg-white p-3">
                                    {sponsor.logoUrl ? (
                                        <img
                                            src={sponsor.logoUrl}
                                            alt={`${sponsor.name} logo`}
                                            className="max-h-full max-w-full object-contain"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <span className="font-semibold text-2xl text-zinc-700">
                                            {sponsor.name}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <h2 className="font-semibold text-xl">
                                        {sponsor.name}
                                    </h2>
                                    {sponsor.blurb && (
                                        <p className="text-muted-foreground text-sm">
                                            {sponsor.blurb}
                                        </p>
                                    )}
                                </div>
                                {sponsor.website && (
                                    <Button
                                        asChild
                                        variant="outline"
                                        size="sm"
                                        className="mt-auto"
                                    >
                                        <a
                                            href={sponsor.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Visit website
                                            <RiExternalLinkLine className="ml-1 size-4" />
                                        </a>
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <div className="mt-16 rounded-2xl border bg-muted/30 p-8 text-center">
                <h2 className="mb-2 font-bold text-2xl">
                    Interested in sponsoring?
                </h2>
                <p className="mx-auto mb-6 max-w-xl text-muted-foreground">
                    Season sponsors get their logo on the championship t-shirt
                    and a spot on this page in front of hundreds of local
                    players every week.
                </p>
                <Button asChild>
                    <Link
                        href={`mailto:${site.mailSupport}?subject=Sponsoring BSD`}
                    >
                        <RiMailLine className="mr-2 size-4" />
                        Get in touch
                    </Link>
                </Button>
            </div>
        </div>
    )
}
