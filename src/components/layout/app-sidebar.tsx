"use client"

import { useEffect, useState } from "react"
import {
    RiLineChartLine,
    RiUser3Line,
    RiShieldLine,
    RiSpeedUpLine,
    RiBasketballLine,
    RiEditLine,
    RiSearchLine,
    RiTeamLine,
    RiFileList3Line,
    RiGroupLine,
    RiTimeLine,
    RiCoupon3Line,
    RiStarLine,
    RiCalendarLine,
    RiArrowDownSLine,
    RiMergeCellsHorizontal,
    RiUserUnfollowLine,
    RiHistoryLine,
    RiLinksLine,
    RiUserSettingsLine,
    RiMailLine,
    RiTrophyLine,
    RiSettings3Line
} from "@remixicon/react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"
import { NavUser } from "@/components/layout/nav-user"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton
} from "@/components/ui/sidebar"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"
import { site } from "@/config/site"
import {
    getSignupEligibility,
    getIsAdminOrDirector,
    getIsCommissioner,
    getHasCaptainPagesAccess,
    getRecentSeasonsNav,
    getSeasonPhase,
    type SeasonNavItem
} from "@/app/dashboard/actions"
import { PHASE_CONFIG, type SeasonPhase } from "@/lib/season-phases"

const baseNavItems = [
    { title: "Dashboard", url: "/dashboard", icon: RiSpeedUpLine },
    {
        title: "Volleyball Profile",
        url: "/dashboard/volleyball-profile",
        icon: RiBasketballLine
    },
    { title: "Account", url: "/dashboard/account", icon: RiUser3Line },
    { title: "Security", url: "/dashboard/security", icon: RiShieldLine },
    { title: "Analytics", url: "/dashboard/analytics", icon: RiLineChartLine },
    {
        title: "Hall of Champions",
        url: "/dashboard/hall-of-champions",
        icon: RiTrophyLine
    }
]

const signupNavItem = {
    title: "Sign-up for Season",
    url: "/dashboard/pay-season",
    icon: RiEditLine
}

const adminNavItems = [
    {
        title: "Season Control",
        url: "/dashboard/season-control",
        icon: RiSettings3Line
    },
    {
        title: "Admin Player Lookup",
        url: "/dashboard/player-lookup",
        icon: RiSearchLine
    },
    {
        title: "Admin View Signups",
        url: "/dashboard/admin-view-signups",
        icon: RiGroupLine
    },
    {
        title: "Review Pairs",
        url: "/dashboard/review-pairs",
        icon: RiLinksLine
    },
    {
        title: "View Waitlist",
        url: "/dashboard/view-waitlist",
        icon: RiTimeLine
    },
    {
        title: "Manage Discounts",
        url: "/dashboard/manage-discounts",
        icon: RiCoupon3Line
    },
    {
        title: "Evaluate New Players",
        url: "/dashboard/evaluate-players",
        icon: RiStarLine
    },
    {
        title: "Attrition",
        url: "/dashboard/attrition",
        icon: RiUserUnfollowLine
    },
    {
        title: "Audit Log",
        url: "/dashboard/audit-log",
        icon: RiHistoryLine
    }
]

const adminDangerNavItems = [
    {
        title: "Create Week 1",
        url: "/dashboard/create-week-1",
        icon: RiCalendarLine
    },
    {
        title: "Create Week 2",
        url: "/dashboard/create-week-2",
        icon: RiCalendarLine
    },
    {
        title: "Edit Week 1",
        url: "/dashboard/edit-week-1",
        icon: RiEditLine
    },
    {
        title: "Edit Week 2",
        url: "/dashboard/edit-week-2",
        icon: RiEditLine
    },
    {
        title: "Admin Create Teams",
        url: "/dashboard/admin-create-teams",
        icon: RiTeamLine
    },
    {
        title: "Select Commissioners",
        url: "/dashboard/select-commissioners",
        icon: RiUserSettingsLine
    },
    {
        title: "Merge Users",
        url: "/dashboard/merge-users",
        icon: RiMergeCellsHorizontal
    },
    {
        title: "Edit Player",
        url: "/dashboard/edit-player",
        icon: RiEditLine
    },
    {
        title: "Edit Emails",
        url: "/dashboard/edit-emails",
        icon: RiMailLine
    }
]

const commissionerNavItems = [
    {
        title: "Draft Division",
        url: "/dashboard/draft-division",
        icon: RiFileList3Line
    },
    {
        title: "Add Pictures",
        url: "/dashboard/add-pictures",
        icon: RiEditLine
    },
    {
        title: "Potential Captains",
        url: "/dashboard/potential-captains",
        icon: RiUserSettingsLine
    },
    {
        title: "Select Captains",
        url: "/dashboard/select-captains",
        icon: RiTeamLine
    },
    {
        title: "Draft Preseason Week 1",
        url: "/dashboard/draft-preseason-week-1",
        icon: RiCalendarLine
    }
]

const captainPagesNavItems = [
    {
        title: "View Signups",
        url: "/dashboard/view-signups",
        icon: RiGroupLine
    },
    {
        title: "Player Lookup",
        url: "/dashboard/player-lookup-signups",
        icon: RiSearchLine
    },
    {
        title: "Rate Player",
        url: "/dashboard/rate-player",
        icon: RiStarLine
    }
]

const seasonCategories = [
    { key: "rosters", label: "Rosters", basePath: "/dashboard/rosters" },
    { key: "schedule", label: "Season", basePath: "/dashboard/schedule" },
    { key: "playoffs", label: "Playoffs", basePath: "/dashboard/playoffs" }
]

