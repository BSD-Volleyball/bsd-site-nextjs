import { Mail, MapPin } from "lucide-react"

import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { site } from "@/config/site"

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
            { href: "/spring-2026-season-info", label: "Spring 2026 Season" },
            { href: "/faq", label: "FAQ" },
            { href: "/history", label: "League History" },
            { href: "/player-experience", label: "Skill Levels" },
            { href: "/gender-policy", label: "Gender Policy" }
        ]
    },
    {
        title: "For Players",
        links: [
            { href: "/captain-expectations", label: "Captain Guidelines" },
            { href: "/referee-expectations", label: "Referee Guidelines" },
            { href: "/BSD-Volleyball-Rules.pdf", label: "Official Rules" },
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
        icon: <Mail className="size-5" />
    }
]

export const FooterSection = () => {
    return (
        <footer id="footer">
            <div className="mx-auto max-w-7xl pt-16 pb-0 lg:pb-12">
                <div className="relative overflow-hidden rounded-xl border border-border bg-card/50 shadow-xl backdrop-blur-sm">
                    <div className="relative p-8 lg:p-12">
                        {/* Main Footer Content */}
                        <div className="space-y-8 lg:space-y-0">
                            {/* Desktop Layout: Side by side */}
                            <div className="hidden gap-12 lg:grid lg:grid-cols-5">
                                {/* Brand Section */}
                                <div className="col-span-2">
                                    <Link
                                        href="/"
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
                                    <p className="mb-6 text-muted-foreground leading-relaxed">
                                        A recreational co-ed volleyball league
                                        in the Washington DC metro area. Join us
                                        for competitive play, meet new people,
                                        and have fun!
                                    </p>

                                    <div className="mb-4 flex items-start gap-2 text-muted-foreground text-sm">
                                        <MapPin className="mt-0.5 size-4 shrink-0" />
                                        <span>
                                            Maryland SoccerPlex
                                            <br />
                                            18031 Central Park Circle
                                            <br />
                                            Boyds, MD 20841
                                        </span>
                                    </div>

                                    {/* Contact */}
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
                                                    target={
                                                        social.external
                                                            ? "_blank"
                                                            : undefined
                                                    }
                                                    rel={
                                                        social.external
                                                            ? "noopener noreferrer"
                                                            : undefined
                                                    }
                                                    aria-label={social.label}
                                                >
                                                    {social.icon ||
                                                        social.label}
                                                </Link>
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Footer Links Desktop */}
                                {footerSections.map((section) => (
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
                                                        target={
                                                            link.external
                                                                ? "_blank"
                                                                : undefined
                                                        }
                                                        rel={
                                                            link.external
                                                                ? "noopener noreferrer"
                                                                : undefined
                                                        }
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

                            {/* Mobile/Tablet Layout: Stacked */}
                            <div className="lg:hidden">
                                {/* Brand Section Mobile */}
                                <div className="mb-8">
                                    <Link
                                        href="/"
                                        className="group mb-4 flex gap-2 font-bold"
                                    >
                                        <div className="relative">
                                            <Image
                                                src={site.logo}
                                                alt={site.name}
                                                width={30}
                                                height={30}
                                            />
                                        </div>
                                        <h3 className="font-bold text-2xl">
                                            BSD Volleyball
                                        </h3>
                                    </Link>
                                    <p className="mb-6 max-w-sm text-muted-foreground text-sm leading-relaxed">
                                        A recreational co-ed volleyball league
                                        in the Washington DC metro area.
                                    </p>

                                    {/* Contact Mobile */}
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
                                                    target={
                                                        social.external
                                                            ? "_blank"
                                                            : undefined
                                                    }
                                                    rel={
                                                        social.external
                                                            ? "noopener noreferrer"
                                                            : undefined
                                                    }
                                                    aria-label={social.label}
                                                >
                                                    {social.icon ||
                                                        social.label}
                                                </Link>
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Footer Links Mobile - Grid */}
                                <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
                                    {footerSections.map((section) => (
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
                                                            target={
                                                                link.external
                                                                    ? "_blank"
                                                                    : undefined
                                                            }
                                                            rel={
                                                                link.external
                                                                    ? "noopener noreferrer"
                                                                    : undefined
                                                            }
                                                            className="text-muted-foreground text-sm underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline"
                                                        >
                                                            {link.label}
                                                            {link.external &&
                                                                " ↗"}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
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
