import { describe, expect, it } from "vitest"
import { createSeason } from "@/test/factories"

// ---------------------------------------------------------------------------
// Authorization smoke test.
//
// Covers every "use server" action file WITHOUT a colocated test. The list
// was enumerated at authoring time with:
//
//   grep -rl '"use server"' src/app | while read f; do
//       d=$(dirname "$f"); b=$(basename "$f" .ts)
//       [ -f "$d/$b.test.ts" ] || [ -f "$d/$b.integration.test.ts" ] || echo "$f"
//   done
//
// Excluded because they have colocated tests: enter-scores, insurance-report
// (actions + report-logic), manage-discounts, manage-roles, manage-waivers,
// matches-worked, merge-users, pay-season, ref-compensation, report-concern,
// season-config, season-control, select-captains, select-commissioners,
// select-refs, send-email, tournament-config, tournament-pools,
// tournament-scores, onboarding/account, create-divisions, admin-create-teams,
// create-schedule, prepare-for-draft, draft-division, manage-concerns,
// tournament-signup, tournament-team, roster-actions.
//
// Each remaining exported action is called unauthenticated with minimal dummy
// arguments and must NOT throw; it must return its documented unauth shape:
//   fail  → { status: false, ... }
//   null / emptyArray / false / void → the getter's documented empty payload
// ---------------------------------------------------------------------------

import * as accessActions from "@/app/dashboard/access-actions"
import * as addPictures from "@/app/dashboard/add-pictures/actions"
import * as addTeamPictures from "@/app/dashboard/add-team-pictures/actions"
import * as adminViewSignups from "@/app/dashboard/admin-view-signups/actions"
import * as attrition from "@/app/dashboard/attrition/actions"
import * as auditLog from "@/app/dashboard/audit-log/actions"
import * as captainPairing from "@/app/dashboard/captain-pairing/actions"
import * as createWeek1 from "@/app/dashboard/create-week-1/actions"
import * as createWeek2 from "@/app/dashboard/create-week-2/actions"
import * as createWeek3 from "@/app/dashboard/create-week-3/actions"
import * as draftDay from "@/app/dashboard/draft-day/actions"
import * as draftHistory from "@/app/dashboard/draft-history/actions"
import * as draftHomework from "@/app/dashboard/draft-homework/actions"
import * as editEmails from "@/app/dashboard/edit-emails/actions"
import * as editPlayer from "@/app/dashboard/edit-player/actions"
import * as editWeek1 from "@/app/dashboard/edit-week-1/actions"
import * as editWeek2 from "@/app/dashboard/edit-week-2/actions"
import * as editWeek3 from "@/app/dashboard/edit-week-3/actions"
import * as evaluatePlayers from "@/app/dashboard/evaluate-players/actions"
import * as googleMembership from "@/app/dashboard/google-membership/actions"
import * as homeworkStatus from "@/app/dashboard/homework-status/actions"
import * as manageEmails from "@/app/dashboard/manage-emails/actions"
import * as myAvailability from "@/app/dashboard/my-availability/actions"
import * as nextMatch from "@/app/dashboard/next-match-actions"
import * as playerLookup from "@/app/dashboard/player-lookup/actions"
import * as playerLookupSignups from "@/app/dashboard/player-lookup-signups/actions"
import * as playoffs from "@/app/dashboard/playoffs/[seasonId]/actions"
import * as potentialCaptains from "@/app/dashboard/potential-captains/actions"
import * as ratePlayer from "@/app/dashboard/rate-player/actions"
import * as reffingSchedule from "@/app/dashboard/reffing-schedule/actions"
import * as reviewPairs from "@/app/dashboard/review-pairs/actions"
import * as rosters from "@/app/dashboard/rosters/[seasonId]/actions"
import * as scheduleRefs from "@/app/dashboard/schedule-refs/actions"
import * as seasonScheduleById from "@/app/dashboard/schedule/[seasonId]/actions"
import * as seasonSchedule from "@/app/dashboard/season-schedule/actions"
import * as settings from "@/app/dashboard/settings/actions"
import * as teamAvailability from "@/app/dashboard/team-availability/actions"
import * as findSub from "@/app/dashboard/team-availability/find-sub-actions"
import * as tournamentControl from "@/app/dashboard/tournament-control/actions"
import * as tournamentOverview from "@/app/dashboard/tournament-overview/actions"
import * as tournamentResults from "@/app/dashboard/tournament-results/[tournamentId]/actions"
import * as tournamentSchedule from "@/app/dashboard/tournament-schedule/actions"
import * as tournamentScheduleView from "@/app/dashboard/tournament-schedule-view/actions"
import * as viewSignups from "@/app/dashboard/view-signups/actions"
import * as viewTournamentWaitlist from "@/app/dashboard/view-tournament-waitlist/actions"
import * as viewWaitlist from "@/app/dashboard/view-waitlist/actions"
import * as volleyballProfile from "@/app/dashboard/volleyball-profile/actions"
import * as week2Homework from "@/app/dashboard/week-2-homework/actions"
import * as onboardingVolleyball from "@/app/onboarding/volleyball-profile/actions"