function SidebarLogo() {
    return (
        <div className="flex gap-2 px-2 transition-[padding] duration-300 ease-out group-data-[collapsible=icon]:px-0">
            <Link
                className="group/logo inline-flex items-center gap-2 transition-all duration-300 ease-out"
                href="/"
            >
                <span className="sr-only">{site.name}</span>
                <Image
                    src={site.logo}
                    alt={site.name}
                    width={30}
                    height={30}
                    className="transition-transform duration-300 ease-out group-data-[collapsible=icon]:scale-110"
                />
                <span className="group-data-[collapsible=icon]:-ml-2 font-bold text-sm leading-tight transition-[margin,opacity,transform,width] duration-300 ease-out group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:scale-95 group-data-[collapsible=icon]:opacity-0">
                    Bump Set Drink
                    <br />
                    Volleyball
                </span>
            </Link>
        </div>
    )
}

function NavItems({
    items,
    pathname
}: {
    items: typeof baseNavItems
    pathname: string
}) {
    return (
        <>
            {items.map((item) => {
                const isActive = pathname === item.url

                return (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            className="group/menu-button h-9 gap-3 font-medium transition-all duration-300 ease-out group-data-[collapsible=icon]:px-1.25! [&>svg]:size-auto"
                            tooltip={item.title}
                            isActive={isActive}
                        >
                            <Link
                                href={item.url}
                                className="flex items-center gap-3"
                            >
                                {item.icon && (
                                    <item.icon
                                        className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                                        size={22}
                                        aria-hidden="true"
                                    />
                                )}
                                <span>{item.title}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                )
            })}
        </>
    )
}

function SeasonNavMenuItem({
    season,
    pathname
}: {
    season: SeasonNavItem
    pathname: string
}) {
    const seasonLabel = `${season.season.charAt(0).toUpperCase() + season.season.slice(1)} ${season.year}`

    return (
        <Collapsible asChild className="group/season">
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                        className="group/menu-button h-9 gap-3 font-medium transition-all duration-300 ease-out group-data-[collapsible=icon]:px-1.25! [&>svg]:size-auto"
                        tooltip={seasonLabel}
                    >
                        <RiCalendarLine
                            className="text-muted-foreground/65"
                            size={22}
                            aria-hidden="true"
                        />
                        <span>{seasonLabel}</span>
                        <RiArrowDownSLine
                            className="ml-auto transition-transform duration-200 group-data-[state=open]/season:rotate-180"
                            size={16}
                        />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {seasonCategories.map((cat) => {
                            const href = `${cat.basePath}/${season.id}`
                            return (
                                <SidebarMenuSubItem key={cat.key}>
                                    <SidebarMenuSubButton
                                        asChild
                                        isActive={pathname.startsWith(href)}
                                    >
                                        <Link href={href}>
                                            <span>{cat.label}</span>
                                        </Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            )
                        })}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuItem>
        </Collapsible>
    )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const pathname = usePathname()
    const [showSignupLink, setShowSignupLink] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [isCommissioner, setIsCommissioner] = useState(false)
    const [hasCaptainPagesAccess, setHasCaptainPagesAccess] = useState(false)
    const [seasonNav, setSeasonNav] = useState<SeasonNavItem[]>([])
    const [phase, setPhase] = useState<SeasonPhase | null>(null)

    useEffect(() => {
        getSignupEligibility().then(setShowSignupLink)
        getIsAdminOrDirector().then(setIsAdmin)
        getIsCommissioner().then(setIsCommissioner)
        getHasCaptainPagesAccess().then(setHasCaptainPagesAccess)
        getRecentSeasonsNav().then(setSeasonNav)
        getSeasonPhase().then(setPhase)
    }, [])

    const phaseConfig = phase ? PHASE_CONFIG[phase] : null

    // Build nav items dynamically
    let navItems = [...baseNavItems]

    // Insert signup after Dashboard if eligible
    if (showSignupLink) {
        navItems = [navItems[0], signupNavItem, ...navItems.slice(1)]
    }

    return (
        <Sidebar collapsible="icon" variant="inset" {...props}>
            <SidebarHeader className="mb-4 h-13 justify-center max-md:mt-2">
                <SidebarLogo />
            </SidebarHeader>
            <SidebarContent className="-mt-2">
                <SidebarGroup>
                    <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                        General
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <NavItems items={navItems} pathname={pathname} />
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {seasonNav.length > 0 && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Recent Seasons
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {seasonNav.map((season) => (
                                    <SeasonNavMenuItem
                                        key={season.id}
                                        season={season}
                                        pathname={pathname}
                                    />
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {hasCaptainPagesAccess &&
                    phaseConfig &&
                    (phaseConfig.showTryoutTools ||
                        phaseConfig.showDraftTools ||
                        phaseConfig.showSeasonTools) && (
                        <SidebarGroup>
                            <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                                Captain Pages
                            </SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    <NavItems
                                        items={captainPagesNavItems}
                                        pathname={pathname}
                                    />
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    )}

                {isCommissioner &&
                    phaseConfig &&
                    (phaseConfig.showTryoutTools ||
                        phaseConfig.showDraftTools) && (
                        <SidebarGroup>
                            <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                                Commissioners
                            </SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    <NavItems
                                        items={commissionerNavItems}
                                        pathname={pathname}
                                    />
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    )}

                {isAdmin && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Admin
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={adminNavItems}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {isAdmin && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Admin (Danger Zone)
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={adminDangerNavItems.filter(
                                        (item) =>
                                            item.url !==
                                                "/dashboard/select-commissioners" ||
                                            phase === "select_commissioners"
                                    )}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}
            </SidebarContent>
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    )
}
