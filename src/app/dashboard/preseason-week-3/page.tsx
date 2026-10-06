import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { DivisionWeekView } from "@/components/preseason/division-week-view"
import { StatusBanner } from "@/components/ui/status-banner"
import { listFriendIds } from "@/lib/friends"
import { loadDivisionWeekRosters } from "@/lib/preseason/division-week-rosters"
import { formatEventDate, getEventsByType } from "@/lib/season-utils"
import { getSeasonConfig } from "@/lib/site-config"
import { requireSessionOrRedirect } from "@/next/page-guards"

export const metadata: Metadata = {
    title: "Pre-Season Week 3"
}

export const dynamic = "force-dynamic"

export default async function PreseasonWeek3Page() {
    const session = await requireSessionOrRedirect()

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Pre-Season Week 3"
                    description="Preseason week 3 roster assignments grouped by division."
                />
                <StatusBanner variant="error">
                    No current season found.
                </StatusBanner>
            </div>
        )
    }

    const [friendIds, divisions] = await Promise.all([
        listFriendIds(session.user.id),
        loadDivisionWeekRosters(config.seasonId, 3)
    ])
    const firstRegularSeason = getEventsByType(config, "regular_season")[0]
    const season1DateDisplay = firstRegularSeason
        ? formatEventDate(firstRegularSeason.eventDate)
        : "TBD"

    return (
        <DivisionWeekView
            week={3}
            config={config}
            divisions={divisions}
            userId={session.user.id}
            friendIds={friendIds}
            intro={
                <>
                    <h2 className="font-semibold text-sm uppercase tracking-wide">
                        ABOUT THE PRESEASON ROSTERS FOR WEEK 3 - Preseason
                        &quot;Moving Day&quot; Draft
                    </h2>
                    <p className="text-sm">
                        The league has conducted another preseason draft into
                        regular divisions. After preseason play last week, the
                        Captains were asked to nominate players to move up one
                        division level. To make room for the rising players,
                        Captains also nominated players to move down one
                        division level for this week of preseason play
                        (&quot;Moving Day&quot;).
                    </p>
                    <p className="text-sm">
                        The purpose of &quot;Moving Day&quot; is to provide
                        opportunities for players to demonstrate their skills at
                        different levels of play. This format will also provide
                        Captains the opportunity to see more players in
                        different environments. The league may also have made
                        some limited adjustments to accommodate Pair Requests
                        and fill in roster gaps where necessary.
                    </p>
                    <p className="text-sm">
                        Each team will play one match (three games) with no refs
                        and capped at 50 minutes. Captains at all levels will be
                        invited to observe the matches when their teams are not
                        playing. This is the final week of preseason play. Over
                        the next two weeks, the Captain will draft their teams
                        for the regular season. Regular season play begins on{" "}
                        {season1DateDisplay}.
                    </p>
                    <p className="text-sm">
                        Please note that these &quot;Moving Day&quot;
                        assignments are for this week only. Division assignments
                        for this week do not determine where you play in the
                        regular season. How you play and how Captains perceive
                        your play will determine that. Captains are free to
                        draft any players of their choosing, regardless of their
                        preseason division assignments:
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                        <li>
                            <span className="font-semibold">
                                Players Moving Up
                            </span>{" "}
                            - Take it as a compliment that some Captains want to
                            see you compete at the next level. Good luck! No
                            promises :)
                        </li>
                        <li>
                            <span className="font-semibold">
                                Players Staying Put
                            </span>{" "}
                            - Captains were only allowed to move a fixed number
                            of players. Keep up the good work! No promises :)
                        </li>
                        <li>
                            <span className="font-semibold">
                                Players Moving Down
                            </span>{" "}
                            - Captains were forced to move a fixed number of
                            players down to make room for other players moving
                            up. This week you have an opportunity for your
                            skills to stand out. Good luck in the draft! No
                            promises :)
                        </li>
                    </ul>
                    <p className="font-semibold text-sm">
                        Players marked with an asterisk (*) are scheduled for
                        two matches.
                    </p>
                </>
            }
        />
    )
}
