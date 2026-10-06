import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { getActiveDiscountForUser } from "@/lib/discount"
import { getFriendsWithNextMatch } from "@/lib/friends"
import { isFriendScheduled } from "@/lib/friends-display"
import { logger } from "@/lib/logger"
import { getSeasonConfig } from "@/lib/site-config"
import { getSponsorshipForUser } from "@/lib/sponsors"
import { listSurveysForUser } from "@/lib/surveys/respondent"
import { getTournamentWaiverGate } from "@/lib/tournament-config"
import { getTournamentDashboardCard } from "@/lib/tournament-dashboard"
import { getSeasonSignup } from "../queries"

// Loaders for the signed-in dashboard home. Each takes the caller's own user
// id (resolved from the session by the page) and reads only that user's rows.

// Cards that hang off the account rather than the season phase: tournament
// waiver/team, open surveys and sponsorships. The lookups are independent.
export async function loadAccountCards(userId: string) {
    const [tournamentWaiverGate, tournamentCard, openSurveys, sponsorshipData] =
        await Promise.all([
            getTournamentWaiverGate(userId),
            getTournamentDashboardCard(userId),
            loadOpenSurveys(userId),
            loadSponsorship(userId)
        ])
    return {
        tournamentWaiverGate,
        tournamentCard,
        openSurveys,
        ...sponsorshipData
    }
}

// Only surveys that are open and still unanswered earn a nudge. Fail-soft
// for the same reason as the sponsorship lookup below: a survey query
// problem must never take the whole dashboard down.
function loadOpenSurveys(userId: string) {
    return listSurveysForUser(userId)
        .then((lists) =>
            lists.open.filter((survey) => survey.responseStatus !== "submitted")
        )
        .catch((error) => {
            logger.error("Dashboard survey lookup failed", { userId }, error)
            return []
        })
}

// Sponsor contacts get a pay/manage card; getSeasonConfig is request-cached.
// Fail-soft: a sponsor lookup problem (e.g. code deployed ahead of its
// migration) must never take the whole dashboard down.
async function loadSponsorship(userId: string) {
    const sponsorshipSeason = await getSeasonConfig()
    const sponsorship = sponsorshipSeason?.seasonId
        ? await getSponsorshipForUser(userId, sponsorshipSeason.seasonId).catch(
              (error) => {
                  logger.error(
                      "Dashboard sponsorship lookup failed",
                      { userId },
                      error
                  )
                  return null
              }
          )
        : null
    return { sponsorshipSeason, sponsorship }
}

// The current season signup state, any unused season discount, and the name
// the greeting uses.
export async function loadSeasonBasics(userId: string) {
    const [signupStatus, discount, userResult] = await Promise.all([
        getSeasonSignup(userId),
        getActiveDiscountForUser(userId, "season"),
        db
            .select({
                preferred_name: users.preferred_name,
                first_name: users.first_name
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
    ])

    const [user] = userResult
    const userName = user?.preferred_name || user?.first_name || null
    return { signupStatus, discount, userName }
}

// The card is "Friends Playing" — friends with nothing scheduled are
// still listed on the Friends page, just not surfaced here.
export async function loadScheduledFriends(userId: string, seasonId: number) {
    return (await getFriendsWithNextMatch(userId, seasonId)).filter(
        isFriendScheduled
    )
}
