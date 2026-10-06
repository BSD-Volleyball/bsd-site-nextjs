import { revalidateTag } from "next/cache"

// ---------------------------------------------------------------------------
// The calendar subscription feeds are rendered from one snapshot that is
// cached for a day (src/next/calendar-feed-cache.ts). In season the schedule
// barely moves, so a long lifetime is right, but it means the only thing that
// refreshes a feed sooner is this tag. Every server action that changes what
// a feed shows calls revalidateCalendarFeeds() after its write; the lists
// below drive a static test (calendar-invalidation.test.ts) that fails when a
// file under src/app writes one of these tables without calling it.
// ---------------------------------------------------------------------------

export const CALENDAR_FEED_TAG = "calendar-feeds"

/** Drizzle table exports that getScheduleForUsers / the snapshot read. */
export const CALENDAR_FEED_TABLES = [
    "calendarTokens",
    "friendships",
    "seasons",
    "seasonEvents",
    "eventTimeSlots",
    "matches",
    "playoffMatchesMeta",
    "teams",
    "divisions",
    "drafts",
    "week1Rosters",
    "week2Rosters",
    "week3Rosters",
    "substitutions",
    "matchSubstitutions",
    "matchReferees",
    "userUnavailability",
    "signups",
    "signupDrops",
    "tryoutVolunteerJobs",
    "tryoutVolunteerAssignments"
] as const

/** Lib modules that write those tables on an action's behalf. */
export const CALENDAR_FEED_WRITER_MODULES = [
    "@/lib/merge-users",
    "@/lib/match-substitutions",
    "@/lib/preseason",
    "@/lib/playoff-bracket-cleanup"
] as const

/** Call after any write that changes what a subscription feed shows. */
export function revalidateCalendarFeeds(): void {
    revalidateTag(CALENDAR_FEED_TAG, "max")
}
