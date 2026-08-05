/**
 * types.ts — Notification type registry.
 *
 * Single source of truth mapping every notification type to its category
 * (the grouping shown on /dashboard/notifications), Postmark message stream,
 * and user-facing copy. Adding a type is a code change here — no migration;
 * opt-outs are stored per type in notification_optouts and absence of a row
 * means opted in.
 *
 * This module is imported by client components for labels, so it must stay
 * free of server-only imports (the MessageStream import below is type-only
 * and erased at compile time).
 */

import type { MessageStream } from "@/lib/postmark"

export type NotificationCategoryId =
    | "announcements"
    | "roster_draft"
    | "game_reminders"
    | "captain"

export type NotificationType =
    | "league_announcements"
    | "in_season_updates"
    | "tryout_roster"
    | "tryout_volunteer_assignment"
    | "tryout_volunteer_reminder"
    | "draft_results"
    | "sub_locked_in"
    | "game_reminder_player"
    | "game_reminder_referee"
    | "captain_availability_change"
    | "sub_request_received"
    | "sub_request_approved"
    | "sub_request_declined"
    | "sub_request_cancelled"
    | "transactional"

export interface NotificationCategoryDef {
    label: string
    description: string
}

export interface NotificationTypeDef {
    /** null → not toggleable; rendered in the "Always on" section if mandatory */
    category: NotificationCategoryId | null
    stream: MessageStream
    label: string
    description: string
    /** Skips the opt-out check entirely; never gets notification_optouts rows */
    mandatory?: boolean
}

export const NOTIFICATION_CATEGORIES: Record<
    NotificationCategoryId,
    NotificationCategoryDef
> = {
    announcements: {
        label: "League announcements",
        description:
            "Occasional news sent to the whole league, like a new season opening for signup or a new tournament."
    },
    roster_draft: {
        label: "Roster & draft",
        description:
            "Where you're playing: tryout assignments, draft results, and sub confirmations."
    },
    game_reminders: {
        label: "Game reminders",
        description:
            "A reminder email the day before matches you play or referee."
    },
    captain: {
        label: "Captain notifications",
        description:
            "Only sent while you're a team captain: roster availability and sub requests."
    }
}

export const NOTIFICATION_TYPES: Record<NotificationType, NotificationTypeDef> =
    {
        league_announcements: {
            category: "announcements",
            stream: "broadcast",
            label: "Season & tournament announcements",
            description:
                "When signup opens for a new season or a tournament is announced."
        },
        in_season_updates: {
            category: null,
            stream: "in-season-updates",
            label: "In-season updates",
            description:
                "Schedule changes, weather cancellations, and other need-to-know updates while you're playing in a season.",
            mandatory: true
        },
        tryout_roster: {
            category: "roster_draft",
            stream: "outbound",
            label: "Tryout & preseason assignments",
            description:
                "Your court and session assignments for preseason weeks 1–3."
        },
        tryout_volunteer_assignment: {
            category: "roster_draft",
            stream: "outbound",
            label: "Tryout volunteer jobs",
            description:
                "The volunteer job you've been assigned on a tryout night."
        },
        tryout_volunteer_reminder: {
            category: "game_reminders",
            stream: "automated-reminders",
            label: "Tryout volunteer jobs",
            description:
                "A reminder the day before a tryout night you're volunteering at."
        },
        draft_results: {
            category: "roster_draft",
            stream: "outbound",
            label: "Draft results",
            description: "When you're drafted onto a team."
        },
        sub_locked_in: {
            category: "roster_draft",
            stream: "outbound",
            label: "Sub confirmations",
            description:
                "When you're confirmed as a substitute for another team's match."
        },
        game_reminder_player: {
            category: "game_reminders",
            stream: "automated-reminders",
            label: "My matches",
            description:
                "A reminder the day before each match you're scheduled to play."
        },
        game_reminder_referee: {
            category: "game_reminders",
            stream: "automated-reminders",
            label: "Matches I referee",
            description:
                "A reminder the day before each match you're scheduled to referee."
        },
        captain_availability_change: {
            category: "captain",
            stream: "outbound",
            label: "Player availability changes",
            description:
                "When a player on your team updates their availability."
        },
        sub_request_received: {
            category: "captain",
            stream: "outbound",
            label: "Incoming sub requests",
            description:
                "When another captain asks to borrow one of your players for a match."
        },
        sub_request_approved: {
            category: "captain",
            stream: "outbound",
            label: "Sub request approved",
            description: "When a sub request you sent is approved."
        },
        sub_request_declined: {
            category: "captain",
            stream: "outbound",
            label: "Sub request declined",
            description: "When a sub request you sent is declined."
        },
        sub_request_cancelled: {
            category: "captain",
            stream: "outbound",
            label: "Sub request cancelled",
            description:
                "When a sub request involving your team is cancelled or superseded."
        },
        transactional: {
            category: null,
            stream: "outbound",
            label: "Account & payment emails",
            description:
                "Signup confirmations, payment receipts, password resets, and replies to your concerns or emails.",
            mandatory: true
        }
    }

/**
 * Categories whose *full* opt-out is mirrored to Postmark as a stream-level
 * suppression (and cleared again when any type in the category is re-enabled).
 * Only broadcast-type streams belong here — suppressing "outbound" at Postmark
 * would block password resets and receipts.
 */
export const CATEGORY_STREAM_SYNC: Partial<
    Record<NotificationCategoryId, MessageStream>
> = {
    announcements: "broadcast"
}

/**
 * Send Email page streams → the preference type that gates them. Streams
 * absent here (in-season-updates) are mandatory and filter by Postmark
 * suppressions only.
 */
export const STREAM_TO_TYPE: Partial<Record<string, NotificationType>> = {
    broadcast: "league_announcements"
}

/**
 * How long a row survives in notification_log before the nightly prune
 * removes it (see src/lib/notifications/log-retention.ts). Lives here rather
 * than beside the prune job because admin UI needs it too — a history panel
 * that silently stops a year back would read as missing data.
 */
export const NOTIFICATION_LOG_RETENTION_DAYS = 365

export const NOTIFICATION_LOG_RETENTION_LABEL = "1 year"

/** Friendly names for Postmark streams, for suppression banners. */
export const STREAM_LABELS: Record<string, string> = {
    outbound: "account & team emails",
    broadcast: "league announcements",
    "in-season-updates": "in-season updates",
    "automated-reminders": "game reminders"
}

export function typesInCategory(
    category: NotificationCategoryId
): NotificationType[] {
    return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter(
        (type) => NOTIFICATION_TYPES[type].category === category
    )
}

export function isNotificationType(value: string): value is NotificationType {
    return value in NOTIFICATION_TYPES
}

/** Types a user may opt out of (everything shown with a checkbox). */
export function optOutableTypes(): NotificationType[] {
    return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter(
        (type) => !NOTIFICATION_TYPES[type].mandatory
    )
}
