"use client"
import { SignedIn, SignedOut } from "@daveyplate/better-auth-ui"
import { Menu, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import { ModeToggle } from "./mode-toggle"
import { Button } from "../ui/button"
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger
} from "../ui/navigation-menu"
import { Separator } from "../ui/separator"
import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from "../ui/sheet"
import { site } from "@/config/site"

interface RouteProps {
    href: string
    label: string
    external?: boolean
}

interface InfoPageProps {
    title: string
    href: string
    description: string
}

const routeList: RouteProps[] = [
    {
        href: "/faq",
        label: "FAQ"
    },
    {
        href: "/history",
        label: "History"
    },
    {
        href: "/player-experience",
        label: "Skill Levels"
    }
]

const infoPages: InfoPageProps[] = [
    {
        title: "Spring 2026 Season Info",
        href: "/spring-2026-season-info",
        description: "Registration, schedule, and format details"
    },
    {
        title: "Captain Expectations",
        href: "/captain-expectations",
        description: "Guidelines for team captains"
    },
    {
        title: "Referee Expectations",
        href: "/referee-expectations",
        description: "Guidelines for referees"
    },
    {
        title: "Gender Policy",
        href: "/gender-policy",
        description: "Co-rec play and inclusion policies"
    }
]

const resourceLinks: RouteProps[] = [
    {
        href: "/BSD-Volleyball-Rules.pdf",
        label: "Official League Rules"
    },
    {
        href: "/HandSignals.pdf",
        label: "Hand Signals"
    },
    {
        href: "https://www.mdsoccerplex.org",
        label: "Maryland Soccerplex",
        external: true
    }
]

