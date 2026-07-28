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
    RiCheckboxLine,
    RiClipboardLine,
    RiInboxLine,
    RiImageLine,
    RiNotification3Line
} from "@remixicon/react"

export type NavItem = {
    title: string
    url: string
    icon: typeof RiSpeedUpLine
}

export const myAvailabilityNavItem: NavItem = {
    title: "My Availability",
    url: "/dashboard/my-availability",
    icon: RiCheckboxLine
}

export const captainPairingNavItem: NavItem = {
    title: "Captain & Pairing",
    url: "/dashboard/captain-pairing",
    icon: RiStarLine
}

export const baseNavItems: NavItem[] = [
    { title: "Dashboard", url: "/dashboard", icon: RiSpeedUpLine },
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

export const hallOfChampionsNavItem: NavItem = {
    title: "Hall of Champions",
    url: "/dashboard/hall-of-champions",
    icon: RiTrophyLine
}

export const accountNavItems: NavItem[] = [
    { title: "Account", url: "/dashboard/account", icon: RiUser3Line },
    {
        title: "Volleyball Profile",
        url: "/dashboard/volleyball-profile",
        icon: RiBasketballLine
    },
    {
        title: "Notifications",
        url: "/dashboard/notifications",
        icon: RiNotification3Line
    },
    { title: "Security", url: "/dashboard/security", icon: RiShieldLine },
    { title: "Analytics", url: "/dashboard/analytics", icon: RiLineChartLine }
]

export const concernsNavItems: NavItem[] = [
    {
        title: "Manage Concerns",
        url: "/dashboard/manage-concerns",
        icon: RiFileWarningLine
    }
]

export const reffingNavItems: NavItem[] = [
    {
        title: "Reffing Schedule",
        url: "/dashboard/reffing-schedule",
        icon: RiCalendarLine
    },
    {
        title: "Matches Worked",
        url: "/dashboard/matches-worked",
        icon: RiClipboardLine
    }
]

export const manageRefsNavItems: NavItem[] = [
    {
        title: "Select Refs",
        url: "/dashboard/select-refs",
        icon: RiGroupLine
    },
    {
        title: "Schedule Refs",
        url: "/dashboard/schedule-refs",
        icon: RiCalendarLine
    },
    {
        title: "Ref Compensation",
        url: "/dashboard/ref-compensation",
        icon: RiCoupon3Line
    }
]

export const signupNavItem: NavItem = {
    title: "Sign-up for Season",
    url: "/dashboard/pay-season",
    icon: RiEditLine
}

export const adminNavItems: NavItem[] = [
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
        title: "Send Email",
        url: "/dashboard/send-email",
        icon: RiMailLine
    },
    {
        title: "Manage Emails",
        url: "/dashboard/manage-emails",
        icon: RiInboxLine
    },
    {
        title: "View Waitlist",
        url: "/dashboard/view-waitlist",
        icon: RiTimeLine
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
        title: "Draft History",
        url: "/dashboard/draft-history",
        icon: RiFileList3Line
    },
    {
        title: "Audit Log",
        url: "/dashboard/audit-log",
        icon: RiHistoryLine
    },
    {
        title: "Tournament Overview",
        url: "/dashboard/tournament-overview",
        icon: RiTrophyLine
    },
    {
        title: "Tournament Pools",
        url: "/dashboard/tournament-pools",
        icon: RiTeamLine
    },
    {
        title: "Place Tournament Players",
        url: "/dashboard/view-tournament-waitlist",
        icon: RiGroupLine
    },
    {
        title: "Insurance Report",
        url: "/dashboard/insurance-report",
        icon: RiShieldLine
    }
]

export const adminDangerNavItems: NavItem[] = [
    {
        title: "Season Control",
        url: "/dashboard/season-control",
        icon: RiSettings3Line
    },
    {
        title: "Season Configuration",
        url: "/dashboard/season-config",
        icon: RiCalendarLine
    },
    {
        title: "Tournament Control",
        url: "/dashboard/tournament-control",
        icon: RiSettings3Line
    },
    {
        title: "Tournament Configuration",
        url: "/dashboard/tournament-config",
        icon: RiTrophyLine
    },
    {
        title: "Manage Roles",
        url: "/dashboard/manage-roles",
        icon: RiUserSettingsLine
    },
    {
        title: "Manage Waivers",
        url: "/dashboard/manage-waivers",
        icon: RiFileWarningLine
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
export const alwaysHiddenAdminItems: NavItem[] = [
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

export const week1NavItem: NavItem = {
    title: "Pre-Season Week 1",
    url: "/dashboard/preseason-week-1",
    icon: RiCalendarLine
}
export const week2NavItem: NavItem = {
    title: "Pre-Season Week 2",
    url: "/dashboard/preseason-week-2",
    icon: RiCalendarLine
}
export const week3NavItem: NavItem = {
    title: "Pre-Season Week 3",
    url: "/dashboard/preseason-week-3",
    icon: RiCalendarLine
}

export const currentRostersNavItem: NavItem = {
    title: "Rosters",
    url: "/dashboard/rosters",
    icon: RiTeamLine
}

export const scheduleNavItem: NavItem = {
    title: "Schedule",
    url: "/dashboard/season-schedule",
    icon: RiCalendarLine
}

export const playoffsNavItem: NavItem = {
    title: "Playoffs",
    url: "/dashboard/season-playoffs",
    icon: RiTrophyLine
}

export const enterScoresNavItem: NavItem = {
    title: "Enter Scores",
    url: "/dashboard/enter-scores",
    icon: RiClipboardLine
}

export const addPicturesNavItem: NavItem = {
    title: "Add Pictures",
    url: "/dashboard/add-pictures",
    icon: RiEditLine
}

export const addTeamPicturesNavItem: NavItem = {
    title: "Add Team Pictures",
    url: "/dashboard/add-team-pictures",
    icon: RiImageLine
}

export const commissionerNavItems: NavItem[] = [
    {
        title: "Send Email",
        url: "/dashboard/send-email",
        icon: RiMailLine
    },
    {
        title: "Homework Status",
        url: "/dashboard/homework-status",
        icon: RiCheckboxLine
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
        title: "Prepare for Draft",
        url: "/dashboard/prepare-for-draft",
        icon: RiFileList3Line
    },
    {
        title: "Draft Day",
        url: "/dashboard/draft-day",
        icon: RiFileList3Line
    }
]

export const captainPagesNavItems: NavItem[] = [
    {
        title: "Team Availability",
        url: "/dashboard/team-availability",
        icon: RiCalendarLine
    },
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

export const seasonCategories = [
    { key: "rosters", label: "Rosters", basePath: "/dashboard/rosters" },
    { key: "schedule", label: "Season", basePath: "/dashboard/schedule" },
    { key: "playoffs", label: "Playoffs", basePath: "/dashboard/playoffs" }
]
