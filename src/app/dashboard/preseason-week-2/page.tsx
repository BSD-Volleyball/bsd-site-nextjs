import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { DivisionWeekView } from "@/components/preseason/division-week-view"
import { StatusBanner } from "@/components/ui/status-banner"
import { listFriendIds } from "@/lib/friends"
import { loadDivisionWeekRosters } from "@/lib/preseason/division-week-rosters"
import { getSeasonConfig } from "@/lib/site-config"
import { requireSessionOrRedirect } from "@/next/page-guards"

export const metadata: Metadata = {
    title: "Pre-Season Week 2"
}

export const dynamic = "force-dynamic"

export default async function PreseasonWeek2Page() {
    const session = await requireSessionOrRedirect()

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Pre-Season Week 2"
                    description="Preseason week 2 roster assignments grouped by division."
                />
                <StatusBanner variant="error">
                    No current season found.
                </StatusBanner>
            </div>
        )
    }

    const [friendIds, divisions] = await Promise.all([
        listFriendIds(session.user.id),
        loadDivisionWeekRosters(config.seasonId, 2)
    ])

    return (
        <DivisionWeekView
            week={2}
            config={config}
            divisions={divisions}
            userId={session.user.id}
            friendIds={friendIds}
            intro={
                <>
                    <h2 className="font-semibold text-sm uppercase tracking-wide">
                        ABOUT THE PRESEASON ROSTERS FOR WEEK 2 - Preseason
                        &quot;Automated&quot; Draft
                    </h2>
                    <p className="text-sm">
                        The league has conducted an &quot;automated&quot; draft
                        into regular divisions. Returning players were mostly
                        placed in the division they recently played in. New
                        players were placed in divisions based on feedback from
                        the Captains after Preseason Week 1. The league may have
                        made some limited adjustments to accommodate Pair
                        Requests and fill in roster gaps where necessary.
                    </p>
                    <p className="text-sm">
                        Each team will play one match with no refs and capped at
                        50 minutes. Captains at all levels will be invited to
                        observe the matches when their teams are not playing.
                        There will be a new roster of preseason teams next week
                        with over 40% of players moving into new divisions (half
                        moving up and half moving down) based on feedback from
                        the Captains.
                    </p>
                    <p className="text-sm">
                        All registered players will be placed on the roster for
                        Preseason Week 3.
                    </p>
                    <p className="font-semibold text-sm">
                        Players marked with an asterisk (*) are scheduled for
                        two matches.
                    </p>
                </>
            }
        />
    )
}