export const Navbar = () => {
    const [isOpen, setIsOpen] = React.useState(false)

    return (
        <div className="sticky top-2 z-50 mx-auto w-[98%] max-w-7xl px-4">
            <nav className="rounded-xl border border-border bg-card/50 shadow-black/2 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between px-4 py-3 lg:px-6">
                    {/* Logo */}
                    <Link
                        href="/"
                        className="group flex items-center gap-2 font-bold"
                    >
                        <div className="relative">
                            <Image
                                src={site.logo}
                                alt={site.name}
                                width={30}
                                height={30}
                            />
                        </div>
                        <h3 className="hidden font-bold text-xl sm:block lg:text-2xl">
                            {site.name}
                        </h3>
                        <h3 className="font-bold text-xl sm:hidden">
                            BSD
                        </h3>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden items-center space-x-1 lg:flex">
                        <NavigationMenu>
                            <NavigationMenuList className="space-x-2">
                                <NavigationMenuItem>
                                    <NavigationMenuTrigger className="h-auto bg-transparent px-4 py-2 font-medium text-foreground hover:bg-accent/50">
                                        League Info
                                    </NavigationMenuTrigger>
                                    <NavigationMenuContent>
                                        <ul className="grid w-[400px] gap-3 p-4">
                                            {infoPages.map(
                                                ({
                                                    title,
                                                    href,
                                                    description
                                                }) => (
                                                    <li key={title}>
                                                        <NavigationMenuLink
                                                            asChild
                                                        >
                                                            <Link
                                                                href={href}
                                                                className="group block rounded-lg p-3 text-sm transition-colors hover:bg-accent/50"
                                                            >
                                                                <p className="mb-1 font-semibold text-foreground leading-none group-hover:text-primary">
                                                                    {title}
                                                                </p>
                                                                <p className="line-clamp-2 text-muted-foreground text-xs">
                                                                    {description}
                                                                </p>
                                                            </Link>
                                                        </NavigationMenuLink>
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                    </NavigationMenuContent>
                                </NavigationMenuItem>

                                <NavigationMenuItem>
                                    <NavigationMenuTrigger className="h-auto bg-transparent px-4 py-2 font-medium text-foreground hover:bg-accent/50">
                                        Resources
                                    </NavigationMenuTrigger>
                                    <NavigationMenuContent>
                                        <ul className="grid w-[300px] gap-3 p-4">
                                            {resourceLinks.map(
                                                ({ href, label, external }) => (
                                                    <li key={label}>
                                                        <NavigationMenuLink
                                                            asChild
                                                        >
                                                            <Link
                                                                href={href}
                                                                target={external ? "_blank" : undefined}
                                                                rel={external ? "noopener noreferrer" : undefined}
                                                                className="group block rounded-lg p-3 text-sm font-medium transition-colors hover:bg-accent/50 hover:text-primary"
                                                            >
                                                                {label}
                                                                {external && " ↗"}
                                                            </Link>
                                                        </NavigationMenuLink>
                                                    </li>
                                                )
                                            )}
                                        </ul>
                                    </NavigationMenuContent>
                                </NavigationMenuItem>

                                {routeList.map(({ href, label }) => (
                                    <NavigationMenuItem key={href}>
                                        <NavigationMenuLink asChild>
                                            <Link
                                                href={href}
                                                className="rounded-lg px-4 py-2 font-medium text-sm transition-colors hover:bg-accent/50 hover:text-primary"
                                            >
                                                {label}
                                            </Link>
                                        </NavigationMenuLink>
                                    </NavigationMenuItem>
                                ))}
                            </NavigationMenuList>
                        </NavigationMenu>
                    </div>

                    {/* Desktop Actions */}
                    <div className="hidden items-center gap-2 lg:flex">
                        <ModeToggle />

                        <SignedOut>
                            <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="ml-2"
                            >
                                <Link href="/auth/sign-in?redirectTo=/dashboard">
                                    Sign In
                                </Link>
                            </Button>
                            <Button
                                asChild
                                size="sm"
                                className="bg-primary hover:bg-primary/90"
                            >
                                <Link href="/auth/sign-up?redirectTo=/dashboard">
                                    Register
                                </Link>
                            </Button>
                        </SignedOut>
                        <SignedIn>
                            <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="ml-2"
                            >
                                <Link href="/dashboard">Dashboard</Link>
                            </Button>
                        </SignedIn>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex items-center gap-2 lg:hidden">
                        <ModeToggle />
                        <Sheet open={isOpen} onOpenChange={setIsOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg hover:bg-accent/50"
                                    aria-label="Toggle menu"
                                >
                                    {isOpen ? (
                                        <X className="size-4" />
                                    ) : (
                                        <Menu className="size-4" />
                                    )}
                                </Button>
                            </SheetTrigger>

                            <SheetContent
                                side="right"
                                className="w-full max-w-sm border-border/50 border-l bg-background/95 backdrop-blur-md"
                            >
                                <div className="flex h-full flex-col">
                                    <SheetHeader className="pb-4">
                                        <SheetTitle>
                                            <Link
                                                href="/"
                                                className="flex items-center gap-2"
                                                onClick={() => setIsOpen(false)}
                                            >
                                                <Image
                                                    src={site.logo}
                                                    alt={site.name}
                                                    width={32}
                                                    height={32}
                                                />
                                                <span className="font-bold text-lg">
                                                    BSD Volleyball
                                                </span>
                                            </Link>
                                        </SheetTitle>
                                    </SheetHeader>

                                    <Separator className="mb-4" />

                                    {/* Mobile Navigation Links */}
                                    <div className="flex flex-1 flex-col overflow-y-auto">
                                        <div className="space-y-1">
                                            {routeList.map(
                                                ({ href, label }) => (
                                                    <Button
                                                        key={href}
                                                        onClick={() =>
                                                            setIsOpen(false)
                                                        }
                                                        asChild
                                                        variant="ghost"
                                                        className="h-auto w-full justify-start px-3 py-2.5 font-medium hover:bg-accent/50"
                                                    >
                                                        <Link href={href}>
                                                            {label}
                                                        </Link>
                                                    </Button>
                                                )
                                            )}
                                        </div>

                                        <Separator className="my-4" />

                                        <p className="mb-2 px-3 font-semibold text-muted-foreground text-xs uppercase">
                                            League Info
                                        </p>
                                        <div className="space-y-1">
                                            {infoPages.map(
                                                ({ href, title }) => (
                                                    <Button
                                                        key={href}
                                                        onClick={() =>
                                                            setIsOpen(false)
                                                        }
                                                        asChild
                                                        variant="ghost"
                                                        className="h-auto w-full justify-start px-3 py-2.5 font-medium hover:bg-accent/50"
                                                    >
                                                        <Link href={href}>
                                                            {title}
                                                        </Link>
                                                    </Button>
                                                )
                                            )}
                                        </div>

                                        <Separator className="my-4" />

                                        <p className="mb-2 px-3 font-semibold text-muted-foreground text-xs uppercase">
                                            Resources
                                        </p>
                                        <div className="space-y-1">
                                            {resourceLinks.map(
                                                ({ href, label, external }) => (
                                                    <Button
                                                        key={href}
                                                        onClick={() =>
                                                            setIsOpen(false)
                                                        }
                                                        asChild
                                                        variant="ghost"
                                                        className="h-auto w-full justify-start px-3 py-2.5 font-medium hover:bg-accent/50"
                                                    >
                                                        <Link
                                                            href={href}
                                                            target={external ? "_blank" : undefined}
                                                            rel={external ? "noopener noreferrer" : undefined}
                                                        >
                                                            {label}
                                                            {external && " ↗"}
                                                        </Link>
                                                    </Button>
                                                )
                                            )}
                                        </div>
                                    </div>

                                    {/* Mobile Actions */}
                                    <SheetFooter className="flex-row gap-2 border-border/50 border-t pt-4">
                                        <SignedOut>
                                            <Button
                                                asChild
                                                variant="outline"
                                                className="w-full"
                                                onClick={() => setIsOpen(false)}
                                            >
                                                <Link href="/auth/sign-in?redirectTo=/dashboard">
                                                    Sign In
                                                </Link>
                                            </Button>
                                            <Button
                                                asChild
                                                className="w-full bg-primary hover:bg-primary/90"
                                                onClick={() => setIsOpen(false)}
                                            >
                                                <Link href="/auth/sign-up?redirectTo=/dashboard">
                                                    Register
                                                </Link>
                                            </Button>
                                        </SignedOut>
                                        <SignedIn>
                                            <Button
                                                asChild
                                                variant="outline"
                                                className="w-full"
                                                onClick={() => setIsOpen(false)}
                                            >
                                                <Link href="/dashboard">
                                                    Dashboard
                                                </Link>
                                            </Button>
                                        </SignedIn>
                                    </SheetFooter>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </nav>
        </div>
    )
}
