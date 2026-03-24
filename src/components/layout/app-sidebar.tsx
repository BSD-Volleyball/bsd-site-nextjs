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
    RiSettings3Line,
    RiAlertLine,
    RiFileWarningLine,
    RiCheckboxLine
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
    getHasPicturesAccess,
    getHasConcernsAccess,
    getRecentSeasonsNav,
    getSeasonPhase,
    type SeasonNavItem
} from "@/app/dashboard/actions"
import {
    PHASE_CONFIG,
    SEASON_PHASES,
    type SeasonPhase
} from "@/lib/season-phases"

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
    },
    {
        title: "League Rules",
        url: "/dashboard/rules",
        icon: RiFileList3Line
    },
    {
        title: "Report a Concern",
        url: "/dashboard/report-concern",
        icon: RiAlertLine
    }
]

const concernsNavItems = [
    {
        title: "Manage Concerns",
        url: "/dashboard/manage-concerns",
        icon: RiFileWarningLine
    }
]

const signupNavItem = {
    title: "Sign-up for Season",
    url: "/dashboard/pay-season",
    icon: RiEditLine
}

const adminNavItems = [
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
        title: "Google Membership",
        url: "/dashboard/google-membership",
        icon: RiMailLine
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
        title: "Audit Log",
        url: "/dashboard/audit-log",
        icon: RiHistoryLine
    }
]

const adminDangerNavItems = [
    {
        title: "Season Control",
        url: "/dashboard/season-control",
        icon: RiSettings3Line
    },
    {
        title: "Manage Roles",
        url: "/dashboard/manage-roles",
        icon: RiUserSettingsLine
    },
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
        title: "Create Week 3",
        url: "/dashboard/create-week-3",
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
        title: "Edit Week 3",
        url: "/dashboard/edit-week-3",
        icon: RiEditLine
    },
    {
        title: "Select Commissioners",
        url: "/dashboard/select-commissioners",
        icon: RiUserSettingsLine
    },
    {
        title: "Create Divisions",
        url: "/dashboard/create-divisions",
        icon: RiTeamLine
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
    },
    {
        title: "Create Schedule",
        url: "/dashboard/create-schedule",
        icon: RiCalendarLine
    }
]

// These items are never shown in normal sidebar sections — always in the admin hidden section
const alwaysHiddenAdminItems = [
    {
        title: "Attrition",
        url: "/dashboard/attrition",
        icon: RiUserUnfollowLine
    },
    {
        title: "Admin Create Teams",
        url: "/dashboard/admin-create-teams",
        icon: RiTeamLine
    }
]

const week1NavItem = {
    title: "Pre-Season Week 1",
    url: "/dashboard/preseason-week-1",
    icon: RiCalendarLine
}
const week2NavItem = {
    title: "Pre-Season Week 2",
    url: "/dashboard/preseason-week-2",
    icon: RiCalendarLine
}
const week3NavItem = {
    title: "Pre-Season Week 3",
    url: "/dashboard/preseason-week-3",
    icon: RiCalendarLine
}

const currentRostersNavItem = {
    title: "Rosters",
    url: "/dashboard/rosters",
    icon: RiTeamLine
}

const addPicturesNavItem = {
    title: "Add Pictures",
    url: "/dashboard/add-pictures",
    icon: RiEditLine
}

