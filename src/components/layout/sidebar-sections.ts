import type { SidebarData } from "@/app/dashboard/sidebar-actions"
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
    adminGeneralNavItems,
    adminSeasonNavItems,
    adminTournamentNavItems,
    alwaysHiddenAdminItems,
    baseNavItems,
    captainPagesNavItems,
    captainPairingNavItem,
    commissionerNavItems,
    concernsNavItems,
    currentRostersNavItem,
    enterScoresNavItem,
    manageRefsNavItems,
    myAvailabilityNavItem,
    myTournamentTeamNavItem,
    type NavItem,
    playoffsNavItem,
    reffingNavItems,
    scheduleNavItem,
    scoreSheetInboxNavItem,
    signupNavItem,
    surveysNavItem,
    tournamentPlayerSignupNavItem,
    tournamentScheduleNavItem,
    tournamentScheduleViewNavItem,
    tournamentScoresNavItem,
    tournamentSignupNavItem,
    week1NavItem,
    week2NavItem,
    week3NavItem
} from "@/components/layout/sidebar-nav-config"

/** A labelled sidebar group and the items it shows. */
export type NavSection = { label: string; items: NavItem[] }

/**
 * Everything the sidebar shows for one viewer, in render order.
 *
 * - `sections`: the groups above "Historical" (General through Account).
 * - `adminSections`: the admin groups below "Historical".
 * - `hiddenGroups`: the admin-only "All Hidden Pages" listing (null for
 *   non-admins).
 *
 * A section is present only when it is shown; its items may still be empty
 * (the Tournament group shows whenever a tournament is active).
 */
export type SidebarSections = {
    sections: NavSection[]
    adminSections: NavSection[]
    hiddenGroups: NavSection[] | null
}

// Tryout tools: slot requests and volunteer staffing are handled from the
// moment registration opens and are done once the last tryout night is over,
// so none of them belong in the Draft phase onward.
const tryoutVolunteerUrls = [
    "/dashboard/tryout-slot-requests",
    "/dashboard/configure-tryout-jobs",
    "/dashboard/pick-tryout-volunteers",
    "/dashboard/assign-tryout-jobs"
]

