/**
 * load.ts — assemble one night's score sheets from the database.
 *
 * Mirrors the query shape of `getMatchesAndRefsForDate()` in
 * `src/app/dashboard/schedule-refs/actions.ts`, which already loads almost
 * exactly this. That one is a server action under `src/app`, which `src/lib`
 * may not import, so the queries are restated here.
 */

import { and, asc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/database/db"
import {
    divisions,
    matchReferees,
    matches,
    playoffMatchesMeta,
    seasonEvents,
    seasons,
    teams,
    users
} from "@/database/schema"
import { formatEventDate } from "@/lib/date-utils"
import { formatSourceHumanLabel, parseSourceToken } from "@/lib/playoff-sources"
import { formatDisplayName } from "@/lib/utils"

import { seasonCodeFor } from "./sheet-config"
import type {
    CourtSheet,
    SheetEventType,
    SheetMatch,
    SheetNight,
    SheetTeam
} from "./types"

const UNKNOWN_TEAM = "TBD"

function placeholderTeam(sourceToken: string | null): SheetTeam {
    const label = formatSourceHumanLabel(parseSourceToken(sourceToken))
    return {
        teamId: null,
        name: label ?? UNKNOWN_TEAM,
        isPlaceholder: true,
        captains: []
    }
}

/**
 * The week ordinal counts nights of the same type in date order, matching how
 * the Coverage page labels them, so a sheet and the digest agree on "Week 3".
 */
function findNightPosition(
    events: { eventType: string; eventDate: string }[],
    date: string
): { eventType: SheetEventType; ordinal: number } | null {
    const event = events.find((e) => e.eventDate === date)
    if (!event) return null
    const eventType = event.eventType as SheetEventType
    const ordinal = events.filter(
        (e) => e.eventType === eventType && e.eventDate <= date
    ).length
    return { eventType, ordinal }
}

export async function loadScoreSheetNight(
    seasonId: number,
    date: string
): Promise<SheetNight | null> {
    const [season] = await db
        .select({
            id: seasons.id,
            year: seasons.year,
            season: seasons.season
        })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
    if (!season) return null

    const homeTeam = alias(teams, "homeTeam")
    const awayTeam = alias(teams, "awayTeam")

    const matchRows = await db
        .select({
            matchId: matches.id,
            time: matches.time,
            court: matches.court,
            week: matches.week,
            playoff: matches.playoff,
            divisionName: divisions.name,
            homeTeamId: matches.home_team,
            homeTeamName: homeTeam.name,
            homeCaptain: homeTeam.captain,
            homeCaptain2: homeTeam.captain2,
            awayTeamId: matches.away_team,
            awayTeamName: awayTeam.name,
            awayCaptain: awayTeam.captain,
            awayCaptain2: awayTeam.captain2
        })
        .from(matches)
        .innerJoin(divisions, eq(matches.division, divisions.id))
        .leftJoin(homeTeam, eq(matches.home_team, homeTeam.id))
        .leftJoin(awayTeam, eq(matches.away_team, awayTeam.id))
        .where(and(eq(matches.season, seasonId), eq(matches.date, date)))
        .orderBy(asc(matches.court), asc(matches.time))

    if (matchRows.length === 0) return null

    const matchIds = matchRows.map((m) => m.matchId)

    // Captain names resolve through a follow-up lookup rather than a second
    // aliased join on `users`: Drizzle types a leftJoin against a second
    // aliased copy of the same table as `never`.
    const captainIds = [
        ...new Set(
            matchRows
                .flatMap((m) => [
                    m.homeCaptain,
                    m.homeCaptain2,
                    m.awayCaptain,
                    m.awayCaptain2
                ])
                .filter((id): id is string => Boolean(id))
        )
    ]

    const [captainRows, refRows, playoffMetaRows] = await Promise.all([
        captainIds.length > 0
            ? db
                  .select({
                      id: users.id,
                      firstName: users.first_name,
                      lastName: users.last_name,
                      preferredName: users.preferred_name
                  })
                  .from(users)
                  .where(inArray(users.id, captainIds))
            : Promise.resolve([]),
        db
            .select({
                matchId: matchReferees.match_id,
                role: matchReferees.role,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name
            })
            .from(matchReferees)
            .innerJoin(users, eq(matchReferees.referee_id, users.id))
            .where(inArray(matchReferees.match_id, matchIds)),
        db
            .select({
                matchId: playoffMatchesMeta.match_id,
                matchNum: playoffMatchesMeta.match_num,
                bracket: playoffMatchesMeta.bracket,
                homeSource: playoffMatchesMeta.home_source,
                awaySource: playoffMatchesMeta.away_source,
                workTeam: playoffMatchesMeta.work_team,
                workSource: playoffMatchesMeta.work_source
            })
            .from(playoffMatchesMeta)
            .where(inArray(playoffMatchesMeta.match_id, matchIds))
    ])

    const captainNameById = new Map(
        captainRows.map((c) => [
            c.id,
            formatDisplayName(c.firstName, c.lastName, c.preferredName)
        ])
    )

    const primaryRefByMatch = new Map<number, string>()
    const backupRefByMatch = new Map<number, string>()
    for (const ref of refRows) {
        const name = formatDisplayName(
            ref.firstName,
            ref.lastName,
            ref.preferredName
        )
        if (ref.role === "backup") {
            backupRefByMatch.set(ref.matchId, name)
        } else {
            primaryRefByMatch.set(ref.matchId, name)
        }
    }

    const metaByMatch = new Map(
        playoffMetaRows
            .filter(
                (m): m is typeof m & { matchId: number } => m.matchId !== null
            )
            .map((m) => [m.matchId, m])
    )

    // Work-team names come from the same team pool as the playing teams.
    const workTeamIds = [
        ...new Set(
            playoffMetaRows
                .map((m) => m.workTeam)
                .filter((id): id is number => id !== null)
        )
    ]
    const workTeamRows =
        workTeamIds.length > 0
            ? await db
                  .select({ id: teams.id, name: teams.name })
                  .from(teams)
                  .where(inArray(teams.id, workTeamIds))
            : []
    const workTeamNameById = new Map(workTeamRows.map((t) => [t.id, t.name]))

    /** A named work team when one is assigned, else its bracket label. */
    const workTeamLabel = (
        meta: { workTeam: number | null; workSource: string | null } | undefined
    ): string | null => {
        if (!meta) return null
        if (meta.workTeam !== null) {
            const name = workTeamNameById.get(meta.workTeam)
            if (name) return name
        }
        return formatSourceHumanLabel(parseSourceToken(meta.workSource))
    }

    const captainsFor = (
        captain: string | null,
        captain2: string | null
    ): string[] =>
        [captain, captain2]
            .map((id) => (id ? captainNameById.get(id) : undefined))
            .filter((name): name is string => Boolean(name))

    const eventRows = await db
        .select({
            eventType: seasonEvents.event_type,
            eventDate: seasonEvents.event_date
        })
        .from(seasonEvents)
        .where(eq(seasonEvents.season_id, seasonId))
        .orderBy(asc(seasonEvents.event_date), asc(seasonEvents.sort_order))

    const position = findNightPosition(
        eventRows.filter(
            (e) => e.eventType === "regular_season" || e.eventType === "playoff"
        ),
        date
    )
    // A night with matches but no season_events row still gets sheets; fall
    // back to what the matches themselves say.
    const eventType: SheetEventType =
        position?.eventType ??
        (matchRows[0].playoff ? "playoff" : "regular_season")
    const ordinal = position?.ordinal ?? matchRows[0].week

    const byCourt = new Map<number | null, SheetMatch[]>()
    for (const row of matchRows) {
        const meta = metaByMatch.get(row.matchId)
        const bucket = byCourt.get(row.court) ?? []

        const home: SheetTeam =
            row.homeTeamId && row.homeTeamName
                ? {
                      teamId: row.homeTeamId,
                      name: row.homeTeamName,
                      isPlaceholder: false,
                      captains: captainsFor(row.homeCaptain, row.homeCaptain2)
                  }
                : placeholderTeam(meta?.homeSource ?? null)

        const away: SheetTeam =
            row.awayTeamId && row.awayTeamName
                ? {
                      teamId: row.awayTeamId,
                      name: row.awayTeamName,
                      isPlaceholder: false,
                      captains: captainsFor(row.awayCaptain, row.awayCaptain2)
                  }
                : placeholderTeam(meta?.awaySource ?? null)

        const workTeam = workTeamLabel(meta)

        bucket.push({
            matchId: row.matchId,
            orderOnCourt: bucket.length + 1,
            divisionName: row.divisionName,
            time: row.time,
            playoff: row.playoff,
            playoffMatchNum: meta?.matchNum ?? null,
            bracket: meta?.bracket ?? null,
            home,
            away,
            referee: primaryRefByMatch.get(row.matchId) ?? null,
            backupReferee: backupRefByMatch.get(row.matchId) ?? null,
            workTeam
        })
        byCourt.set(row.court, bucket)
    }

    // Courts ascending; matches with no court assigned print last.
    const courts: CourtSheet[] = [...byCourt.entries()]
        .sort(([a], [b]) => {
            if (a === null) return 1
            if (b === null) return -1
            return a - b
        })
        .map(([court, courtMatches]) => ({ court, matches: courtMatches }))

    const seasonLabel = `${season.season.charAt(0).toUpperCase()}${season.season.slice(1)} ${season.year}`
    const phaseLabel =
        eventType === "playoff" ? `Playoffs Week ${ordinal}` : `Week ${ordinal}`

    return {
        date,
        seasonLabel,
        seasonCode: seasonCodeFor(season.season, season.year),
        eventType,
        ordinal,
        nightLabel: `${phaseLabel} - ${formatEventDate(date)}`,
        courts
    }
}
