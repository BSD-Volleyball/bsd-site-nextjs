/**
 * calendar-snapshot.ts — everything the subscription feeds need, in one
 * JSON-safe object.
 *
 * Calendar apps poll every subscribed feed about hourly, around the clock,
 * and there are more feeds than five-minute windows in an hour. A cache
 * keyed per feed therefore still misses once per feed per hour, which is
 * exactly the cadence that kept the Neon compute from scaling to zero. The
 * snapshot collapses all feeds onto one key: one read an hour (every token's
 * owner, the friend edges, and the schedule bundle for every subscriber and
 * their friends), after which any feed renders with zero database reads.
 *
 * Caching itself lives in src/next/calendar-feed-cache.ts; this module is
 * framework-free and does the loading and the rendering.
 */

import "server-only"

import { and, eq, inArray, or } from "drizzle-orm"
import { db } from "@/database/db"
import { calendarTokens, friendships } from "@/database/schema"
import {
    type BuiltCalendar,
    emptyCalendar,
    renderCalendar
} from "@/lib/calendar-feed"
import type { CalendarKind } from "@/lib/calendar-links"
import {
    type SerializedScheduleBundle,
    deserializeScheduleBundle,
    narrowScheduleBundle,
    serializeScheduleBundle
} from "@/lib/schedule-item-types"
import { getScheduleForUsers } from "@/lib/schedule-items"
import { getSeasonConfig } from "@/lib/site-config"

export interface CalendarSnapshot {
    /** null between seasons */
    seasonId: number | null
    /** token -> user id, for every issued token */
    owners: Record<string, string>
    /** user id -> accepted friend ids, for every token holder */
    friends: Record<string, string[]>
    /** Schedule for every token holder and their friends; null off-season */
    bundle: SerializedScheduleBundle | null
}

export async function loadCalendarSnapshot(): Promise<CalendarSnapshot> {
    const tokenRows = await db
        .select({ token: calendarTokens.token, userId: calendarTokens.user_id })
        .from(calendarTokens)
    const owners: Record<string, string> = {}
    for (const row of tokenRows) owners[row.token] = row.userId
    const holders = [...new Set(tokenRows.map((row) => row.userId))]

    const friends: Record<string, string[]> = {}
    for (const holder of holders) friends[holder] = []
    if (holders.length > 0) {
        const edges = await db
            .select({
                requester: friendships.requester,
                addressee: friendships.addressee
            })
            .from(friendships)
            .where(
                and(
                    eq(friendships.status, "accepted"),
                    or(
                        inArray(friendships.requester, holders),
                        inArray(friendships.addressee, holders)
                    )
                )
            )
        for (const edge of edges) {
            friends[edge.requester]?.push(edge.addressee)
            friends[edge.addressee]?.push(edge.requester)
        }
    }

    const config = await getSeasonConfig()
    const seasonId = config.seasonId || null
    if (!seasonId || holders.length === 0) {
        return { seasonId, owners, friends, bundle: null }
    }

    const everyone = new Set(holders)
    for (const list of Object.values(friends)) {
        for (const id of list) everyone.add(id)
    }
    const bundle = await getScheduleForUsers([...everyone], seasonId)
    return {
        seasonId,
        owners,
        friends,
        bundle: serializeScheduleBundle(bundle)
    }
}

/** Pure. Null when the snapshot does not know the token. */
export function renderCalendarFromSnapshot(
    snapshot: CalendarSnapshot,
    token: string,
    kind: CalendarKind
): BuiltCalendar | null {
    if (!Object.hasOwn(snapshot.owners, token)) return null
    const userId = snapshot.owners[token]

    if (!snapshot.bundle) {
        // Between seasons: a valid empty calendar keeps subscribed clients
        // from flagging the feed as broken.
        return { ics: emptyCalendar(kind), filename: `bsd-${kind}.ics` }
    }

    const userIds =
        kind === "friends"
            ? [userId, ...(snapshot.friends[userId] ?? [])]
            : [userId]
    const bundle = narrowScheduleBundle(
        deserializeScheduleBundle(snapshot.bundle),
        userIds
    )
    return renderCalendar(kind, userId, bundle)
}
