import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import {
    signups,
    playerUnavailability,
    week1Rosters,
    week2Rosters,
    week3Rosters,
    teams,
    drafts,
    matches
} from "@/database/schema"
import { eq, and, or } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getSeasonConfig } from "@/lib/site-config"
import { getEventsByType, formatEventTime, formatMatchTime } from "@/lib/season-utils"
import { PageHeader } from "@/components/layout/page-header"
import { AvailabilityForm } from "./availability-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "My Availability"
}

export const dynamic = "force-dynamic"

export default async function MyAvailabilityPage() {
    const session = await auth.api.getSession({
        headers: await headers()
    })
    if (!session) {
        redirect("/login")
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="My Availability"
                    description="Manage which season dates you will miss."
                />
                <p className="text-muted-foreground">
                    There is no active season at this time.
                </p>
            </div>
        )
    }

    // Find the player's signup for the current season
    const [signup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(
            and(
                eq(signups.season, config.seasonId),
                eq(signups.player, session.user.id)
            )
        )
        .limit(1)

    if (!signup) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="My Availability"
                    description="Manage which season dates you will miss."
                />
                <p className="text-muted-foreground">
                    You don&apos;t have a signup for the current season.
                </p>
            </div>
        )
    }

    // Fetch unavailability + roster placements + team assignment in parallel
    const [
        unavailRows,
        week1Row,
        week2Row,
        week3Row,
        draftRow
    ] = await Promise.all([
        db.select({ eventId: playerUnavailability.event_id })
            .from(playerUnavailability)
            .where(eq(playerUnavailability.signup_id, signup.id)),
        db.select({ sessionNumber: week1Rosters.session_number })
            .from(week1Rosters)
            .where(
                and(
                    eq(week1Rosters.season, config.seasonId),
                    eq(week1Rosters.user, session.user.id)
                )
            )
            .limit(1)
            .then((r) => r[0] ?? null),
        db.select({ teamNumber: week2Rosters.team_number })
            .from(week2Rosters)
            .where(
                and(
                    eq(week2Rosters.season, config.seasonId),
                    eq(week2Rosters.user, session.user.id)
                )
            )
            .limit(1)
            .then((r) => r[0] ?? null),
        db.select({ teamNumber: week3Rosters.team_number })
            .from(week3Rosters)
            .where(
                and(
                    eq(week3Rosters.season, config.seasonId),
                    eq(week3Rosters.user, session.user.id)
                )
            )
            .limit(1)
            .then((r) => r[0] ?? null),
        db.select({ teamId: drafts.team })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(
                and(
                    eq(drafts.user, session.user.id),
                    eq(teams.season, config.seasonId)
                )
            )
            .limit(1)
            .then((r) => r[0] ?? null)
    ])

    const initialUnavailableIds = unavailRows.map((r) => r.eventId)

    // Build map of eventId → scheduled time string for this player
    const scheduledTimesByEventId: Record<number, string> = {}

    const tryoutEvents = getEventsByType(config, "tryout")

    // Week 1: session_number (1 or 2) → timeSlots index
    if (week1Row && tryoutEvents[0]) {
        const slot = tryoutEvents[0].timeSlots[week1Row.sessionNumber - 1]
        if (slot) {
            scheduledTimesByEventId[tryoutEvents[0].id] = formatEventTime(
                slot.startTime
            )
        }
    }

    // Week 2 & 3: teams [1,2] → slot 0, [3,4] → slot 1, [5,6] → slot 2
    if (week2Row && tryoutEvents[1]) {
        const slotIdx = Math.floor((week2Row.teamNumber - 1) / 2)
        const slot = tryoutEvents[1].timeSlots[slotIdx]
        if (slot) {
            scheduledTimesByEventId[tryoutEvents[1].id] = formatEventTime(
                slot.startTime
            )
        }
    }
    if (week3Row && tryoutEvents[2]) {
        const slotIdx = Math.floor((week3Row.teamNumber - 1) / 2)
        const slot = tryoutEvents[2].timeSlots[slotIdx]
        if (slot) {
            scheduledTimesByEventId[tryoutEvents[2].id] = formatEventTime(
                slot.startTime
            )
        }
    }

    // Regular season + playoff: look up team's matches
    if (draftRow) {
        const teamMatches = await db
            .select({
                week: matches.week,
                time: matches.time,
                playoff: matches.playoff
            })
            .from(matches)
            .where(
                and(
                    eq(matches.season, config.seasonId),
                    or(
                        eq(matches.home_team, draftRow.teamId),
                        eq(matches.away_team, draftRow.teamId)
                    )
                )
            )

        const rsEvents = getEventsByType(config, "regular_season")
        const poEvents = getEventsByType(config, "playoff")

        for (const match of teamMatches) {
            if (!match.time) continue
            const formattedTime = formatMatchTime(match.time)
            if (match.playoff) {
                const event = poEvents[match.week - 1]
                if (event) scheduledTimesByEventId[event.id] = formattedTime
            } else {
                const event = rsEvents[match.week - 1]
                if (event) scheduledTimesByEventId[event.id] = formattedTime
            }
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="My Availability"
                description="Manage which season dates you will miss."
            />
            <AvailabilityForm
                signupId={signup.id}
                config={config}
                initialUnavailableIds={initialUnavailableIds}
                scheduledTimesByEventId={scheduledTimesByEventId}
            />
        </div>
    )
}
