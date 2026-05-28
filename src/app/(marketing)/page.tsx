import { HeroSection } from "@/components/layout/sections/hero"
import { site } from "@/config/site"
import { auth } from "@/lib/auth"
import { getTournamentConfig } from "@/lib/tournament-config"
import Link from "next/link"
import { headers } from "next/headers"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Calendar, FileText, Users, Gavel, Shield, Trophy } from "lucide-react"

function fmtTournamentDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString("en-US", {
        weekday: "long",
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

    return (
        <>
            <HeroSection />

            {/* Active Tournament Callout — renders only when a non-complete
                tournament exists. Sits between the hero and Quick Links so
                it's the first thing visitors see after the hero. */}
            {tournament && (
                <section className="container mx-auto px-4 pt-4 pb-12">
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