type Kind = "fail" | "null" | "emptyArray" | "false" | "void"

interface SmokeCase {
    name: string
    kind: Kind
    call: () => Promise<unknown>
}

const c = (
    name: string,
    kind: Kind,
    call: () => Promise<unknown>
): SmokeCase => ({ name, kind, call })

const cases: SmokeCase[] = [
    // access-actions — session-status getters return false/null unauth
    c("access.getSignupEligibility", "false", () =>
        accessActions.getSignupEligibility()
    ),
    c("access.getIsAdminOrDirector", "false", () =>
        accessActions.getIsAdminOrDirector()
    ),
    c("access.getIsCommissioner", "false", () =>
        accessActions.getIsCommissioner()
    ),
    c("access.getHasCaptainPagesAccess", "false", () =>
        accessActions.getHasCaptainPagesAccess()
    ),
    c("access.getHasPicturesAccess", "false", () =>
        accessActions.getHasPicturesAccess()
    ),
    c("access.getHasConcernsAccess", "false", () =>
        accessActions.getHasConcernsAccess()
    ),
    c("access.getSeasonPhase", "null", () => accessActions.getSeasonPhase()),
    // add-pictures
    c("addPictures.getPlayersNeedingPictures", "fail", () =>
        addPictures.getPlayersNeedingPictures()
    ),
    c("addPictures.createMissingPictureUpload", "fail", () =>
        addPictures.createMissingPictureUpload("u", 100)
    ),
    c("addPictures.finalizeMissingPictureUpload", "fail", () =>
        addPictures.finalizeMissingPictureUpload("u", "pic.jpg")
    ),
    // add-team-pictures
    c("addTeamPictures.getTeamsForPicturePage", "fail", () =>
        addTeamPictures.getTeamsForPicturePage()
    ),
    c("addTeamPictures.createTeamPhotoUpload", "fail", () =>
        addTeamPictures.createTeamPhotoUpload(1, 100)
    ),
    c("addTeamPictures.finalizeTeamPhotoUpload", "fail", () =>
        addTeamPictures.finalizeTeamPhotoUpload(1, "key")
    ),
    // admin-view-signups
    c("adminViewSignups.getSeasonSignups", "fail", () =>
        adminViewSignups.getSeasonSignups()
    ),
    c("adminViewSignups.deleteSignupEntry", "fail", () =>
        adminViewSignups.deleteSignupEntry(1, "dup")
    ),
    c("adminViewSignups.logAdminCsvDownload", "void", () =>
        adminViewSignups.logAdminCsvDownload()
    ),
    c("adminViewSignups.getDeletedSignups", "fail", () =>
        adminViewSignups.getDeletedSignups()
    ),
    // attrition / audit-log / captain-pairing
    c("attrition.getAttritionData", "fail", () => attrition.getAttritionData()),
    c("auditLog.getAuditLogs", "fail", () => auditLog.getAuditLogs()),
    c("captainPairing.updateSignupPreferences", "fail", () =>
        captainPairing.updateSignupPreferences(1, {} as never)
    ),
    // create-week-*
    c("createWeek1.getCreateWeek1Data", "fail", () =>
        createWeek1.getCreateWeek1Data()
    ),
    c("createWeek1.saveWeek1Rosters", "fail", () =>
        createWeek1.saveWeek1Rosters([])
    ),
    c("createWeek2.getCreateWeek2Data", "fail", () =>
        createWeek2.getCreateWeek2Data()
    ),
    c("createWeek2.saveWeek2Rosters", "fail", () =>
        createWeek2.saveWeek2Rosters([])
    ),
    c("createWeek3.getCreateWeek3Data", "fail", () =>
        createWeek3.getCreateWeek3Data()
    ),
    c("createWeek3.saveWeek3Rosters", "fail", () =>
        createWeek3.saveWeek3Rosters([])
    ),
    // draft-day
    c("draftDay.getDraftDayData", "fail", () => draftDay.getDraftDayData()),
    c("draftDay.saveDraftOrder", "fail", () => draftDay.saveDraftOrder([])),
    c("draftDay.getDraftSheetData", "fail", () => draftDay.getDraftSheetData()),
    // draft-history — admin-only getters return [] unauth
    c("draftHistory.getAvailableYears", "emptyArray", () =>
        draftHistory.getAvailableYears()
    ),
    c("draftHistory.getSeasonsForYear", "emptyArray", () =>
        draftHistory.getSeasonsForYear(2026)
    ),
    c("draftHistory.getDivisionsForSeason", "emptyArray", () =>
        draftHistory.getDivisionsForSeason(1)
    ),
    c("draftHistory.getDraftResults", "fail", () =>
        draftHistory.getDraftResults(1, 1)
    ),
    // draft-homework
    c("draftHomework.getDraftHomeworkData", "fail", () =>
        draftHomework.getDraftHomeworkData()
    ),
    c("draftHomework.saveDraftHomework", "fail", () =>
        draftHomework.saveDraftHomework({} as never)
    ),
    c("draftHomework.getLastSeasonDraft", "fail", () =>
        draftHomework.getLastSeasonDraft()
    ),
    // edit-emails
    c("editEmails.getEmailTemplates", "fail", () =>
        editEmails.getEmailTemplates()
    ),
    c("editEmails.updateEmailTemplate", "fail", () =>
        editEmails.updateEmailTemplate(1, "n", null, {} as never)
    ),
    c("editEmails.createEmailTemplate", "fail", () =>
        editEmails.createEmailTemplate("n")
    ),
    // edit-player
    c("editPlayer.getUsers", "emptyArray", () => editPlayer.getUsers()),
    c("editPlayer.getUserDetails", "fail", () =>
        editPlayer.getUserDetails("u")
    ),
    c("editPlayer.createPlayerPictureUpload", "fail", () =>
        editPlayer.createPlayerPictureUpload("u", 100)
    ),
    c("editPlayer.finalizePlayerPictureUpload", "fail", () =>
        editPlayer.finalizePlayerPictureUpload("u", "pic.jpg")
    ),
    c("editPlayer.updateUser", "fail", () =>
        editPlayer.updateUser("u", {} as never)
    ),
    c("editPlayer.getSignupForCurrentSeason", "fail", () =>
        editPlayer.getSignupForCurrentSeason("u")
    ),
    c("editPlayer.updateSignup", "fail", () =>
        editPlayer.updateSignup(1, {} as never)
    ),
    // edit-week-*
    c("editWeek1.getEditWeek1Data", "fail", () => editWeek1.getEditWeek1Data()),
    c("editWeek1.updateWeek1Rosters", "fail", () =>
        editWeek1.updateWeek1Rosters([])
    ),
    c("editWeek1.sendWeek1RosterNotifications", "fail", () =>
        editWeek1.sendWeek1RosterNotifications([], [], "")
    ),
    c("editWeek2.getEditWeek2Data", "fail", () => editWeek2.getEditWeek2Data()),
    c("editWeek2.updateWeek2Rosters", "fail", () =>
        editWeek2.updateWeek2Rosters([])
    ),
    c("editWeek2.sendWeek2RosterNotifications", "fail", () =>
        editWeek2.sendWeek2RosterNotifications([], [], "")
    ),
    c("editWeek3.getEditWeek3Data", "fail", () => editWeek3.getEditWeek3Data()),
    c("editWeek3.updateWeek3Rosters", "fail", () =>
        editWeek3.updateWeek3Rosters([])
    ),
    c("editWeek3.sendWeek3RosterNotifications", "fail", () =>
        editWeek3.sendWeek3RosterNotifications([], [], "")
    ),
    // evaluate-players / google-membership
    c("evaluatePlayers.getNewPlayers", "fail", () =>
        evaluatePlayers.getNewPlayers()
    ),
    c("evaluatePlayers.saveEvaluations", "fail", () =>
        evaluatePlayers.saveEvaluations([])
    ),
    c("googleMembership.getGoogleMembershipUsers", "fail", () =>
        googleMembership.getGoogleMembershipUsers()
    ),
    c("googleMembership.updateGoogleMembership", "fail", () =>
        googleMembership.updateGoogleMembership("u", {} as never)
    ),
    // homework-status
    c("homeworkStatus.getHomeworkStatusData", "fail", () =>
        homeworkStatus.getHomeworkStatusData()
    ),
    c("homeworkStatus.getRatePlayersDetail", "fail", () =>
        homeworkStatus.getRatePlayersDetail("u", 1)
    ),
    c("homeworkStatus.getMovingDayDetail", "fail", () =>
        homeworkStatus.getMovingDayDetail("u", 1)
    ),
    c("homeworkStatus.getDraftHomeworkDetail", "fail", () =>
        homeworkStatus.getDraftHomeworkDetail("u", 1)
    ),
    // manage-emails
    c("manageEmails.getInboundEmails", "fail", () =>
        manageEmails.getInboundEmails()
    ),
    c("manageEmails.getEmailThread", "fail", () =>
        manageEmails.getEmailThread(1)
    ),
    c("manageEmails.sendEmailReply", "fail", () =>
        manageEmails.sendEmailReply(1, "body")
    ),
    c("manageEmails.addInboundEmailComment", "fail", () =>
        manageEmails.addInboundEmailComment(1, "note")
    ),
    c("manageEmails.assignInboundEmail", "fail", () =>
        manageEmails.assignInboundEmail(1, null)
    ),
    c("manageEmails.closeInboundEmail", "fail", () =>
        manageEmails.closeInboundEmail(1)
    ),
    c("manageEmails.reopenInboundEmail", "fail", () =>
        manageEmails.reopenInboundEmail(1)
    ),
    c("manageEmails.markInboundEmailAsSpam", "fail", () =>
        manageEmails.markInboundEmailAsSpam(1)
    ),
    c("manageEmails.unmarkInboundEmailAsSpam", "fail", () =>
        manageEmails.unmarkInboundEmailAsSpam(1)
    ),
    c("manageEmails.getAssignableAdmins", "emptyArray", () =>
        manageEmails.getAssignableAdmins()
    ),
    // my-availability
    c("myAvailability.updatePlayerAvailability", "fail", () =>
        myAvailability.updatePlayerAvailability(1, [])
    ),
    c("myAvailability.updateRefAvailability", "fail", () =>
        myAvailability.updateRefAvailability([])
    ),
    // next-match
    c("nextMatch.getNextMatch", "null", () => nextMatch.getNextMatch("u", 1)),
    c("nextMatch.getPlayoffNextMatches", "null", () =>
        nextMatch.getPlayoffNextMatches("u", 1)
    ),
    // player-lookup
    c("playerLookup.getPlayersForLookup", "fail", () =>
        playerLookup.getPlayersForLookup()
    ),
    c("playerLookup.getPlayerDetails", "fail", () =>
        playerLookup.getPlayerDetails("u")
    ),
    c("playerLookup.getPlayerSubHistory", "emptyArray", () =>
        playerLookup.getPlayerSubHistory("u")
    ),
    c("playerLookupSignups.getSignedUpPlayers", "fail", () =>
        playerLookupSignups.getSignedUpPlayers()
    ),
    c("playerLookupSignups.getPlayerDetailsForSignups", "fail", () =>
        playerLookupSignups.getPlayerDetailsForSignups("u")
    ),
    // playoffs / potential-captains
    c("playoffs.getPlayoffData", "fail", () => playoffs.getPlayoffData(1)),
    c("potentialCaptains.getPotentialCaptainPlayerDetails", "fail", () =>
        potentialCaptains.getPotentialCaptainPlayerDetails("u")
    ),
    c("potentialCaptains.getPotentialCaptainsData", "fail", () =>
        potentialCaptains.getPotentialCaptainsData()
    ),
    // rate-player
    c("ratePlayer.getRatePlayerData", "fail", () =>
        ratePlayer.getRatePlayerData()
    ),
    c("ratePlayer.savePlayerSkillRating", "fail", () =>
        ratePlayer.savePlayerSkillRating("u", "serve" as never, 1)
    ),
    c("ratePlayer.savePlayerSkillRatings", "fail", () =>
        ratePlayer.savePlayerSkillRatings("u", {} as never)
    ),
    c("ratePlayer.savePlayerRatingNote", "fail", () =>
        ratePlayer.savePlayerRatingNote("u", "general" as never, "n")
    ),
    // reffing-schedule / review-pairs
    c("reffingSchedule.getReffingScheduleData", "fail", () =>
        reffingSchedule.getReffingScheduleData()
    ),
    c("reviewPairs.getSeasonPairs", "fail", () => reviewPairs.getSeasonPairs()),
    c("reviewPairs.bustMatchedPair", "fail", () =>
        reviewPairs.bustMatchedPair("a", "b")
    ),
    c("reviewPairs.bustUnmatchedPair", "fail", () =>
        reviewPairs.bustUnmatchedPair("a")
    ),
    c("reviewPairs.completeUnmatchedPair", "fail", () =>
        reviewPairs.completeUnmatchedPair("a", "b")
    ),
    // rosters / schedules
    c("rosters.getRosterData", "fail", () => rosters.getRosterData(1)),
    c("scheduleRefs.getScheduleRefsData", "fail", () =>
        scheduleRefs.getScheduleRefsData()
    ),
    c("scheduleRefs.getMatchesAndRefsForDate", "fail", () =>
        scheduleRefs.getMatchesAndRefsForDate("2026-01-01")
    ),
    c("scheduleRefs.saveRefAssignments", "fail", () =>
        scheduleRefs.saveRefAssignments("2026-01-01", [])
    ),
    c("scheduleById.getSeasonScheduleData", "fail", () =>
        seasonScheduleById.getSeasonScheduleData(1)
    ),
    c("seasonSchedule.getCurrentSeasonScheduleData", "fail", () =>
        seasonSchedule.getCurrentSeasonScheduleData(1)
    ),
    // settings
    c("settings.getAccountProfile", "fail", () => settings.getAccountProfile()),
    c("settings.updateAccountField", "fail", () =>
        settings.updateAccountField("phone" as never, null)
    ),
    c("settings.updateAccountProfile", "fail", () =>
        settings.updateAccountProfile({} as never)
    ),
    // team-availability + find-sub
    c("teamAvailability.getAllSeasonTeams", "fail", () =>
        teamAvailability.getAllSeasonTeams()
    ),
    c("teamAvailability.getTeamAvailabilityData", "fail", () =>
        teamAvailability.getTeamAvailabilityData()
    ),
    c("findSub.getRegularSubCandidates", "fail", () =>
        findSub.getRegularSubCandidates(1, 1, [])
    ),
    c("findSub.getPermanentSubCandidates", "fail", () =>
        findSub.getPermanentSubCandidates(1, "u")
    ),
    c("findSub.getSubContactDetails", "fail", () =>
        findSub.getSubContactDetails("u", 1)
    ),
    c("findSub.getWaitlistOptions", "fail", () =>
        findSub.getWaitlistOptions(1)
    ),
    c("findSub.lockInPermanentSub", "fail", () =>
        findSub.lockInPermanentSub({} as never)
    ),
    c("findSub.lockInRegularSub", "fail", () =>
        findSub.lockInRegularSub({} as never)
    ),
    c("findSub.logSubContactViewed", "void", () =>
        findSub.logSubContactViewed(1, "u", "name")
    ),
    // tournaments
    c("tournamentControl.getCurrentTournamentPhaseData", "fail", () =>
        tournamentControl.getCurrentTournamentPhaseData()
    ),
    c("tournamentControl.advanceTournamentPhase", "fail", () =>
        tournamentControl.advanceTournamentPhase(1, "pool_play" as never)
    ),
    c("tournamentControl.revertTournamentPhase", "fail", () =>
        tournamentControl.revertTournamentPhase(1, "registration_open" as never)
    ),
    c("tournamentControl.endTournamentEarly", "fail", () =>
        tournamentControl.endTournamentEarly(1)
    ),
    c("tournamentControl.getTournamentPlacements", "fail", () =>
        tournamentControl.getTournamentPlacements(1)
    ),
    c("tournamentOverview.withdrawTournamentTeam", "fail", () =>
        tournamentOverview.withdrawTournamentTeam(1)
    ),
    c("tournamentOverview.getTournamentOverview", "fail", () =>
        tournamentOverview.getTournamentOverview()
    ),
    c("tournamentResults.getTournamentResults", "fail", () =>
        tournamentResults.getTournamentResults(1)
    ),
    c("tournamentSchedule.getScheduleView", "fail", () =>
        tournamentSchedule.getScheduleView()
    ),
    c("tournamentSchedule.updateScheduleRow", "fail", () =>
        tournamentSchedule.updateScheduleRow(1, {
            court: null,
            startTime: null,
            workTeamId: null
        })
    ),
    c("tournamentScheduleView.getTournamentScheduleView", "fail", () =>
        tournamentScheduleView.getTournamentScheduleView()
    ),
    // view-*
    c("viewSignups.getSignupsCsvData", "fail", () =>
        viewSignups.getSignupsCsvData()
    ),
    c("viewSignups.getSignupsData", "fail", () => viewSignups.getSignupsData()),
    c("viewSignups.getPlayerDetailsPublic", "fail", () =>
        viewSignups.getPlayerDetailsPublic("u")
    ),
    c("viewTournamentWaitlist.expressTournamentInterest", "fail", () =>
        viewTournamentWaitlist.expressTournamentInterest(1, true, null)
    ),
    c("viewTournamentWaitlist.withdrawTournamentInterest", "fail", () =>
        viewTournamentWaitlist.withdrawTournamentInterest()
    ),
    c("viewTournamentWaitlist.removeWaitlistPlayer", "fail", () =>
        viewTournamentWaitlist.removeWaitlistPlayer(1)
    ),
    c("viewTournamentWaitlist.getTournamentWaitlist", "fail", () =>
        viewTournamentWaitlist.getTournamentWaitlist()
    ),
    c("viewTournamentWaitlist.placeWaitlistPlayerOnTeam", "fail", () =>
        viewTournamentWaitlist.placeWaitlistPlayerOnTeam(1, 1)
    ),
    c("viewWaitlist.getSeasonWaitlist", "fail", () =>
        viewWaitlist.getSeasonWaitlist()
    ),
    c("viewWaitlist.setWaitlistApproval", "fail", () =>
        viewWaitlist.setWaitlistApproval(1, true)
    ),
    // volleyball-profile / week-2 homework / onboarding
    c("volleyballProfile.getVolleyballProfile", "fail", () =>
        volleyballProfile.getVolleyballProfile()
    ),
    c("volleyballProfile.updateVolleyballProfile", "fail", () =>
        volleyballProfile.updateVolleyballProfile({} as never)
    ),
    c("week2Homework.getWeek2HomeworkData", "fail", () =>
        week2Homework.getWeek2HomeworkData()
    ),
    c("week2Homework.submitWeek2Homework", "fail", () =>
        week2Homework.submitWeek2Homework({} as never)
    ),
    c("week2Homework.submitCoachWeek2Homework", "fail", () =>
        week2Homework.submitCoachWeek2Homework({} as never)
    ),
    c("onboardingVolleyball.getOnboardingVolleyballData", "null", () =>
        onboardingVolleyball.getOnboardingVolleyballData()
    ),
    c("onboardingVolleyball.completeOnboarding", "fail", () =>
        onboardingVolleyball.completeOnboarding({} as never)
    )
]

function matchesKind(kind: Kind, result: unknown): boolean {
    switch (kind) {
        case "fail":
            return (
                typeof result === "object" &&
                result !== null &&
                (result as { status?: unknown }).status === false
            )
        case "null":
            return result === null
        case "emptyArray":
            return Array.isArray(result) && result.length === 0
        case "false":
            return result === false
        case "void":
            return result === undefined
    }
}

describe("authorization smoke: untested server actions", () => {
    it("every action rejects unauthenticated callers with its failure shape and never throws", async () => {
        // A current season exists so season-config gates pass through to the
        // real auth checks instead of failing on "no season".
        await createSeason()

        const problems: string[] = []
        for (const smokeCase of cases) {
            let result: unknown
            try {
                result = await smokeCase.call()
            } catch (error) {
                problems.push(`${smokeCase.name} threw: ${String(error)}`)
                continue
            }
            if (!matchesKind(smokeCase.kind, result)) {
                const rendered = JSON.stringify(result)
                problems.push(
                    `${smokeCase.name} expected ${smokeCase.kind} but returned: ${rendered?.slice(0, 200)}`
                )
            }
        }
        expect(problems).toEqual([])
    }, 60000)
})
