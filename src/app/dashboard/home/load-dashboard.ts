import "server-only"

import { getActiveWaiver } from "@/lib/waivers"
import {
    hasCaptainPagesAccessBySession,
    isAdminOrDirectorBySession
} from "@/next/session"
import {
    loadAccountCards,
    loadScheduledFriends,
    loadSeasonBasics
} from "./load-account"
import {
    EMPTY_SEASON_PROGRESS,
    loadSeasonProgress
} from "./load-season-progress"
import {
    loadRefereeCards,
    loadStaffStats,
    loadTryoutVolunteerJobs
} from "./load-staff"

// Everything the dashboard home renders, for the signed-in caller (userId
// from the page's session) or for nobody (null). Reads only; the loaders in
// each stage are independent of one another, so each stage runs in parallel.
export async function loadDashboard(userId: string | null) {
    // Stage 1: nothing here depends on anything else.
    const [activeWaiver, accountCards, access, basics] = await Promise.all([
        getActiveWaiver(),
        userId ? loadAccountCards(userId) : null,
        userId
            ? Promise.all([
                  hasCaptainPagesAccessBySession(),
                  isAdminOrDirectorBySession()
              ])
            : ([false, false] as const),
        userId ? loadSeasonBasics(userId) : null
    ])
    const [hasTryoutSheetAccess, isAdmin] = access
    const signupStatus = basics?.signupStatus ?? null

    // Stage 2: needs the season (and isAdmin), but not each other.
    const seasonConfig = signupStatus?.config.seasonId
        ? signupStatus.config
        : null
    const [scheduledFriends, staffStats, progress, tryoutVolunteerJobs, ref] =
        await Promise.all([
            userId && signupStatus
                ? loadScheduledFriends(userId, signupStatus.config.seasonId)
                : [],
            userId && signupStatus
                ? loadStaffStats(userId, signupStatus.config.seasonId, isAdmin)
                : { evalStats: null, assignedActiveConcernsCount: 0 },
            userId && seasonConfig
                ? loadSeasonProgress(userId, seasonConfig, isAdmin)
                : EMPTY_SEASON_PROGRESS,
            userId && seasonConfig
                ? loadTryoutVolunteerJobs(userId, seasonConfig.seasonId)
                : [],
            userId && seasonConfig
                ? loadRefereeCards(
                      userId,
                      seasonConfig.seasonId,
                      seasonConfig.phase
                  )
                : {
                      refUpcomingMatches: [],
                      isRefForSeason: false,
                      isRefCoordinator: false,
                      refScheduleStatus: null
                  }
        ])

    return {
        activeWaiver,
        tournamentWaiverGate: accountCards?.tournamentWaiverGate ?? null,
        tournamentCard: accountCards?.tournamentCard ?? null,
        openSurveys: accountCards?.openSurveys ?? [],
        sponsorshipSeason: accountCards?.sponsorshipSeason ?? null,
        sponsorship: accountCards?.sponsorship ?? null,
        hasTryoutSheetAccess,
        isAdmin,
        signupStatus,
        discount: basics?.discount ?? null,
        userName: basics?.userName ?? null,
        scheduledFriends,
        ...staffStats,
        ...progress,
        tryoutVolunteerJobs,
        ...ref
    }
}
