import { Suspense } from "react"
import { PageHeader } from "@/components/layout/page-header"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { formatSeasonLabel } from "@/lib/site-config"
import { WelcomeTeamCard } from "./captain-info-card"
import { PlayoffNextMatchCard } from "@/components/dashboard/playoff-next-match-card"
import { SurveyCard } from "@/components/dashboard/survey-card"
import { FriendsCard } from "@/components/dashboard/friends-card"
import { playerPicBaseUrl } from "@/config/env"
import { TournamentWaiverCard } from "@/components/dashboard/tournament-waiver-card"
import { TournamentDashboardCard } from "@/components/dashboard/tournament-card"
import { SponsorshipCard } from "@/components/dashboard/sponsorship-card"
import { loadDashboard } from "./home/load-dashboard"
import { NextMatchCard } from "./home/next-match-card"
import { RefAssignmentsCard, RefSchedulingCard } from "./home/referee-cards"
import {
    TryoutTeamRosterCard,
    Week1RosterCard
} from "./home/tryout-roster-cards"
import {
    AdminCaptainSelectionCard,
    CommissionerCaptainSelectionCard
} from "./home/captain-selection-cards"
import {
    AssignedConcernsCard,
    EvaluateNewPlayersCard,
    RatePlayersCard,
    TryoutMaterialsCard
} from "./home/staff-cards"
import { DraftHomeworkCard, Week2HomeworkCard } from "./home/homework-cards"
import { TryoutVolunteerJobsCard } from "./home/volunteer-jobs-card"
import { DiscountCard } from "./home/discount-card"
import { SeasonStatusCard } from "./home/season-status-card"
import { PreviousSeasonsSection } from "./home/previous-seasons-section"

export type { PreviousSeason } from "./queries"

export const metadata: Metadata = {
    title: "Dashboard"
}

