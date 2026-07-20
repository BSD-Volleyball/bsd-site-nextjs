import { HeroSection } from "@/components/layout/sections/hero"
import { site } from "@/config/site"
import { auth } from "@/lib/auth"
import { getTournamentConfig } from "@/lib/tournament-config"
import {
    getSeasonConfig,
    formatSeasonLabel,
    getEventsByType
} from "@/lib/site-config"
import Link from "next/link"
import { headers } from "next/headers"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import {
    Calendar,
    ClipboardList,
    FileText,
    Users,
    Gavel,
    Shield,
    Trophy
} from "lucide-react"

function fmtTournamentDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    })
}

function fmtSeasonDate(iso: string): string {
    // Noon avoids the date shifting a day under negative UTC offsets.
    const d = new Date(`${iso}T12:00:00`)
    return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    })
}

export const metadata = {
    title: site.name,
    description: site.description,
    openGraph: {
        type: "website",
        url: site.url,
        title: site.name,
        description: site.description,
        images: [
            {
                url: site.ogImage,
                width: 1200,
                height: 750,
                alt: site.name
            }
        ]
    },
    twitter: {
        card: "summary_large_image",
        site: site.url,
        title: site.name,
        description: site.description,
        images: [
            {
                url: site.ogImage,
                width: 1200,
                height: 750,
                alt: site.name
            }
        ]
    }
}

const quickLinks = [
    {
        title: "League Rules",
        description: "Official BSD volleyball rules and regulations",
        href: "/rules",
        icon: FileText
    },
    {
        title: "Captain Guidelines",
        description: "Expectations and responsibilities for team captains",
        href: "/captain-expectations",
        icon: Users
    },
    {
        title: "Referee Guidelines",
        description: "Standards and procedures for referees",
        href: "/referee-expectations",
        icon: Gavel
    },
    {
        title: "Gender Policy",
        description: "Our commitment to inclusive co-rec play",
        href: "/gender-policy",
        icon: Shield
    }
]