export function buildSidebarSections(data: SidebarData): SidebarSections {
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
        hasSurveys,
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

    const showTryoutVolunteerTools =
        isAdmin && inRange("registration_open", "prep_tryout_week_3")

    // Admin tournament pages only make sense while a tournament is active
    // (tournament is null when the latest tournament is complete or none
    // exists). Tournament Control stays visible so a new one can be created.
    const hasActiveTournament = !!tournament

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
              if (item.url === "/dashboard/draft-setup/rounds")
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

    // My Surveys sits at the end of the personal items: it appears only for
    // people who were invited to a survey they can still open.
    if (hasSurveys) {
        navItems = [...navItems, surveysNavItem]
    }

    // --- Sections above Historical, in render order ---
    const sections: NavSection[] = [{ label: "General", items: navItems }]

    if (
        showWeek1 ||
        showWeek2 ||
        showWeek3 ||
        showCurrentRosters ||
        showSchedule ||
        showPlayoffsLink
    ) {
        sections.push({
            label: "Season",
            items: [
                ...(showPlayoffsLink ? [playoffsNavItem] : []),
                ...(showSchedule ? [scheduleNavItem] : []),
                ...(showCurrentRosters ? [currentRostersNavItem] : []),
                ...(showWeek1 ? [week1NavItem] : []),
                ...(showWeek2 ? [week2NavItem] : []),
                ...(showWeek3 ? [week3NavItem] : [])
            ]
        })
    }

    if (tournament) {
        const items: NavItem[] = []
        if (tournament.canSignUp) {
            items.push(tournamentSignupNavItem)
        }
        if (tournament.canPlayerSignUp) {
            items.push(tournamentPlayerSignupNavItem)
        }
        if (tournament.isCaptain || tournament.isRostered) {
            items.push(myTournamentTeamNavItem)
        }
        // Player-facing schedule + bracket: visible to participants and
        // admins once matches exist.
        if (
            (tournament.showPoolTools || tournament.showBracketTools) &&
            (tournament.isRostered || isAdmin)
        ) {
            items.push(tournamentScheduleViewNavItem)
        }
        if (tournament.showPoolTools) {
            items.push(tournamentScheduleNavItem)
            items.push(tournamentScoresNavItem)
        }
        if (tournament.showBracketTools) {
            items.push(tournamentScoresNavItem)
        }
        sections.push({ label: "Tournament", items })
    }

    if (showCourtMgmt) {
        sections.push({
            label: "Court Mgmt",
            items: [
                ...(showEnterScores
                    ? [enterScoresNavItem, scoreSheetInboxNavItem]
                    : []),
                ...(showAddTeamPictures ? [addTeamPicturesNavItem] : []),
                ...(showPictures ? [addPicturesNavItem] : [])
            ]
        })
    }

    if (visibleCaptainItems.length > 0) {
        sections.push({ label: "Captain Pages", items: visibleCaptainItems })
    }

    if (visibleCommissionerItems.length > 0) {
        sections.push({
            label: "Commissioners",
            items: visibleCommissionerItems
        })
    }

    if (hasConcernsAccess) {
        sections.push({ label: "Concerns", items: concernsNavItems })
    }

    if (showReffingSection) {
        sections.push({ label: "Reffing", items: reffingNavItems })
    }

    if (showManageRefsSection) {
        sections.push({ label: "Ref Management", items: manageRefsNavItems })
    }

    sections.push({ label: "Account", items: accountNavItems })

    if (!isAdmin) {
        return { sections, adminSections: [], hiddenGroups: null }
    }

    // --- Admin sections below Historical, in render order ---
    const adminSections: NavSection[] = [
        {
            label: "Admin - Season",
            items: adminSeasonNavItems.filter((item) => {
                if (item.url === "/dashboard/review-pairs")
                    return showReviewPairs
                if (item.url === "/dashboard/evaluate-players")
                    return showEvaluatePlayers
                if (tryoutVolunteerUrls.includes(item.url))
                    return showTryoutVolunteerTools
                return true
            })
        },
        { label: "Admin - General", items: adminGeneralNavItems }
    ]

    if (hasActiveTournament) {
        adminSections.push({
            label: "Admin - Tournament",
            items: adminTournamentNavItems
        })
    }

    adminSections.push({
        label: "Admin (Danger Zone)",
        items: adminDangerNavItems.filter((item) => {
            if (
                item.url === "/dashboard/create-week-1" ||
                item.url === "/dashboard/edit-week-1"
            )
                return showWeek1
            if (
                item.url === "/dashboard/create-week-2" ||
                item.url === "/dashboard/edit-week-2"
            )
                return showWeek2
            if (
                item.url === "/dashboard/create-week-3" ||
                item.url === "/dashboard/edit-week-3"
            )
                return showWeek3
            if (item.url === "/dashboard/select-commissioners")
                return showSelectCommissioners
            if (item.url === "/dashboard/create-divisions")
                return showCreateDivisions
            if (item.url === "/dashboard/create-schedule")
                return showCreateSchedule
            if (item.url === "/dashboard/tournament-config")
                return hasActiveTournament
            return true
        })
    })

    // --- Admin hidden section: every currently-suppressed item, by group ---
    const hiddenGroups: NavSection[] = []

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
            (["/dashboard/create-week-1", "/dashboard/edit-week-1"].includes(
                item.url
            ) &&
                !showWeek1) ||
            (["/dashboard/create-week-2", "/dashboard/edit-week-2"].includes(
                item.url
            ) &&
                !showWeek2) ||
            (["/dashboard/create-week-3", "/dashboard/edit-week-3"].includes(
                item.url
            ) &&
                !showWeek3) ||
            (item.url === "/dashboard/select-commissioners" &&
                !showSelectCommissioners) ||
            (item.url === "/dashboard/create-divisions" &&
                !showCreateDivisions) ||
            (item.url === "/dashboard/create-schedule" && !showCreateSchedule)
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
                ...adminTournamentNavItems,
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
        if (item.url === "/dashboard/week-2-homework") return !showWeek2Homework
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
        ...(!showEnterScores
            ? [enterScoresNavItem, scoreSheetInboxNavItem]
            : []),
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
            ...(!tournament.showPoolTools ? [tournamentScheduleNavItem] : []),
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

    // Admin - Season items: Review Pairs, Evaluate New Players, and the
    // tryout tools if suppressed
    const hiddenAdminItems = adminSeasonNavItems.filter(
        (item) =>
            (item.url === "/dashboard/review-pairs" && !showReviewPairs) ||
            (item.url === "/dashboard/evaluate-players" &&
                !showEvaluatePlayers) ||
            (tryoutVolunteerUrls.includes(item.url) &&
                !showTryoutVolunteerTools)
    )
    if (hiddenAdminItems.length > 0)
        hiddenGroups.push({
            label: "Admin - Season",
            items: hiddenAdminItems
        })

    // Sign-up link if admin's account isn't eligible
    if (!showSignupLink)
        hiddenGroups.push({ label: "Sign-Up", items: [signupNavItem] })

    return { sections, adminSections, hiddenGroups }
}
