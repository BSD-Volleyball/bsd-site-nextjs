import { RiMailLine, RiMapPinLine } from "@remixicon/react"

import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { site } from "@/config/site"
import { formatSeasonLabel } from "@/lib/site-config"
import { getCachedSeasonConfig } from "@/next/public-cache"

interface FooterLinkProps {
    href: string
    label: string
    icon?: React.ReactNode
    external?: boolean
}

interface FooterSectionProps {
    title: string
    links: FooterLinkProps[]
}

const footerSections: FooterSectionProps[] = [
    {
        title: "League Info",
        links: [
            { href: "/faq", label: "FAQ" },
            { href: "/history", label: "League History" },
            { href: "/player-experience", label: "Skill Levels" },
            { href: "/gender-policy", label: "Gender Policy" },
            { href: "/sponsors", label: "Our Sponsors" }
        ]
    },
    {
        title: "For Players",
        links: [
            { href: "/captain-expectations", label: "Captain Guidelines" },
            { href: "/referee-expectations", label: "Referee Guidelines" },
            { href: "/rules", label: "Official Rules" },
            { href: "/HandSignals.pdf", label: "Hand Signals" }
        ]
    },
    {
        title: "Resources",
        links: [
            {
                href: "https://www.mdsoccerplex.org",
                label: "MD Soccerplex",
                external: true
            },
            { href: "/auth/sign-up", label: "Register" },
            { href: "/auth/sign-in", label: "Sign In" }
        ]
    }
]

const socialLinks: FooterLinkProps[] = [
    {
        href: site.links.facebook,
        label: "Facebook",
        external: true
    },
    {
        href: `mailto:${site.mailSupport}`,
        label: "Email",
        icon: <RiMailLine className="size-5" />
    }
]

function externalProps(external?: boolean) {
    return external ? { target: "_blank", rel: "noopener noreferrer" } : {}
}

export const FooterSection = async () => {
    const config = await getCachedSeasonConfig()
    const seasonLabel = formatSeasonLabel(config)
    const seasonLink: FooterLinkProps = {
        href: "/season-info",
        label: seasonLabel ? `${seasonLabel} Season` : "Season Info"
    }
    const sections = footerSections.map((section) =>
        section.title === "League Info"
            ? { ...section, links: [seasonLink, ...section.links] }
            : section
    )

    return (
        <footer id="footer">
            <div className="mx-auto max-w-7xl pt-16 pb-0 lg:pb-12">
                <div className="relative overflow-hidden rounded-xl border border-border bg-card/50 shadow-xl backdrop-blur-sm">
                    <div className="relative p-8 lg:p-12">
                        {/* One responsive layout: stacked on mobile, five
                            columns from lg (brand spans two; the link
                            sections join the grid via lg:contents). */}
                        <div className="grid gap-8 lg:grid-cols-5 lg:gap-12">
                            <div className="lg:col-span-2">
                                <Link
                                    href="/?stay=1"
                                    className="group mb-4 flex gap-2 font-bold"
                                >
                                    <Image
                                        src={site.logo}
                                        alt={site.name}
                                        width={30}
                                        height={30}
                                    />
                                    <h3 className="font-bold text-2xl">
                                        BSD Volleyball
                                    </h3>
                                </Link>
                                <p className="mb-6 max-w-sm text-muted-foreground text-sm leading-relaxed lg:max-w-none lg:text-base">
                                    A recreational co-ed volleyball league in
                                    the Washington DC metro area.
                                    <span className="hidden lg:inline">
                                        {" "}
                                        Join us for competitive play, meet new
                                        people, and have fun!
                                    </span>
                                </p>

                                <div className="mb-4 hidden items-start gap-2 text-muted-foreground text-sm lg:flex">
                                    <RiMapPinLine className="mt-0.5 size-4 shrink-0" />
                                    <span>
                                        Maryland SoccerPlex
                                        <br />
                                        18031 Central Park Circle
                                        <br />
                                        Boyds, MD 20841
                                    </span>
                                </div>

                                <div className="flex gap-2">
                                    {socialLinks.map((social) => (
                                        <Button
                                            key={social.label}
                                            asChild
                                            variant="ghost"
                                            size="sm"
                                            className="p-2 hover:bg-accent/50"
                                        >
                                            <Link
                                                href={social.href}
                                                {...externalProps(
                                                    social.external
                                                )}
                                                aria-label={social.label}
                                            >
                                                {social.icon || social.label}
                                            </Link>
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:contents">
                                {sections.map((section) => (
                                    <div
                                        key={section.title}
                                        className="flex flex-col"
                                    >
                                        <h4 className="mb-4 font-semibold text-foreground text-sm uppercase tracking-wide">
                                            {section.title}
                                        </h4>
                                        <ul className="space-y-3">
                                            {section.links.map((link) => (
                                                <li key={link.label}>
                                                    <Link
                                                        href={link.href}
                                                        {...externalProps(
                                                            link.external
                                                        )}
                                                        className="text-muted-foreground text-sm underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline"
                                                    >
                                                        {link.label}
                                                        {link.external && " ↗"}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Separator className="my-8 bg-border/50" />

                        {/* Bottom Section */}
                        <div className="flex flex-col justify-between gap-4 lg:flex-row">
                            <div className="flex flex-col items-center gap-4 text-muted-foreground text-sm sm:flex-row">
                                <p>
                                    &copy; {new Date().getFullYear()} Bump, Set,
                                    Drink, Inc. All rights reserved.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    )
}