export default async function Home() {
    const session = await auth.api.getSession({ headers: await headers() })
    const tournament = await getTournamentConfig()
    const seasonConfig = await getSeasonConfig()
    const seasonLabel = formatSeasonLabel(seasonConfig)

    // Registration banner: show only while the season is accepting signups.
    // The key-date line degrades gracefully if a partially-configured season
    // is opened before every event date has been entered.
    const registrationOpen = seasonConfig.phase === "registration_open"
    const registrationDeadline = getEventsByType(seasonConfig, "late_date")[0]
    const firstTryout = getEventsByType(seasonConfig, "tryout")[0]
    const registrationDateLine = registrationDeadline
        ? `Register by ${fmtSeasonDate(registrationDeadline.eventDate)}`
        : firstTryout
          ? `Season starts ${fmtSeasonDate(firstTryout.eventDate)}`
          : null
    // Logged-in players go straight to the season signup/payment flow;
    // visitors first need an account.
    const registrationHref = session ? "/dashboard/pay-season" : "/auth/sign-up"

    return (
        <>
            {/* Active Tournament Callout — renders only when a non-complete
                tournament exists. Sits at the very top, immediately below
                the marketing nav, so visitors see it before scrolling. */}
            {tournament && (
                <section className="container mx-auto px-4 pt-8 pb-4">
                    <Link
                        href={`/tournament/${tournament.code}`}
                        className="group block"
                    >
                        <div className="relative overflow-hidden rounded-2xl border-2 border-primary bg-gradient-to-br from-primary/10 via-background to-primary/5 p-6 shadow-md transition-shadow hover:shadow-xl sm:p-8">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                                        <Trophy className="size-7" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-semibold text-primary text-sm uppercase tracking-wider">
                                            Upcoming Tournament
                                        </p>
                                        <h3 className="font-bold text-2xl sm:text-3xl">
                                            {tournament.name}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
                                            <span className="flex items-center gap-1.5">
                                                <Calendar className="size-4" />
                                                {fmtTournamentDate(
                                                    tournament.tournamentDate
                                                )}
                                            </span>
                                            {tournament.address && (
                                                <span>
                                                    {tournament.address}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    size="lg"
                                    className="shrink-0 group-hover:bg-primary/90"
                                >
                                    Tournament Details →
                                </Button>
                            </div>
                        </div>
                    </Link>
                </section>
            )}

            {/* Registration Open Callout — renders only while the current
                season's phase is registration_open. Mirrors the tournament
                callout above so the two read as the same component family;
                if both are active they stack, tournament first. */}
            {registrationOpen && (
                <section className="container mx-auto px-4 pt-8 pb-4">
                    <Link href={registrationHref} className="group block">
                        <div className="relative overflow-hidden rounded-2xl border-2 border-primary bg-gradient-to-br from-primary/10 via-background to-primary/5 p-6 shadow-md transition-shadow hover:shadow-xl sm:p-8">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                                        <ClipboardList className="size-7" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-semibold text-primary text-sm uppercase tracking-wider">
                                            Registration Open
                                        </p>
                                        <h3 className="font-bold text-2xl sm:text-3xl">
                                            {seasonLabel
                                                ? `${seasonLabel} Season`
                                                : "New Season"}
                                        </h3>
                                        {registrationDateLine && (
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="size-4" />
                                                    {registrationDateLine}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    size="lg"
                                    className="shrink-0 group-hover:bg-primary/90"
                                >
                                    Register Now →
                                </Button>
                            </div>
                        </div>
                    </Link>
                </section>
            )}

            <HeroSection seasonLabel={seasonLabel} />

            {/* Quick Links Section */}
            <section className="container mx-auto px-4 pb-24">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-12 text-center">
                        <h2 className="mb-4 font-bold text-3xl">
                            League Information
                        </h2>
                        <p className="text-lg text-muted-foreground">
                            Everything you need to know about playing in BSD
                        </p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {quickLinks.map((link) => (
                            <Link key={link.title} href={link.href}>
                                <Card className="h-full transition-colors hover:border-primary/50">
                                    <CardHeader>
                                        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                                            <link.icon className="size-5 text-primary" />
                                        </div>
                                        <CardTitle className="text-lg">
                                            {link.title}
                                        </CardTitle>
                                        <CardDescription>
                                            {link.description}
                                        </CardDescription>
                                    </CardHeader>
                                </Card>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* About Section */}
            <section className="border-border border-t bg-muted/30 py-24">
                <div className="container mx-auto px-4">
                    <div className="mx-auto max-w-4xl">
                        <div className="mb-12 text-center">
                            <h2 className="mb-4 font-bold text-3xl">
                                About BSD
                            </h2>
                        </div>

                        <div className="prose prose-lg dark:prose-invert mx-auto">
                            <p className="text-muted-foreground leading-relaxed">
                                Bump Set Drink began as the IBM Company
                                Volleyball League in the late 1980s and has
                                evolved into one of the DC area&apos;s premier
                                recreational volleyball leagues. Our unique
                                draft system ensures competitive balance and
                                helps players meet new teammates every season.
                            </p>
                            <p className="text-muted-foreground leading-relaxed">
                                We offer six skill divisions from AA (advanced)
                                to BB (beginner), ensuring players of all
                                abilities can find their perfect competitive
                                level. Every player receives guaranteed playing
                                time rotating through all positions.
                            </p>
                        </div>

                        <div className="mt-8 flex justify-center gap-4">
                            <Button asChild>
                                <Link href="/history">Read Our History</Link>
                            </Button>
                            <Button asChild variant="outline">
                                <Link href="/faq">View FAQ</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            {!session && (
                <section className="container mx-auto px-4 py-24">
                    <div className="mx-auto max-w-4xl text-center">
                        <h2 className="mb-4 font-bold text-3xl">
                            Ready to Play?
                        </h2>
                        <p className="mb-8 text-lg text-muted-foreground">
                            Join our community of volleyball enthusiasts.
                            Register today to be included in our next
                            season&apos;s draft.
                        </p>
                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Button asChild size="lg">
                                <Link href="/auth/sign-up">Register Now</Link>
                            </Button>
                            <Button asChild variant="outline" size="lg">
                                <Link href="/player-experience">
                                    Check Skill Levels
                                </Link>
                            </Button>
                        </div>
                    </div>
                </section>
            )}
        </>
    )
}
