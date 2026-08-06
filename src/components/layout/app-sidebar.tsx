"use client"

import {
    RiArrowDownSLine,
    RiCalendarLine,
    RiGroupLine,
    RiMedalLine,
    RiTeamLine,
    RiTrophyLine
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
import type {
    SeasonNavItem,
    SidebarData,
    TournamentNavItem
} from "@/app/dashboard/sidebar-actions"
import {
    PHASE_CONFIG,
    SEASON_PHASES,
    type SeasonPhase
} from "@/lib/season-phases"
import {
    accountNavItems,
    addPicturesNavItem,
    addTeamPicturesNavItem,
    adminDangerNavItems,
    adminNavItems,
    alwaysHiddenAdminItems,
    baseNavItems,
    captainPagesNavItems,
    captainPairingNavItem,
    commissionerNavItems,
    concernsNavItems,
    currentRostersNavItem,
    enterScoresNavItem,
    hallOfChampionsNavItem,
    manageRefsNavItems,
    myAvailabilityNavItem,
    type NavItem,
    playoffsNavItem,
    reffingNavItems,
    scheduleNavItem,
    seasonCategories,
    seasonHistoryNavItem,
    signupNavItem,
    tournamentCategories,
    tournamentScheduleNavItem,
    tournamentScoresNavItem,
    week1NavItem,
    week2NavItem,
    week3NavItem
} from "@/components/layout/sidebar-nav-config"

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
                <span className="font-bold text-sm leading-tight transition-[margin,opacity,transform,width] duration-300 ease-out group-data-[collapsible=icon]:-ml-2 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:scale-95 group-data-[collapsible=icon]:opacity-0">
                    Bump Set Drink
                    <br />
                    Volleyball
                </span>
            </Link>
        </div>
    )
}

function NavItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
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