const commissionerNavItems = [
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
        title: "Prepare for Draft",
        url: "/dashboard/prepare-for-draft",
        icon: RiFileList3Line
    },
    {
        title: "Homework Status",
        url: "/dashboard/homework-status",
        icon: RiCheckboxLine
    },
    {
        title: "Draft Day",
        url: "/dashboard/draft-day",
        icon: RiFileList3Line
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
    },
    {
        title: "Week 2 Homework",
        url: "/dashboard/week-2-homework",
        icon: RiEditLine
    },
    {
        title: "Draft Homework",
        url: "/dashboard/draft-homework",
        icon: RiEditLine
    },
    {
        title: "Live Draft",
        url: "/dashboard/draft-division",
        icon: RiFileList3Line
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
    const [hasPicturesAccess, setHasPicturesAccess] = useState(false)
    const [hasConcernsAccess, setHasConcernsAccess] = useState(false)
    const [seasonNav, setSeasonNav] = useState<SeasonNavItem[]>([])
    const [phase, setPhase] = useState<SeasonPhase | null>(null)

    useEffect(() => {
        getSignupEligibility().then(setShowSignupLink)
        getIsAdminOrDirector().then(setIsAdmin)
        getIsCommissioner().then(setIsCommissioner)
        getHasCaptainPagesAccess().then(setHasCaptainPagesAccess)
        getHasPicturesAccess().then(setHasPicturesAccess)
        getHasConcernsAccess().then(setHasConcernsAccess)
        getRecentSeasonsNav().then(setSeasonNav)
        getSeasonPhase().then(setPhase)
    }, [])

    const phaseConfig = phase ? PHASE_CONFIG[phase] : null

    // Phase range helper
    const phaseIdx = phase ? SEASON_PHASES.indexOf(phase) : -1
    const inRange = (start: SeasonPhase, end: SeasonPhase): boolean => {
        if (phaseIdx < 0) return false
        return (
            phaseIdx >= SEASON_PHASES.indexOf(start) &&
            phaseIdx <= SEASON_PHASES.indexOf(end)
        )
    }

    // Per-item phase visibility
    const showWeek1 = inRange("select_captains", "draft")
    const showWeek2 = inRange("select_captains", "draft")
    const showWeek3 = inRange("select_captains", "draft")
    const showCurrentRosters = inRange("draft", "complete")
    const showWeek2Homework = phase === "prep_tryout_week_3"
    const showDraftItems = inRange("prep_tryout_week_2", "draft")
    const showPictures =
        hasPicturesAccess && inRange("prep_tryout_week_1", "draft")
    const showReviewPairs = isAdmin && inRange("select_commissioners", "draft")
    const showEvaluatePlayers =
        isAdmin && inRange("select_commissioners", "prep_tryout_week_1")

    // Captain pages — per-item filtering
    const captainBaseVisible =
        hasCaptainPagesAccess &&
        !!phaseConfig &&
        (phaseConfig.showTryoutTools ||
            phaseConfig.showDraftTools ||
            phaseConfig.showSeasonTools)
    const visibleCaptainItems = [
        ...(captainBaseVisible ? captainPagesNavItems.slice(0, 3) : []),
        ...(hasCaptainPagesAccess && showWeek2Homework
            ? [captainPagesNavItems[3]]
            : []),
        ...(hasCaptainPagesAccess && showDraftItems
            ? captainPagesNavItems.slice(4)
            : [])
    ]

    // Commissioner section — per-item filtering
    const showCommissionerSection =
        isCommissioner &&
        !!phaseConfig &&
        (phaseConfig.showTryoutTools || phaseConfig.showDraftTools)
    const visibleCommissionerItems = showCommissionerSection
        ? commissionerNavItems.filter((item) => {
              if (
                  item.url === "/dashboard/potential-captains" ||
                  item.url === "/dashboard/select-captains"
              )
                  return inRange("select_commissioners", "prep_tryout_week_1")
              if (
                  item.url === "/dashboard/prepare-for-draft" ||
                  item.url === "/dashboard/draft-day"
              )
                  return inRange("prep_tryout_week_3", "draft")
              return true // Homework Status: unchanged
          })
        : []

    // Build nav items dynamically
    let navItems = [...baseNavItems]

    // Insert signup after Dashboard if eligible
    if (showSignupLink) {
        navItems = [navItems[0], signupNavItem, ...navItems.slice(1)]
    }

    // Admin hidden section — collect all currently-suppressed items by group
    type NavItem = { title: string; url: string; icon: typeof RiSpeedUpLine }
    const hiddenGroups: { label: string; items: NavItem[] }[] = []

    if (isAdmin) {
        // Always hidden
        hiddenGroups.push({
            label: "Always Hidden",
            items: alwaysHiddenAdminItems
        })

        // Season week pages currently suppressed
        const hiddenSeasonItems = [
            ...(!showWeek1 ? [week1NavItem] : []),
            ...(!showWeek2 ? [week2NavItem] : []),
            ...(!showWeek3 ? [week3NavItem] : []),
            ...(!showCurrentRosters ? [currentRostersNavItem] : [])
        ]
        if (hiddenSeasonItems.length > 0)
            hiddenGroups.push({
                label: "Season Weeks",
                items: hiddenSeasonItems
            })

        // Danger Zone week pages currently suppressed
        const hiddenDangerWeekItems = adminDangerNavItems.filter(
            (item) =>
                ([
                    "/dashboard/create-week-1",
                    "/dashboard/edit-week-1"
                ].includes(item.url) &&
                    !showWeek1) ||
                ([
                    "/dashboard/create-week-2",
                    "/dashboard/edit-week-2"
                ].includes(item.url) &&
                    !showWeek2) ||
                ([
                    "/dashboard/create-week-3",
                    "/dashboard/edit-week-3"
                ].includes(item.url) &&
                    !showWeek3)
        )
        if (hiddenDangerWeekItems.length > 0)
            hiddenGroups.push({
                label: "Danger Zone (Weeks)",
                items: hiddenDangerWeekItems
            })

        // Captain page items currently suppressed
        const hiddenCaptainItems = captainPagesNavItems.filter((item) => {
            if (item.url === "/dashboard/week-2-homework")
                return !showWeek2Homework
            if (
                item.url === "/dashboard/draft-homework" ||
                item.url === "/dashboard/draft-division"
            )
                return !showDraftItems
            // Base items hidden if the whole captain section is suppressed
            return !captainBaseVisible
        })
        if (hiddenCaptainItems.length > 0)
            hiddenGroups.push({
                label: "Captain Pages",
                items: hiddenCaptainItems
            })

        // Pictures
        if (!showPictures)
            hiddenGroups.push({
                label: "Pictures",
                items: [addPicturesNavItem]
            })

        // Commissioner items currently suppressed
        const hiddenCommissionerItems = commissionerNavItems.filter(
            (item) => !visibleCommissionerItems.includes(item)
        )
        if (hiddenCommissionerItems.length > 0)
            hiddenGroups.push({
                label: "Commissioner",
                items: hiddenCommissionerItems
            })

        // Admin items: Review Pairs + Evaluate New Players if suppressed
        const hiddenAdminItems = adminNavItems.filter(
            (item) =>
                (item.url === "/dashboard/review-pairs" && !showReviewPairs) ||
                (item.url === "/dashboard/evaluate-players" &&
                    !showEvaluatePlayers)
        )
        if (hiddenAdminItems.length > 0)
            hiddenGroups.push({ label: "Admin", items: hiddenAdminItems })

        // Sign-up link if admin's account isn't eligible
        if (!showSignupLink)
            hiddenGroups.push({ label: "Sign-Up", items: [signupNavItem] })
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

                {(showWeek1 ||
                    showWeek2 ||
                    showWeek3 ||
                    showCurrentRosters) && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Season
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {showWeek1 && (
                                    <NavItems
                                        items={[week1NavItem]}
                                        pathname={pathname}
                                    />
                                )}
                                {showWeek2 && (
                                    <NavItems
                                        items={[week2NavItem]}
                                        pathname={pathname}
                                    />
                                )}
                                {showWeek3 && (
                                    <NavItems
                                        items={[week3NavItem]}
                                        pathname={pathname}
                                    />
                                )}
                                {showCurrentRosters && (
                                    <NavItems
                                        items={[currentRostersNavItem]}
                                        pathname={pathname}
                                    />
                                )}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

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

                {visibleCaptainItems.length > 0 && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Captain Pages
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={visibleCaptainItems}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {showPictures && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Pictures
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={[addPicturesNavItem]}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {visibleCommissionerItems.length > 0 && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Commissioners
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={visibleCommissionerItems}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {hasConcernsAccess && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Concerns
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={concernsNavItems}
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
                                    items={adminNavItems.filter((item) => {
                                        if (
                                            item.url ===
                                            "/dashboard/review-pairs"
                                        )
                                            return showReviewPairs
                                        if (
                                            item.url ===
                                            "/dashboard/evaluate-players"
                                        )
                                            return showEvaluatePlayers
                                        return true
                                    })}
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
                                        (item) => {
                                            if (
                                                item.url ===
                                                    "/dashboard/create-week-1" ||
                                                item.url ===
                                                    "/dashboard/edit-week-1"
                                            )
                                                return showWeek1
                                            if (
                                                item.url ===
                                                    "/dashboard/create-week-2" ||
                                                item.url ===
                                                    "/dashboard/edit-week-2"
                                            )
                                                return showWeek2
                                            if (
                                                item.url ===
                                                    "/dashboard/create-week-3" ||
                                                item.url ===
                                                    "/dashboard/edit-week-3"
                                            )
                                                return showWeek3
                                            if (
                                                item.url ===
                                                "/dashboard/select-commissioners"
                                            )
                                                return (
                                                    phase ===
                                                    "select_commissioners"
                                                )
                                            if (
                                                item.url ===
                                                "/dashboard/create-divisions"
                                            )
                                                return (
                                                    phase ===
                                                        "select_commissioners" ||
                                                    phase === "select_captains"
                                                )
                                            if (
                                                item.url ===
                                                "/dashboard/create-schedule"
                                            )
                                                return phase === "draft"
                                            return true
                                        }
                                    )}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {isAdmin && (
                    <Collapsible
                        defaultOpen={false}
                        className="group/hidden-pages"
                    >
                        <SidebarGroup>
                            <SidebarGroupLabel
                                asChild
                                className="cursor-pointer text-muted-foreground/65 uppercase hover:text-foreground"
                            >
                                <CollapsibleTrigger className="flex w-full items-center">
                                    All Hidden Pages
                                    <RiArrowDownSLine
                                        className="ml-auto transition-transform duration-200 group-data-[state=open]/hidden-pages:rotate-180"
                                        size={16}
                                    />
                                </CollapsibleTrigger>
                            </SidebarGroupLabel>
                            <CollapsibleContent>
                                <SidebarGroupContent>
                                    {hiddenGroups.map((group) => (
                                        <div key={group.label}>
                                            <p className="px-2 pt-2 pb-1 text-muted-foreground/50 text-xs">
                                                {group.label}
                                            </p>
                                            <SidebarMenu>
                                                <NavItems
                                                    items={group.items}
                                                    pathname={pathname}
                                                />
                                            </SidebarMenu>
                                        </div>
                                    ))}
                                </SidebarGroupContent>
                            </CollapsibleContent>
                        </SidebarGroup>
                    </Collapsible>
                )}
            </SidebarContent>
            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    )
}