// The signed-in dashboard home: a wall of cards, each shown only when it
// applies to this user in the current season phase. Data comes from
// ./home/load-dashboard; each card lives in ./home.
export default async function DashboardPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    const data = await loadDashboard(session?.user ? session.user.id : null)
    const { signupStatus, isAdmin, hasTryoutSheetAccess } = data
    const phase = signupStatus?.config.phase

    const seasonLabel = signupStatus
        ? formatSeasonLabel(signupStatus.config)
        : null

    const tryoutMaterialsWeek: 1 | 2 | 3 | null = (() => {
        if (!signupStatus) return null
        if (
            ["select_captains", "prep_tryout_week_1"].includes(
                signupStatus.config.phase
            ) &&
            data.hasWeek1RosterData
        )
            return 1
        if (phase === "prep_tryout_week_2" && data.hasWeek2RosterData) return 2
        if (phase === "prep_tryout_week_3" && data.hasWeek3RosterData) return 3
        return null
    })()
    const shouldShowTryoutMaterialsCard = !!(
        tryoutMaterialsWeek &&
        (hasTryoutSheetAccess || isAdmin)
    )
    const shouldShowRatePlayersCard = !!(
        signupStatus &&
        ["prep_tryout_week_2", "prep_tryout_week_3"].includes(
            signupStatus.config.phase
        ) &&
        (isAdmin || data.isCurrentSeasonCommissioner || hasTryoutSheetAccess)
    )
    const shouldShowWeek2HomeworkCard = !!(
        signupStatus &&
        phase === "prep_tryout_week_3" &&
        data.isWeek2Captain
    )
    const shouldShowDraftHomeworkCard = !!(
        signupStatus &&
        ["prep_tryout_week_3", "draft"].includes(signupStatus.config.phase) &&
        data.isSeasonCaptain &&
        !data.isDivisionDrafted
    )
    const shouldShowWelcomeTeamCard = !!(
        signupStatus &&
        [
            "prep_tryout_week_3",
            "draft",
            "regular_season",
            "playoffs",
            "complete"
        ].includes(signupStatus.config.phase) &&
        (data.isSeasonCaptain || data.isSeasonCoach) &&
        data.isDivisionDrafted &&
        data.captainWelcomeData
    )
    const shouldShowEvaluateNewPlayersCard = !!(
        isAdmin &&
        data.evalStats &&
        signupStatus &&
        [
            "registration_open",
            "select_commissioners",
            "select_captains",
            "prep_tryout_week_1"
        ].includes(signupStatus.config.phase)
    )

    const greeting = data.userName
        ? `Hi ${data.userName}, Welcome back 👋`
        : "Hi, Welcome back 👋"

    return (
        <div className="space-y-6">
            <PageHeader
                title={greeting}
                description="Here's what's happening with your account today."
            />

            <div className="flex flex-wrap gap-6">
                {data.tournamentWaiverGate && data.activeWaiver && (
                    <TournamentWaiverCard
                        tournamentName={
                            data.tournamentWaiverGate.tournamentName
                        }
                        waiver={data.activeWaiver}
                    />
                )}
                {data.tournamentCard && (
                    <TournamentDashboardCard data={data.tournamentCard} />
                )}
                {data.sponsorship && data.sponsorshipSeason && (
                    <SponsorshipCard
                        sponsorship={data.sponsorship}
                        seasonLabel={formatSeasonLabel(data.sponsorshipSeason)}
                    />
                )}
                {data.playoffNextMatches && (
                    <PlayoffNextMatchCard data={data.playoffNextMatches} />
                )}
                {!data.playoffNextMatches && data.nextMatch && (
                    <NextMatchCard nextMatch={data.nextMatch} />
                )}
                {data.isRefForSeason && data.refUpcomingMatches.length > 0 && (
                    <RefAssignmentsCard matches={data.refUpcomingMatches} />
                )}
                {data.isRefCoordinator && data.refScheduleStatus && (
                    <RefSchedulingCard status={data.refScheduleStatus} />
                )}
                {data.userWeek3Roster && signupStatus && (
                    <TryoutTeamRosterCard
                        week={3}
                        roster={data.userWeek3Roster}
                        config={signupStatus.config}
                    />
                )}
                {!isAdmin &&
                    data.isCurrentSeasonCommissioner &&
                    phase === "select_captains" && (
                        <CommissionerCaptainSelectionCard
                            statuses={data.commissionerCaptainStatuses}
                        />
                    )}
                {isAdmin && phase === "select_captains" && (
                    <AdminCaptainSelectionCard
                        statuses={data.adminCaptainStatuses}
                    />
                )}
                {shouldShowEvaluateNewPlayersCard && data.evalStats && (
                    <EvaluateNewPlayersCard evalStats={data.evalStats} />
                )}
                {data.assignedActiveConcernsCount > 0 && (
                    <AssignedConcernsCard
                        count={data.assignedActiveConcernsCount}
                    />
                )}
                {shouldShowWeek2HomeworkCard && <Week2HomeworkCard />}
                {shouldShowDraftHomeworkCard && <DraftHomeworkCard />}

                <SurveyCard surveys={data.openSurveys} />

                {shouldShowWelcomeTeamCard && data.captainWelcomeData && (
                    <WelcomeTeamCard data={data.captainWelcomeData} />
                )}
                {data.tryoutVolunteerJobs.length > 0 && (
                    <TryoutVolunteerJobsCard jobs={data.tryoutVolunteerJobs} />
                )}
                {data.userWeek2Roster && signupStatus && (
                    <TryoutTeamRosterCard
                        week={2}
                        roster={data.userWeek2Roster}
                        config={signupStatus.config}
                    />
                )}
                {data.userWeek1Roster && signupStatus && (
                    <Week1RosterCard
                        roster={data.userWeek1Roster}
                        config={signupStatus.config}
                    />
                )}
                {shouldShowTryoutMaterialsCard && tryoutMaterialsWeek && (
                    <TryoutMaterialsCard
                        week={tryoutMaterialsWeek}
                        hasTryoutSheetAccess={hasTryoutSheetAccess}
                        isAdmin={isAdmin}
                    />
                )}
                {shouldShowRatePlayersCard && <RatePlayersCard />}
                {data.discount && signupStatus && !signupStatus.signup && (
                    <DiscountCard
                        discount={data.discount}
                        phase={signupStatus.config.phase}
                    />
                )}
                {signupStatus && (
                    <SeasonStatusCard
                        signupStatus={signupStatus}
                        seasonLabel={seasonLabel}
                        playerTeamAssignment={data.playerTeamAssignment}
                        activeWaiver={data.activeWaiver}
                    />
                )}
                {data.scheduledFriends.length > 0 && (
                    <FriendsCard
                        data={{
                            playerPicUrl: playerPicBaseUrl(),
                            friends: data.scheduledFriends
                        }}
                    />
                )}
            </div>

            {session?.user && (
                <Suspense>
                    <PreviousSeasonsSection userId={session.user.id} />
                </Suspense>
            )}
        </div>
    )
}