function TournamentNavMenuItem({
    tournament,
    pathname
}: {
    tournament: TournamentNavItem
    pathname: string
}) {
    const label = `${tournament.name} (${tournament.year})`

    return (
        <Collapsible asChild className="group/tournament">
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                        className="group/menu-button h-9 gap-3 font-medium transition-all duration-300 ease-out group-data-[collapsible=icon]:px-1.25! [&>svg]:size-auto"
                        tooltip={label}
                    >
                        <RiMedalLine
                            className="text-muted-foreground/65"
                            size={22}
                            aria-hidden="true"
                        />
                        <span>{label}</span>
                        <RiArrowDownSLine
                            className="ml-auto transition-transform duration-200 group-data-[state=open]/tournament:rotate-180"
                            size={16}
                        />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {tournamentCategories.map((cat) => {
                            const href = `${cat.basePath}/${tournament.id}`
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

export function AppSidebar({
    data,
    ...props
}: React.ComponentProps<typeof Sidebar> & { data: SidebarData }) {
    const pathname = usePathname()
    const {
        showSignupLink,
        hasCurrentSeasonSignup,
        isAdmin,
        isCommissioner,
        hasCaptainPagesAccess,
        isCoach,
        hasPicturesAccess,
        hasScoresAccess,
        hasConcernsAccess,
        isReferee,
        isRefCoordinator,
        historicalNav,
        phase,
        tournament
    } = data

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
    const showCurrentRosters = inRange("draft", "playoffs")
    const showSchedule = inRange("draft", "playoffs")
    const showPlayoffsLink = phase === "playoffs"
    const showWeek2Homework = phase === "prep_tryout_week_3"
    const showDraftItems = inRange("prep_tryout_week_2", "draft")
    const showPictures =
        hasPicturesAccess && inRange("prep_tryout_week_1", "draft")
    const showEnterScores = hasScoresAccess && inRange("draft", "playoffs")
    const showAddTeamPictures =
        hasPicturesAccess && inRange("regular_season", "playoffs")
    const showCourtMgmt = showPictures || showEnterScores || showAddTeamPictures
    const showReviewPairs = isAdmin && inRange("select_commissioners", "draft")
    const showEvaluatePlayers =
        isAdmin && inRange("select_commissioners", "prep_tryout_week_1")
    const showSelectCommissioners = phase === "select_commissioners"
    const showCreateDivisions =
        phase === "select_commissioners" || phase === "select_captains"
    const showCreateSchedule = phase === "draft"

    // Tryout volunteer tools: staffing is planned from the moment
    // registration opens and is done once the last tryout night is over.
    const tryoutVolunteerUrls = [
        "/dashboard/configure-tryout-jobs",
        "/dashboard/pick-tryout-volunteers",
        "/dashboard/assign-tryout-jobs"
    ]
    const showTryoutVolunteerTools =
        isAdmin && inRange("registration_open", "prep_tryout_week_3")

    // Admin tournament pages only make sense while a tournament is active
    // (tournament is null when the latest tournament is complete or none
    // exists). Tournament Control stays visible so a new one can be created.
    const hasActiveTournament = !!tournament
    const tournamentAdminUrls = [
        "/dashboard/tournament-overview",
        "/dashboard/tournament-pools",
        "/dashboard/view-tournament-waitlist"
    ]

    // Reffing section — visible to refs during regular_season and playoffs
    const showReffingSection =
        isReferee && inRange("regular_season", "playoffs")
    // Manage Refs section — visible to ref coordinators and admins during draft through playoffs
    const showManageRefsSection =
        (isRefCoordinator || isAdmin) && inRange("draft", "playoffs")

    // Captain pages — per-item filtering
    // Rate Player stays useful from tryouts through playoffs (includes
    // showPlayoffTools so the link survives the regular_season → playoffs
    // phase change, where showSeasonTools flips off).
    const captainBaseVisible =
        hasCaptainPagesAccess &&
        !!phaseConfig &&
        (phaseConfig.showTryoutTools ||
            phaseConfig.showDraftTools ||
            phaseConfig.showSeasonTools ||
            phaseConfig.showPlayoffTools)
    // View Signups is only relevant through draft
    const captainViewSignupsVisible =
        hasCaptainPagesAccess &&
        !!phaseConfig &&
        (phaseConfig.showTryoutTools || phaseConfig.showDraftTools)
    // Player Lookup remains useful through regular season and playoffs
    const captainPlayerLookupVisible =
        hasCaptainPagesAccess &&
        !!phaseConfig &&
        (phaseConfig.showTryoutTools ||
            phaseConfig.showDraftTools ||
            phaseConfig.showSeasonTools ||
            phaseConfig.showPlayoffTools)
    const showTeamAvailability =
        (hasCaptainPagesAccess && inRange("prep_tryout_week_2", "playoffs")) ||
        isCoach
    const visibleCaptainItems = [
        ...(showTeamAvailability ? [captainPagesNavItems[0]] : []),
        ...(captainViewSignupsVisible ? [captainPagesNavItems[1]] : []),
        ...(captainPlayerLookupVisible ? [captainPagesNavItems[2]] : []),
        ...(captainBaseVisible ||
        (hasCaptainPagesAccess && phase === "complete")
            ? [captainPagesNavItems[3]]
            : []),
        ...(hasCaptainPagesAccess && showWeek2Homework
            ? [captainPagesNavItems[4]]
            : []),
        ...(hasCaptainPagesAccess && showDraftItems
            ? captainPagesNavItems.slice(5)
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

    // Insert My Availability after Dashboard (and signup, if present) for players signed up this season.
    // Once the season is complete, availability no longer applies — hide it.
    const showMyAvailability = hasCurrentSeasonSignup && phase !== "complete"
    if (showMyAvailability) {
        const dashboardIdx = navItems.findIndex((i) => i.url === "/dashboard")
        navItems = [
            ...navItems.slice(0, dashboardIdx + 1),
            myAvailabilityNavItem,
            ...navItems.slice(dashboardIdx + 1)
        ]
    }

    // Insert My Season Preferences after Dashboard for players signed up this season,
    // but only before drafting starts — once the draft begins these choices lock.
    const showCaptainPairing =
        hasCurrentSeasonSignup &&
        phaseIdx >= 0 &&
        phaseIdx < SEASON_PHASES.indexOf("draft")
    if (showCaptainPairing) {
        const dashboardIdx = navItems.findIndex((i) => i.url === "/dashboard")
        navItems = [
            ...navItems.slice(0, dashboardIdx + 1),
            captainPairingNavItem,
            ...navItems.slice(dashboardIdx + 1)
        ]
    }

    // Admin hidden section — collect all currently-suppressed items by group
    const hiddenGroups: { label: string; items: NavItem[] }[] = []

    if (isAdmin) {
        // Always hidden
        hiddenGroups.push({
            label: "Always Hidden",
            items: alwaysHiddenAdminItems
        })

        // My Availability — hidden when user has no current-season signup,
        // or when the season is complete (availability is no longer relevant).
        if (!showMyAvailability) {
            hiddenGroups.push({
                label: hasCurrentSeasonSignup
                    ? "My Availability (season complete)"
                    : "My Availability (no signup)",
                items: [myAvailabilityNavItem]
            })
        }

        // My Season Preferences — hidden when the user has no current-season
        // signup, or once drafting has started (the choices are locked).
        if (!showCaptainPairing) {
            hiddenGroups.push({
                label: hasCurrentSeasonSignup
                    ? "My Season Preferences (locked)"
                    : "My Season Preferences (no signup)",
                items: [captainPairingNavItem]
            })
        }

        // Season week pages currently suppressed
        const hiddenSeasonItems = [
            ...(!showWeek1 ? [week1NavItem] : []),
            ...(!showWeek2 ? [week2NavItem] : []),
            ...(!showWeek3 ? [week3NavItem] : []),
            ...(!showCurrentRosters ? [currentRostersNavItem] : []),
            ...(!showSchedule ? [scheduleNavItem] : []),
            ...(!showPlayoffsLink ? [playoffsNavItem] : [])
        ]
        if (hiddenSeasonItems.length > 0)
            hiddenGroups.push({
                label: "Season Weeks",
                items: hiddenSeasonItems
            })

        // Danger Zone pages currently suppressed by phase
        const hiddenDangerItems = adminDangerNavItems.filter(
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
                    !showWeek3) ||
                (item.url === "/dashboard/select-commissioners" &&
                    !showSelectCommissioners) ||
                (item.url === "/dashboard/create-divisions" &&
                    !showCreateDivisions) ||
                (item.url === "/dashboard/create-schedule" &&
                    !showCreateSchedule)
        )
        if (hiddenDangerItems.length > 0)
            hiddenGroups.push({
                label: "Danger Zone",
                items: hiddenDangerItems
            })

        // Tournament pages suppressed while no tournament is active
        if (!hasActiveTournament) {
            hiddenGroups.push({
                label: "Tournament (no active tournament)",
                items: [
                    ...adminNavItems.filter((item) =>
                        tournamentAdminUrls.includes(item.url)
                    ),
                    ...adminDangerNavItems.filter(
                        (item) => item.url === "/dashboard/tournament-config"
                    )
                ]
            })
        }

        // Captain page items currently suppressed
        const hiddenCaptainItems = captainPagesNavItems.filter((item) => {
            if (item.url === "/dashboard/team-availability")
                return !showTeamAvailability
            if (item.url === "/dashboard/view-signups")
                return !captainViewSignupsVisible
            if (item.url === "/dashboard/player-lookup-signups")
                return !captainPlayerLookupVisible
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

        // Court Mgmt
        const hiddenCourtMgmtItems = [
            ...(!showEnterScores ? [enterScoresNavItem] : []),
            ...(!showPictures ? [addPicturesNavItem] : []),
            ...(!showAddTeamPictures ? [addTeamPicturesNavItem] : [])
        ]
        if (hiddenCourtMgmtItems.length > 0)
            hiddenGroups.push({
                label: "Court Mgmt",
                items: hiddenCourtMgmtItems
            })

        // Reffing pages suppressed outside regular season/playoffs
        if (!showReffingSection)
            hiddenGroups.push({ label: "Reffing", items: reffingNavItems })

        // Ref Management pages suppressed outside draft through playoffs
        if (!showManageRefsSection)
            hiddenGroups.push({
                label: "Ref Management",
                items: manageRefsNavItems
            })

        // Tournament schedule/score tools suppressed while a tournament is
        // active but out of its pool-play/bracket phases
        if (hasActiveTournament) {
            const hiddenTournamentTools = [
                ...(!tournament.showPoolTools
                    ? [tournamentScheduleNavItem]
                    : []),
                ...(!tournament.showPoolTools && !tournament.showBracketTools
                    ? [tournamentScoresNavItem]
                    : [])
            ]
            if (hiddenTournamentTools.length > 0)
                hiddenGroups.push({
                    label: "Tournament (out of phase)",
                    items: hiddenTournamentTools
                })
        }

        // Commissioner items currently suppressed
        const hiddenCommissionerItems = commissionerNavItems.filter(
            (item) => !visibleCommissionerItems.includes(item)
        )
        if (hiddenCommissionerItems.length > 0)
            hiddenGroups.push({
                label: "Commissioner",
                items: hiddenCommissionerItems
            })

        // Admin items: Review Pairs, Evaluate New Players, and the tryout
        // volunteer tools if suppressed
        const hiddenAdminItems = adminNavItems.filter(
            (item) =>
                (item.url === "/dashboard/review-pairs" && !showReviewPairs) ||
                (item.url === "/dashboard/evaluate-players" &&
                    !showEvaluatePlayers) ||
                (tryoutVolunteerUrls.includes(item.url) &&
                    !showTryoutVolunteerTools)
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
                    showCurrentRosters ||
                    showSchedule ||
                    showPlayoffsLink) && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Season
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {showPlayoffsLink && (
                                    <NavItems
                                        items={[playoffsNavItem]}
                                        pathname={pathname}
                                    />
                                )}
                                {showSchedule && (
                                    <NavItems
                                        items={[scheduleNavItem]}
                                        pathname={pathname}
                                    />
                                )}
                                {showCurrentRosters && (
                                    <NavItems
                                        items={[currentRostersNavItem]}
                                        pathname={pathname}
                                    />
                                )}
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
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {tournament && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Tournament
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={(() => {
                                        const items: NavItem[] = []
                                        if (tournament.canSignUp) {
                                            items.push({
                                                title: "Sign Up for Tournament",
                                                url: "/dashboard/tournament-signup",
                                                icon: RiTrophyLine
                                            })
                                        }
                                        if (tournament.canPlayerSignUp) {
                                            items.push({
                                                title: "Sign Up as a Player",
                                                url: "/dashboard/tournament-waitlist",
                                                icon: RiGroupLine
                                            })
                                        }
                                        if (
                                            tournament.isCaptain ||
                                            tournament.isRostered
                                        ) {
                                            items.push({
                                                title: "My Tournament Team",
                                                url: "/dashboard/tournament-team",
                                                icon: RiTeamLine
                                            })
                                        }
                                        // Player-facing schedule + bracket:
                                        // visible to participants and admins
                                        // once matches exist.
                                        if (
                                            (tournament.showPoolTools ||
                                                tournament.showBracketTools) &&
                                            (tournament.isRostered || isAdmin)
                                        ) {
                                            items.push({
                                                title: "Schedule & Bracket",
                                                url: "/dashboard/tournament-schedule-view",
                                                icon: RiCalendarLine
                                            })
                                        }
                                        if (tournament.showPoolTools) {
                                            items.push(
                                                tournamentScheduleNavItem
                                            )
                                            items.push(tournamentScoresNavItem)
                                        }
                                        if (tournament.showBracketTools) {
                                            items.push(tournamentScoresNavItem)
                                        }
                                        return items
                                    })()}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {showCourtMgmt && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Court Mgmt
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={[
                                        ...(showEnterScores
                                            ? [enterScoresNavItem]
                                            : []),
                                        ...(showAddTeamPictures
                                            ? [addTeamPicturesNavItem]
                                            : []),
                                        ...(showPictures
                                            ? [addPicturesNavItem]
                                            : [])
                                    ]}
                                    pathname={pathname}
                                />
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

                {showReffingSection && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Reffing
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={reffingNavItems}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {showManageRefsSection && (
                    <SidebarGroup>
                        <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                            Ref Management
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                <NavItems
                                    items={manageRefsNavItems}
                                    pathname={pathname}
                                />
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                <SidebarGroup>
                    <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                        Account
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <NavItems
                                items={accountNavItems}
                                pathname={pathname}
                            />
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                        Historical
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <NavItems
                                items={[hallOfChampionsNavItem]}
                                pathname={pathname}
                            />
                            {historicalNav.map((entry) =>
                                entry.kind === "season" ? (
                                    <SeasonNavMenuItem
                                        key={`season-${entry.season.id}`}
                                        season={entry.season}
                                        pathname={pathname}
                                    />
                                ) : (
                                    <TournamentNavMenuItem
                                        key={`tournament-${entry.tournament.id}`}
                                        tournament={entry.tournament}
                                        pathname={pathname}
                                    />
                                )
                            )}
                            <NavItems
                                items={[seasonHistoryNavItem]}
                                pathname={pathname}
                            />
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

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
                                        if (
                                            tournamentAdminUrls.includes(
                                                item.url
                                            )
                                        )
                                            return hasActiveTournament
                                        if (
                                            tryoutVolunteerUrls.includes(
                                                item.url
                                            )
                                        )
                                            return showTryoutVolunteerTools
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
                                                return showSelectCommissioners
                                            if (
                                                item.url ===
                                                "/dashboard/create-divisions"
                                            )
                                                return showCreateDivisions
                                            if (
                                                item.url ===
                                                "/dashboard/create-schedule"
                                            )
                                                return showCreateSchedule
                                            if (
                                                item.url ===
                                                "/dashboard/tournament-config"
                                            )
                                                return hasActiveTournament
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
