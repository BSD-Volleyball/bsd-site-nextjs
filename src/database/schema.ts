import { relations, sql } from "drizzle-orm"
import {
    pgTable,
    pgEnum,
    text,
    timestamp,
    boolean,
    integer,
    serial,
    numeric,
    real,
    date,
    time,
    unique,
    uniqueIndex,
    jsonb,
    index,
    check
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
    id: text("id").primaryKey(),
    name: text("name"),
    first_name: text("first_name").notNull(),
    last_name: text("last_name").notNull(),
    preferred_name: text("preferred_name"),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    avatar: text("avatar"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    old_id: serial("old_id"),
    picture: text("picture"),
    phone: text("phone"),
    experience: text("experience"),
    assessment: text("assessment"),
    height: integer("height"),
    skill_setter: boolean("skill_setter"),
    skill_hitter: boolean("skill_hitter"),
    skill_passer: boolean("skill_passer"),
    skill_other: boolean("skill_other"),
    emergency_contact: text("emergency_contact"),
    referred_by: text("referred_by"),
    pronouns: text("pronouns"),
    male: boolean("male"),
    onboarding_completed: boolean("onboarding_completed").default(false),
    seasons_list: text("seasons_list").default("false").notNull(),
    notification_list: text("notification_list").default("false").notNull(),
    captain_eligible: boolean("captain_eligible").default(true).notNull(),
    // Email delivery status — updated by Postmark webhooks.
    // Priority (highest wins): bounced > spam_complaint > unsubscribed > valid
    email_status: text("email_status").default("valid").notNull()
})

export const sessions = pgTable(
    "sessions",
    {
        id: text("id").primaryKey(),
        expiresAt: timestamp("expires_at").notNull(),
        token: text("token").notNull().unique(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" })
    },
    (table) => ({
        sessionsUserIdx: index("sessions_user_idx").on(table.userId)
    })
)

export const accounts = pgTable(
    "accounts",
    {
        id: text("id").primaryKey(),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        accessTokenExpiresAt: timestamp("access_token_expires_at"),
        refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
        scope: text("scope"),
        password: text("password"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        accountsUserIdx: index("accounts_user_idx").on(table.userId)
    })
)

export const verifications = pgTable(
    "verifications",
    {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestamp("expires_at").notNull(),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow()
    },
    (table) => ({
        verificationsIdentifierIdx: index("verifications_identifier_idx").on(
            table.identifier
        )
    })
)

export const seasons = pgTable(
    "seasons",
    {
        id: serial("id").primaryKey(),
        code: text("code").notNull(),
        year: integer("year").notNull(),
        season: text("season").notNull(),
        phase: text("phase").default("off_season").notNull(),
        season_amount: numeric("season_amount"),
        late_amount: numeric("late_amount"),
        max_players: integer("max_players"),
        certified_ref_rate: numeric("certified_ref_rate"),
        uncertified_ref_rate: numeric("uncertified_ref_rate")
    },
    (table) => ({
        seasonsCodeUniq: uniqueIndex("seasons_code_uniq").on(table.code)
    })
)

export const eventTypeEnum = pgEnum("event_type", [
    "tryout",
    "regular_season",
    "playoff",
    "draft",
    "captain_select",
    "late_date"
])

export const seasonEvents = pgTable(
    "season_events",
    {
        id: serial("id").primaryKey(),
        season_id: integer("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        event_type: eventTypeEnum("event_type").notNull(),
        event_date: date("event_date", { mode: "string" }).notNull(),
        sort_order: integer("sort_order").notNull(),
        label: text("label")
    },
    (table) => ({
        seasonEventsSeasonIdx: index("season_events_season_idx").on(
            table.season_id
        ),
        seasonEventsTypeIdx: index("season_events_type_idx").on(
            table.season_id,
            table.event_type
        )
    })
)

export const eventTimeSlots = pgTable(
    "event_time_slots",
    {
        id: serial("id").primaryKey(),
        event_id: integer("event_id")
            .notNull()
            .references(() => seasonEvents.id, { onDelete: "cascade" }),
        start_time: time("start_time").notNull(),
        slot_label: text("slot_label"),
        sort_order: integer("sort_order").notNull()
    },
    (table) => ({
        eventTimeSlotsEventIdx: index("event_time_slots_event_idx").on(
            table.event_id
        )
    })
)

export const divisions = pgTable("divisions", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    level: integer("level").notNull(),
    active: boolean("active").default(true).notNull()
})

export const individual_divisions = pgTable(
    "individual_divisions",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        division: integer("divisions")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        coaches: boolean("coaches").default(false).notNull(),
        gender_split: text("gender_split").notNull(),
        teams: integer("teams").notNull()
    },
    (table) => ({
        individualDivisionsSeasonDivisionUniq: uniqueIndex(
            "individual_divisions_season_division_uniq"
        ).on(table.season, table.division)
    })
)

export const signups = pgTable(
    "signups",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        player: text("player")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        age: text("age"),
        captain: text("captain"),
        pair: boolean("pair"),
        pair_pick: text("pair_pick").references(() => users.id, {
            onDelete: "set null"
        }),
        pair_reason: text("pair_reason"),
        // NULL means the question predates these columns (never asked).
        ref_interest: boolean("ref_interest"),
        tryout_help: boolean("tryout_help"),
        order_id: text("order_id"),
        amount_paid: numeric("amount_paid"),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        signupsSeasonIdx: index("signups_season_idx").on(table.season),
        signupsPlayerIdx: index("signups_player_idx").on(table.player),
        signupsSeasonPlayerUniq: uniqueIndex("signups_season_player_uniq").on(
            table.season,
            table.player
        )
    })
)

export const deletedSignups = pgTable(
    "deleted_signups",
    {
        id: integer("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        player: text("player")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        age: text("age"),
        captain: text("captain"),
        pair: boolean("pair"),
        pair_pick: text("pair_pick"),
        pair_reason: text("pair_reason"),
        ref_interest: boolean("ref_interest"),
        tryout_help: boolean("tryout_help"),
        order_id: text("order_id"),
        amount_paid: numeric("amount_paid"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        deleted_at: timestamp("deleted_at").defaultNow().notNull(),
        deleted_by: text("deleted_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        reason: text("reason")
    },
    (table) => ({
        deletedSignupsSeasonIdx: index("deleted_signups_season_idx").on(
            table.season
        ),
        deletedSignupsPlayerIdx: index("deleted_signups_player_idx").on(
            table.player
        )
    })
)

export const userUnavailability = pgTable(
    "user_unavailability",
    {
        id: serial("id").primaryKey(),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        signup_id: integer("signup_id").references(() => signups.id, {
            onDelete: "cascade"
        }),
        event_id: integer("event_id")
            .notNull()
            .references(() => seasonEvents.id, { onDelete: "cascade" }),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        userUnavailabilityUserIdx: index("user_unavailability_user_idx").on(
            table.user_id
        ),
        userUnavailabilityEventIdx: index("user_unavailability_event_idx").on(
            table.event_id
        ),
        userUnavailabilityUnique: uniqueIndex(
            "user_unavailability_user_event_unique"
        ).on(table.user_id, table.event_id)
    })
)

// Admin-entered tryout timeslot requests: which slots a player CAN attend
// for a given preseason tryout week. Week 1 uses slots 1-2 (sessions);
// weeks 2/3 use slots 1-3. Placement honors these as a strong preference.
export const tryoutSlotRequests = pgTable(
    "tryout_slot_requests",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        week: integer("week").notNull(),
        can_slot_1: boolean("can_slot_1").notNull().default(false),
        can_slot_2: boolean("can_slot_2").notNull().default(false),
        can_slot_3: boolean("can_slot_3").notNull().default(false),
        comment: text("comment"),
        created_by: text("created_by").references(() => users.id, {
            onDelete: "set null"
        }),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        tryoutSlotRequestsSeasonIdx: index(
            "tryout_slot_requests_season_idx"
        ).on(table.season),
        tryoutSlotRequestsUnique: uniqueIndex(
            "tryout_slot_requests_season_user_week_unique"
        ).on(table.season, table.user_id, table.week)
    })
)

// Volunteer jobs to be staffed on each tryout night. A job belongs to one
// tryout season_events row. "whole_night" jobs are staffed once for the
// entire evening; "per_session" jobs need `needed` people in EVERY time
// slot of that night.
export const tryoutJobScopeEnum = pgEnum("tryout_job_scope", [
    "whole_night",
    "per_session"
])

export const tryoutVolunteerJobs = pgTable(
    "tryout_volunteer_jobs",
    {
        id: serial("id").primaryKey(),
        season_id: integer("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        event_id: integer("event_id")
            .notNull()
            .references(() => seasonEvents.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        needed: integer("needed").notNull().default(1),
        scope: tryoutJobScopeEnum("scope").notNull(),
        notes: text("notes"),
        sort_order: integer("sort_order").notNull().default(0),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        tryoutVolunteerJobsSeasonEventIdx: index(
            "tryout_volunteer_jobs_season_event_idx"
        ).on(table.season_id, table.event_id)
    })
)

// One person filling one slot of a job. time_slot_id is NULL for
// whole-night jobs and references the session for per-session jobs.
export const tryoutVolunteerAssignments = pgTable(
    "tryout_volunteer_assignments",
    {
        id: serial("id").primaryKey(),
        job_id: integer("job_id")
            .notNull()
            .references(() => tryoutVolunteerJobs.id, { onDelete: "cascade" }),
        time_slot_id: integer("time_slot_id").references(
            () => eventTimeSlots.id,
            { onDelete: "cascade" }
        ),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        assigned_by: text("assigned_by").references(() => users.id, {
            onDelete: "set null"
        }),
        assigned_at: timestamp("assigned_at").defaultNow().notNull()
    },
    (table) => ({
        tryoutVolunteerAssignmentsJobIdx: index(
            "tryout_volunteer_assignments_job_idx"
        ).on(table.job_id),
        tryoutVolunteerAssignmentsUserIdx: index(
            "tryout_volunteer_assignments_user_idx"
        ).on(table.user_id),
        // NULLS NOT DISTINCT so a whole-night job (null time_slot_id)
        // still blocks assigning the same person twice.
        tryoutVolunteerAssignmentsUniq: unique(
            "tryout_volunteer_assignments_uniq"
        )
            .on(table.job_id, table.time_slot_id, table.user_id)
            .nullsNotDistinct()
    })
)

export const teams = pgTable(
    "teams",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        captain: text("captain")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        captain2: text("captain2").references(() => users.id, {
            onDelete: "restrict"
        }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        name: text("name").notNull(),
        number: integer("number"),
        rank: integer("rank"),
        picture_url: text("picture_url")
    },
    (table) => ({
        teamsSeasonIdx: index("teams_season_idx").on(table.season),
        teamsCaptainIdx: index("teams_captain_idx").on(table.captain)
    })
)

export const matches = pgTable(
    "matches",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        week: integer("week").notNull(),
        date: date("date", { mode: "string" }),
        time: time("time"),
        court: integer("court"),
        home_team: integer("home_team").references(() => teams.id, {
            onDelete: "restrict"
        }),
        away_team: integer("away_team").references(() => teams.id, {
            onDelete: "restrict"
        }),
        home_score: integer("home_score"),
        away_score: integer("away_score"),
        home_set1_score: integer("home_set1_score"),
        away_set1_score: integer("away_set1_score"),
        home_set2_score: integer("home_set2_score"),
        away_set2_score: integer("away_set2_score"),
        home_set3_score: integer("home_set3_score"),
        away_set3_score: integer("away_set3_score"),
        winner: integer("winner").references(() => teams.id, {
            onDelete: "set null"
        }),
        playoff: boolean("playoff").default(false).notNull()
    },
    (table) => ({
        matchesSeasonIdx: index("matches_season_idx").on(table.season),
        matchesDivisionIdx: index("matches_division_idx").on(table.division),
        matchesSeasonDivisionIdx: index("matches_season_division_idx").on(
            table.season,
            table.division
        )
    })
)

export const playoffMatchesMeta = pgTable(
    "playoff_matches_meta",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        week: integer("week").notNull(),
        match_num: integer("match_num").notNull(),
        match_id: integer("match_id").references(() => matches.id, {
            onDelete: "set null"
        }),
        bracket: text("bracket"),
        home_source: text("home_source").notNull(),
        away_source: text("away_source").notNull(),
        next_match_num: integer("next_match_num"),
        next_loser_match_num: integer("next_loser_match_num"),
        work_team: integer("work_team").references(() => teams.id, {
            onDelete: "set null"
        }),
        work_source: text("work_source"),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        playoffMatchesMetaSeasonDivisionIdx: index(
            "playoff_matches_meta_season_division_idx"
        ).on(table.season, table.division),
        playoffMatchesMetaMatchIdx: index("playoff_matches_meta_match_idx").on(
            table.match_id
        )
    })
)

export const week1Rosters = pgTable(
    "week1_rosters",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        user: text("user")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        session_number: integer("session_number").notNull(),
        court_number: integer("court_number").notNull()
    },
    (table) => ({
        week1RostersSeasonIdx: index("week1_rosters_season_idx").on(
            table.season
        ),
        week1RostersSeasonUserUniq: uniqueIndex(
            "week1_rosters_season_user_uniq"
        ).on(table.season, table.user)
    })
)

export const week2Rosters = pgTable(
    "week2_rosters",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        user: text("user")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        team_number: integer("team_number").notNull(),
        is_captain: boolean("is_captain").default(false).notNull()
    },
    (table) => ({
        week2RostersSeasonIdx: index("week2_rosters_season_idx").on(
            table.season
        )
    })
)

export const week3Rosters = pgTable(
    "week3_rosters",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        user: text("user")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        team_number: integer("team_number").notNull(),
        is_captain: boolean("is_captain").default(false).notNull()
    },
    (table) => ({
        week3RostersSeasonIdx: index("week3_rosters_season_idx").on(
            table.season
        )
    })
)

export const champions = pgTable(
    "champions",
    {
        id: serial("id").primaryKey(),
        team: integer("team")
            .notNull()
            .references(() => teams.id, { onDelete: "restrict" }),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        picture: text("picture"),
        picture2: text("picture2"),
        caption: text("caption")
    },
    (table) => ({
        championsSeasonDivisionUniq: uniqueIndex(
            "champions_season_division_uniq"
        ).on(table.season, table.division),
        championsTeamIdx: index("champions_team_idx").on(table.team)
    })
)

export const drafts = pgTable(
    "drafts",
    {
        id: serial("id").primaryKey(),
        team: integer("team")
            .notNull()
            .references(() => teams.id, { onDelete: "restrict" }),
        user: text("user")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        round: integer("round").notNull(),
        overall: integer("overall").notNull()
    },
    (table) => ({
        draftsTeamIdx: index("drafts_team_idx").on(table.team),
        draftsUserIdx: index("drafts_user_idx").on(table.user)
    })
)

export const waitlist = pgTable(
    "waitlist",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        user: text("user")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        approved: boolean("approved").default(false).notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        waitlistSeasonUserUniq: uniqueIndex("waitlist_season_user_uniq").on(
            table.season,
            table.user
        ),
        waitlistUserIdx: index("waitlist_user_idx").on(table.user)
    })
)

// Permanent sub: replaces a draftee on a team for the rest of the season.
// drafts rows are never mutated; chained subs share the same original_draft.
// Active player on a slot = latest substitutions row by effective_at, or the
// original draftee if no rows exist.
export const substitutions = pgTable(
    "substitutions",
    {
        id: serial("id").primaryKey(),
        team: integer("team")
            .notNull()
            .references(() => teams.id, { onDelete: "restrict" }),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        original_draft: integer("original_draft")
            .notNull()
            .references(() => drafts.id, { onDelete: "restrict" }),
        original_user: text("original_user")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        sub_user: text("sub_user")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        effective_at: timestamp("effective_at").defaultNow().notNull(),
        performed_by: text("performed_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        reason: text("reason"),
        notes: text("notes")
    },
    (table) => ({
        substitutionsTeamIdx: index("substitutions_team_idx").on(table.team),
        substitutionsSeasonIdx: index("substitutions_season_idx").on(
            table.season
        ),
        substitutionsOriginalDraftIdx: index(
            "substitutions_original_draft_idx"
        ).on(table.original_draft),
        substitutionsSubUserIdx: index("substitutions_sub_user_idx").on(
            table.sub_user
        )
    })
)

// Regular sub: covers one player for one match. Original player keeps their
// roster slot. Waitlist row of the sub-in user is NOT consumed.
export const matchSubstitutions = pgTable(
    "match_substitutions",
    {
        id: serial("id").primaryKey(),
        match: integer("match")
            .notNull()
            .references(() => matches.id, { onDelete: "restrict" }),
        team: integer("team")
            .notNull()
            .references(() => teams.id, { onDelete: "restrict" }),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        original_user: text("original_user")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        sub_user: text("sub_user")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        performed_by: text("performed_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        created_at: timestamp("created_at").defaultNow().notNull(),
        notes: text("notes")
    },
    (table) => ({
        matchSubsMatchIdx: index("match_substitutions_match_idx").on(
            table.match
        ),
        matchSubsTeamIdx: index("match_substitutions_team_idx").on(table.team),
        matchSubsSeasonIdx: index("match_substitutions_season_idx").on(
            table.season
        ),
        matchSubsSubUserIdx: index("match_substitutions_sub_user_idx").on(
            table.sub_user
        ),
        // One player can't be subbed by two different people in the same match.
        matchSubsMatchOriginalUniq: uniqueIndex(
            "match_substitutions_match_original_uniq"
        ).on(table.match, table.original_user)
    })
)

export const discounts = pgTable(
    "discounts",
    {
        id: serial("id").primaryKey(),
        user: text("user")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        percentage: numeric("percentage").notNull(),
        expiration: timestamp("expiration"),
        reason: text("reason"),
        used: boolean("used").default(false).notNull(),
        // When the discount was consumed, and against which season signup.
        // used_signup_id stays NULL for tournament-scope discounts (they are
        // consumed against tournament_teams, not signups) and for historical
        // rows whose target signup could not be identified during backfill.
        used_at: timestamp("used_at"),
        used_signup_id: integer("used_signup_id").references(() => signups.id, {
            onDelete: "set null"
        }),
        scope: text("scope").default("season").notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        discountsUserIdx: index("discounts_user_idx").on(table.user),
        // A signup is paid for by at most one discount, and a discount is
        // redeemed exactly once — NULLs (unused and tournament-scope rows) are
        // exempt, since Postgres treats them as distinct.
        discountsUsedSignupUniq: uniqueIndex("discounts_used_signup_uniq").on(
            table.used_signup_id
        )
    })
)

export const evaluations = pgTable(
    "evaluations",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        player: text("player")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        evaluator: text("evaluator")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" })
    },
    (table) => ({
        evaluationsSeasonPlayerEvaluatorUniq: uniqueIndex(
            "evaluations_season_player_evaluator_uniq"
        ).on(table.season, table.player, table.evaluator),
        evaluationsPlayerIdx: index("evaluations_player_idx").on(table.player),
        evaluationsEvaluatorIdx: index("evaluations_evaluator_idx").on(
            table.evaluator
        ),
        evaluationsSeasonDivisionIdx: index(
            "evaluations_season_division_idx"
        ).on(table.season, table.division)
    })
)

export const playerRatings = pgTable(
    "player_ratings",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        player: text("player")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        evaluator: text("evaluator")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        overall: real("overall"),
        passing: real("passing"),
        setting: real("setting"),
        hitting: real("hitting"),
        serving: real("serving"),
        blocking: real("blocking"),
        shared_notes: text("shared_notes"),
        private_notes: text("private_notes"),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        seasonPlayerEvaluatorUnique: uniqueIndex(
            "player_ratings_season_player_evaluator_unique"
        ).on(table.season, table.player, table.evaluator),
        playerRatingsPlayerIdx: index("player_ratings_player_idx").on(
            table.player
        )
    })
)

export const auditLog = pgTable(
    "audit_log",
    {
        id: serial("id").primaryKey(),
        user: text("user")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        action: text("action").notNull(),
        entity_type: text("entity_type"),
        entity_id: text("entity_id"),
        summary: text("summary").notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        auditLogUserIdx: index("audit_log_user_idx").on(table.user),
        auditLogCreatedAtIdx: index("audit_log_created_at_idx").on(
            table.created_at
        )
    })
)

export const movingDay = pgTable(
    "moving_day",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        submitted_by: text("submitted_by")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        player: text("player")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        direction: text("direction").notNull(), // 'up' | 'down'
        is_forced: boolean("is_forced").default(false).notNull(),
        submitted_at: timestamp("submitted_at").defaultNow().notNull()
    },
    (table) => ({
        movingDaySeasonPlayerIdx: index("moving_day_season_player_idx").on(
            table.season,
            table.player
        )
    })
)

export const draftHomework = pgTable(
    "draft_homework",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        captain: text("captain")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        round: integer("round").notNull(),
        slot: integer("slot").notNull(),
        player: text("player")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        is_male_tab: boolean("is_male_tab").notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        draftHomeworkSeasonCaptainDivisionIdx: index(
            "draft_homework_season_captain_division_idx"
        ).on(table.season, table.captain, table.division),
        draftHomeworkPlayerIdx: index("draft_homework_player_idx").on(
            table.player
        )
    })
)

export const emailTemplates = pgTable("email_templates", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    subject: text("subject"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull()
})

export const concerns = pgTable(
    "concerns",
    {
        id: serial("id").primaryKey(),
        // null = submitted anonymously
        user_id: text("user_id").references(() => users.id, {
            onDelete: "set null"
        }),
        anonymous: boolean("anonymous").default(false).notNull(),
        // Contact info for non-anonymous or anonymous-with-followup
        contact_name: text("contact_name"),
        contact_email: text("contact_email"),
        contact_phone: text("contact_phone"),
        want_followup: boolean("want_followup").default(false).notNull(),
        incident_date: text("incident_date").notNull(),
        location: text("location").notNull(),
        person_involved: text("person_involved").notNull(),
        witnesses: text("witnesses"),
        team_match: text("team_match"),
        description: text("description").notNull(),
        status: text("status").default("new").notNull(), // 'new' | 'active' | 'closed'
        assigned_to: text("assigned_to").references(() => users.id, {
            onDelete: "set null"
        }),
        // How the concern was submitted: 'web' (default) or 'email'
        source: text("source").default("web").notNull(),
        // External email_id when source = 'email'
        source_email_id: text("source_email_id"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        concernsStatusIdx: index("concerns_status_idx").on(table.status),
        concernsAssignedToIdx: index("concerns_assigned_to_idx").on(
            table.assigned_to
        ),
        concernsUserIdx: index("concerns_user_idx").on(table.user_id)
    })
)

export const concernComments = pgTable(
    "concern_comments",
    {
        id: serial("id").primaryKey(),
        concern_id: integer("concern_id")
            .notNull()
            .references(() => concerns.id, { onDelete: "cascade" }),
        author_id: text("author_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        content: text("content").notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        concernCommentsConcernIdx: index("concern_comments_concern_idx").on(
            table.concern_id
        )
    })
)

export const concernReplies = pgTable(
    "concern_replies",
    {
        id: serial("id").primaryKey(),
        concern_id: integer("concern_id")
            .notNull()
            .references(() => concerns.id, { onDelete: "cascade" }),
        sent_by: text("sent_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        subject: text("subject").notNull(),
        body_text: text("body_text").notNull(),
        sent_to: text("sent_to").notNull(),
        postmark_message_id: text("postmark_message_id"),
        sent_at: timestamp("sent_at").defaultNow().notNull()
    },
    (table) => ({
        concernRepliesConcernIdx: index("concern_replies_concern_idx").on(
            table.concern_id
        )
    })
)

export const concernReceived = pgTable(
    "concern_received",
    {
        id: serial("id").primaryKey(),
        concern_id: integer("concern_id")
            .notNull()
            .references(() => concerns.id, { onDelete: "cascade" }),
        from_address: text("from_address").notNull(),
        from_name: text("from_name"),
        subject: text("subject").notNull(),
        body_text: text("body_text"),
        body_html: text("body_html"),
        postmark_message_id: text("postmark_message_id"),
        received_at: timestamp("received_at").defaultNow().notNull()
    },
    (table) => ({
        concernReceivedConcernIdx: index("concern_received_concern_idx").on(
            table.concern_id
        )
    })
)

// --- Inbound Emails (admin inbox) ---

export const inboundEmails = pgTable(
    "inbound_emails",
    {
        id: serial("id").primaryKey(),
        email_id: text("email_id").notNull(), // Postmark MessageID
        from_address: text("from_address").notNull(),
        from_name: text("from_name"),
        to_address: text("to_address").notNull(),
        subject: text("subject").notNull(),
        body_text: text("body_text"),
        body_html: text("body_html"),
        status: text("status").default("new").notNull(), // 'new' | 'active' | 'closed'
        assigned_to: text("assigned_to").references(() => users.id, {
            onDelete: "set null"
        }),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        inboundEmailsStatusIdx: index("inbound_emails_status_idx").on(
            table.status
        ),
        inboundEmailsAssignedToIdx: index("inbound_emails_assigned_to_idx").on(
            table.assigned_to
        ),
        inboundEmailsEmailIdIdx: index("inbound_emails_email_id_idx").on(
            table.email_id
        )
    })
)

export const inboundEmailComments = pgTable(
    "inbound_email_comments",
    {
        id: serial("id").primaryKey(),
        email_id: integer("email_id")
            .notNull()
            .references(() => inboundEmails.id, { onDelete: "cascade" }),
        author_id: text("author_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        content: text("content").notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        inboundEmailCommentsEmailIdx: index(
            "inbound_email_comments_email_idx"
        ).on(table.email_id)
    })
)

export const inboundEmailReplies = pgTable(
    "inbound_email_replies",
    {
        id: serial("id").primaryKey(),
        email_id: integer("email_id")
            .notNull()
            .references(() => inboundEmails.id, { onDelete: "cascade" }),
        sent_by: text("sent_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        subject: text("subject").notNull(),
        body_text: text("body_text").notNull(),
        sent_to: text("sent_to").notNull(),
        postmark_message_id: text("postmark_message_id"),
        sent_at: timestamp("sent_at").defaultNow().notNull()
    },
    (table) => ({
        inboundEmailRepliesEmailIdx: index(
            "inbound_email_replies_email_idx"
        ).on(table.email_id)
    })
)

export const inboundEmailReceived = pgTable(
    "inbound_email_received",
    {
        id: serial("id").primaryKey(),
        email_id: integer("email_id")
            .notNull()
            .references(() => inboundEmails.id, { onDelete: "cascade" }),
        from_address: text("from_address").notNull(),
        from_name: text("from_name"),
        subject: text("subject").notNull(),
        body_text: text("body_text"),
        body_html: text("body_html"),
        postmark_message_id: text("postmark_message_id"),
        received_at: timestamp("received_at").defaultNow().notNull()
    },
    (table) => ({
        inboundEmailReceivedEmailIdx: index(
            "inbound_email_received_email_idx"
        ).on(table.email_id)
    })
)

export const draftCaptRounds = pgTable(
    "draft_capt_rounds",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        saved_by: text("saved_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        captain: text("captain")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        round: integer("round").notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        uniq: uniqueIndex("draft_capt_rounds_season_div_captain_uniq").on(
            table.season,
            table.division,
            table.captain
        ),
        captainIdx: index("draft_capt_rounds_captain_idx").on(table.captain)
    })
)

export const draftPairDiffs = pgTable(
    "draft_pair_diffs",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        division: integer("division")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        saved_by: text("saved_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        player1: text("player1")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        player2: text("player2")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        diff: integer("diff").notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        uniq: uniqueIndex("draft_pair_diffs_season_div_players_uniq").on(
            table.season,
            table.division,
            table.player1,
            table.player2
        ),
        player1Idx: index("draft_pair_diffs_player1_idx").on(table.player1),
        player2Idx: index("draft_pair_diffs_player2_idx").on(table.player2)
    })
)

export const scoreSheets = pgTable(
    "score_sheets",
    {
        id: serial("id").primaryKey(),
        season_id: integer("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        division_id: integer("division_id")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        match_date: date("match_date", { mode: "string" }).notNull(),
        image_path: text("image_path").notNull(),
        uploaded_by: text("uploaded_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        uploaded_at: timestamp("uploaded_at").defaultNow().notNull()
    },
    (table) => ({
        scoreSheetsSeasonDivDateIdx: index(
            "score_sheets_season_div_date_idx"
        ).on(table.season_id, table.division_id, table.match_date)
    })
)

// user_roles: multi-role assignment table supporting season/division scoping.
// Replaces users.role column and commissioners table as the source of truth
// for authorization. Permissions are defined in src/lib/permissions.ts.
export const userRoles = pgTable(
    "user_roles",
    {
        id: serial("id").primaryKey(),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        role: text("role").notNull(),
        // null = global/permanent role (e.g. admin). Cascade (not set null!) on
        // season/division delete — nulling would silently widen a scoped role
        // into a global one.
        season_id: integer("season_id").references(() => seasons.id, {
            onDelete: "cascade"
        }),
        // null = league-wide access for the season; set to restrict to one division
        division_id: integer("division_id").references(() => divisions.id, {
            onDelete: "cascade"
        }),
        granted_by: text("granted_by").references(() => users.id, {
            onDelete: "set null"
        }),
        granted_at: timestamp("granted_at").defaultNow().notNull()
    },
    (table) => ({
        userRolesUserIdx: index("user_roles_user_idx").on(table.user_id),
        userRolesSeasonIdx: index("user_roles_season_idx").on(table.season_id),
        // NULLS NOT DISTINCT so duplicate global-role rows (null season and
        // division) are blocked too.
        userRolesIdentityUniq: unique("user_roles_identity_uniq")
            .on(table.user_id, table.role, table.season_id, table.division_id)
            .nullsNotDistinct()
    })
)

export const seasonRefs = pgTable(
    "season_refs",
    {
        id: serial("id").primaryKey(),
        season_id: integer("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        is_certified: boolean("is_certified").default(false).notNull(),
        has_w9: boolean("has_w9").default(false).notNull(),
        passed_test: boolean("passed_test").default(false).notNull(),
        is_active: boolean("is_active").default(true).notNull(),
        max_division_level: integer("max_division_level").notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        seasonRefsSeasonIdx: index("season_refs_season_idx").on(
            table.season_id
        ),
        seasonRefsUserIdx: index("season_refs_user_idx").on(table.user_id),
        seasonRefsUnique: uniqueIndex("season_refs_unique").on(
            table.season_id,
            table.user_id
        )
    })
)

export const matchReferees = pgTable(
    "match_referees",
    {
        id: serial("id").primaryKey(),
        match_id: integer("match_id")
            .notNull()
            .references(() => matches.id, { onDelete: "cascade" }),
        referee_id: text("referee_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        season_id: integer("season_id")
            .notNull()
            .references(() => seasons.id, { onDelete: "cascade" }),
        role: text("role").notNull().default("primary"),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        matchRefereesMatchRoleIdx: uniqueIndex(
            "match_referees_match_role_idx"
        ).on(table.match_id, table.role),
        matchRefereesRefereeIdx: index("match_referees_referee_idx").on(
            table.referee_id
        ),
        matchRefereesSeasonIdx: index("match_referees_season_idx").on(
            table.season_id
        )
    })
)

// --- Email Recipient Groups & Suppressions (Postmark) ---

/**
 * Local recipient groups for targeting broadcast emails.
 * Groups are created lazily via ensureRecipientGroup() in src/lib/email-recipients.ts.
 * season_division and season_team groups are cleaned up when a season moves
 * to the "complete" phase; season_signups and all_users groups are permanent.
 */
export const emailRecipientGroups = pgTable(
    "email_recipient_groups",
    {
        id: serial("id").primaryKey(),
        name: text("name").notNull(),
        // One of RecipientGroupType in src/lib/email-recipients.ts, which is
        // the authority on the accepted values.
        group_type: text("group_type").notNull(),
        season_id: integer("season_id").references(() => seasons.id, {
            onDelete: "set null"
        }),
        division_id: integer("division_id").references(() => divisions.id, {
            onDelete: "set null"
        }),
        team_id: integer("team_id").references(() => teams.id, {
            onDelete: "set null"
        }),
        // Scopes a group to a single season event (currently only used to
        // target one tryout night's volunteers).
        event_id: integer("event_id").references(() => seasonEvents.id, {
            onDelete: "set null"
        }),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        recipientGroupTypeUniq: uniqueIndex(
            "email_recipient_groups_type_season_div_team_uniq"
        ).on(
            table.group_type,
            table.season_id,
            table.division_id,
            table.team_id,
            table.event_id
        ),
        recipientGroupSeasonIdx: index("email_recipient_groups_season_idx").on(
            table.season_id
        )
    })
)

/**
 * Tracks per-stream email suppressions (unsubscribes, bounces, spam complaints).
 * Postmark manages suppressions per message stream; this table mirrors that state
 * via the subscription-change webhook so we can filter recipients before sending.
 */
export const emailSuppressions = pgTable(
    "email_suppressions",
    {
        id: serial("id").primaryKey(),
        user_id: text("user_id").references(() => users.id, {
            onDelete: "cascade"
        }),
        email: text("email").notNull(),
        // Postmark stream ID: 'outbound', 'broadcast', 'in-season-updates', etc.
        stream_id: text("stream_id").notNull(),
        // 'HardBounce' | 'SpamComplaint' | 'ManualSuppression'
        reason: text("reason").notNull(),
        // 'Recipient' | 'Customer' | 'Admin'
        origin: text("origin").notNull(),
        suppressed_at: timestamp("suppressed_at").defaultNow().notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        suppressionEmailStreamUniq: uniqueIndex(
            "email_suppressions_email_stream_uniq"
        ).on(table.email, table.stream_id)
    })
)

/**
 * Tracks all bulk email broadcasts sent via the Send Email admin page.
 * Stores both rendered HTML and raw Lexical JSON so "Send Again" can
 * reload the editor without lossy HTML-to-Lexical conversion.
 */
export const emailBroadcasts = pgTable(
    "email_broadcasts",
    {
        id: serial("id").primaryKey(),
        // Groups are routinely deleted at season completion; broadcast history
        // must survive that cleanup.
        recipient_group_id: integer("recipient_group_id").references(
            () => emailRecipientGroups.id,
            { onDelete: "set null" }
        ),
        // Postmark stream used: 'broadcast' or 'in-season-updates'
        stream_id: text("stream_id"),
        template_id: integer("template_id"),
        subject: text("subject").notNull(),
        html_content: text("html_content").notNull(),
        lexical_content: jsonb("lexical_content")
            .$type<Record<string, unknown>>()
            .notNull(),
        sent_by: text("sent_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        // 'draft' | 'sent' | 'failed'
        status: text("status").default("draft").notNull(),
        error_message: text("error_message"),
        // Size of the recipient group *before* the suppression filter runs, so the
        // history view can show "sent 932 of 1,999" and make the shortfall visible.
        // Null on rows sent before this column existed — the figure cannot be
        // reconstructed after the fact.
        recipient_total: integer("recipient_total"),
        sent_count: integer("sent_count"),
        failed_count: integer("failed_count"),
        sent_at: timestamp("sent_at"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        emailBroadcastsGroupIdx: index("email_broadcasts_group_idx").on(
            table.recipient_group_id
        ),
        emailBroadcastsCreatedAtIdx: index(
            "email_broadcasts_created_at_idx"
        ).on(table.created_at)
    })
)

// --- Sub requests (captain-to-captain) ---

export const subRequestStatusEnum = pgEnum("sub_request_status", [
    "pending",
    "approved",
    "declined",
    "cancelled",
    "expired"
])

/**
 * A captain's request to borrow a rostered player from another team for one
 * match. Approval (by the target player's captain) creates the
 * match_substitutions row in the same transaction. Statuses other than
 * pending are terminal; pending requests for past-dated matches are lazily
 * flipped to expired.
 */
export const subRequests = pgTable(
    "sub_requests",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id, { onDelete: "restrict" }),
        match: integer("match")
            .notNull()
            .references(() => matches.id, { onDelete: "cascade" }),
        requesting_team: integer("requesting_team")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        target_team: integer("target_team")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        // Player being covered (on the requesting team)
        original_user: text("original_user")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        // Candidate sub (on the target team)
        target_user: text("target_user")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        status: subRequestStatusEnum("status").default("pending").notNull(),
        message: text("message"),
        requested_by: text("requested_by")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        responded_by: text("responded_by").references(() => users.id, {
            onDelete: "restrict"
        }),
        responded_at: timestamp("responded_at"),
        response_note: text("response_note"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        subRequestsMatchIdx: index("sub_requests_match_idx").on(table.match),
        subRequestsRequestingTeamIdx: index(
            "sub_requests_requesting_team_idx"
        ).on(table.requesting_team),
        subRequestsTargetTeamIdx: index("sub_requests_target_team_idx").on(
            table.target_team
        ),
        subRequestsSeasonIdx: index("sub_requests_season_idx").on(table.season),
        // One live ask per (match, slot, candidate); resolved requests never
        // block a re-ask thanks to the partial index.
        subRequestsPendingUniq: uniqueIndex("sub_requests_pending_uniq")
            .on(table.match, table.original_user, table.target_user)
            .where(sql`${table.status} = 'pending'`)
    })
)

// --- Friendships (player-to-player) ---

export const friendshipStatusEnum = pgEnum("friendship_status", [
    "pending",
    "accepted",
    "declined",
    "cancelled",
    "removed"
])

/**
 * A friend request / friendship edge. `requester` → `addressee` records who
 * asked; once accepted the relationship is mutual and the direction is only
 * historical. declined/cancelled/removed are terminal and never block a
 * re-request (partial unique index below).
 */
export const friendships = pgTable(
    "friendships",
    {
        id: serial("id").primaryKey(),
        requester: text("requester")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        addressee: text("addressee")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        status: friendshipStatusEnum("status").default("pending").notNull(),
        responded_at: timestamp("responded_at"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
    },
    (table) => ({
        friendshipsRequesterIdx: index("friendships_requester_idx").on(
            table.requester
        ),
        friendshipsAddresseeIdx: index("friendships_addressee_idx").on(
            table.addressee
        ),
        // One live edge per unordered pair: blocks duplicate pendings in
        // either direction and a second accepted edge, while terminal rows
        // accumulate as history.
        friendshipsLivePairUniq: uniqueIndex("friendships_live_pair_uniq")
            .on(
                sql`least(${table.requester}, ${table.addressee})`,
                sql`greatest(${table.requester}, ${table.addressee})`
            )
            .where(sql`${table.status} IN ('pending', 'accepted')`),
        friendshipsNoSelf: check(
            "friendships_no_self",
            sql`${table.requester} <> ${table.addressee}`
        )
    })
)

// --- Notification preferences & log ---

/**
 * Per-type notification opt-outs. Absence of a row means the user receives
 * that type — new users and new notification types are opted in by default
 * with no backfill. Valid type values live in the code registry
 * (src/lib/notifications/types.ts); mandatory types never get rows here.
 */
export const notificationOptouts = pgTable(
    "notification_optouts",
    {
        id: serial("id").primaryKey(),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        notification_type: text("notification_type").notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        notificationOptoutsUserTypeUniq: uniqueIndex(
            "notification_optouts_user_type_uniq"
        ).on(table.user_id, table.notification_type),
        notificationOptoutsTypeIdx: index("notification_optouts_type_idx").on(
            table.notification_type
        )
    })
)

/**
 * Record of every notification email handed to Postmark by the dispatcher
 * (src/lib/notifications/dispatch.ts). Doubles as the idempotency ledger for
 * scheduled sends: cron jobs pass a dedupe_key, and the partial unique index
 * makes the claim insert a no-op when the same key+email was already claimed,
 * so a double-fired cron sends nothing twice.
 */
export const notificationLog = pgTable(
    "notification_log",
    {
        id: serial("id").primaryKey(),
        user_id: text("user_id").references(() => users.id, {
            onDelete: "set null"
        }),
        email: text("email").notNull(),
        // Which send policy produced this row. See MailMode in
        // src/lib/email/send.ts — 'notification' | 'transactional' |
        // 'staff' | 'broadcast' | 'reply'. Defaults to 'notification'
        // because every row predating the unified funnel was one.
        mode: text("mode").default("notification").notNull(),
        // The specific notification type or, for non-notification modes,
        // the category ('password_reset', 'concern_assigned', …).
        notification_type: text("notification_type").notNull(),
        stream_id: text("stream_id").notNull(),
        tag: text("tag"),
        subject: text("subject").notNull(),
        dedupe_key: text("dedupe_key"),
        // 'claimed' | 'sent' | 'failed'
        status: text("status").notNull(),
        postmark_message_id: text("postmark_message_id"),
        // Set for mode='broadcast', giving email_broadcasts the
        // per-recipient detail its aggregate counts never had.
        broadcast_id: integer("broadcast_id").references(
            () => emailBroadcasts.id,
            { onDelete: "set null" }
        ),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        notificationLogDedupeUniq: uniqueIndex("notification_log_dedupe_uniq")
            .on(table.notification_type, table.dedupe_key, table.email)
            .where(sql`${table.dedupe_key} IS NOT NULL`),
        notificationLogUserIdx: index("notification_log_user_idx").on(
            table.user_id
        ),
        // The admin email-history lookup matches on address as well as
        // user id, so sends that predate an account are still found.
        notificationLogEmailIdx: index("notification_log_email_idx").on(
            table.email
        ),
        notificationLogBroadcastIdx: index("notification_log_broadcast_idx").on(
            table.broadcast_id
        ),
        notificationLogCreatedAtIdx: index(
            "notification_log_created_at_idx"
        ).on(table.created_at)
    })
)

// Waivers: each row is a published, immutable version of the legal waiver.
// Never UPDATE content or created_at — a DB trigger enforces this. To revise
// the waiver, INSERT a new row and flip `active`.
export const waivers = pgTable("waivers", {
    id: serial("id").primaryKey(),
    content: text("content").notNull(),
    active: boolean("active").default(false).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    created_by: text("created_by").references(() => users.id, {
        onDelete: "set null"
    })
})

// One row per (user, waiver version) the first time that user accepts it.
// Unique constraint makes acceptance idempotent.
export const waiverAcceptances = pgTable(
    "waiver_acceptances",
    {
        id: serial("id").primaryKey(),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        waiver_id: integer("waiver_id")
            .notNull()
            .references(() => waivers.id, { onDelete: "restrict" }),
        accepted_at: timestamp("accepted_at").defaultNow().notNull()
    },
    (table) => ({
        waiverAcceptancesUserWaiverIdx: uniqueIndex(
            "waiver_acceptances_user_waiver_idx"
        ).on(table.user_id, table.waiver_id),
        waiverAcceptancesWaiverIdx: index("waiver_acceptances_waiver_idx").on(
            table.waiver_id
        )
    })
)

// --- Tournaments ---
// Single-day, captain-led tournaments that run in parallel to seasons.
// Share users with seasons but otherwise standalone (no draft, no multi-week).

export const tournaments = pgTable("tournaments", {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    year: integer("year").notNull(),
    name: text("name").notNull(),
    phase: text("phase").default("registration_open").notNull(),
    tournament_date: date("tournament_date", { mode: "string" }).notNull(),
    checkin_time: time("checkin_time"),
    first_serve_time: time("first_serve_time"),
    address: text("address"),
    cost: numeric("cost"),
    late_cost: numeric("late_cost"),
    late_date: date("late_date", { mode: "string" }),
    registration_close_date: date("registration_close_date", {
        mode: "string"
    }),
    roster_lock_date: date("roster_lock_date", { mode: "string" }),
    // 'coed' | 'reverse_coed' — label/display only
    tournament_type: text("tournament_type").notNull(),
    pool_size: integer("pool_size").notNull(),
    // 'single' | 'double'
    elimination_format: text("elimination_format").notNull(),
    // Sets-per-match format, configured separately for pool play and playoffs.
    // mode: 'exact' (play all N sets, ties allowed) | 'best_of' (first to
    // majority of N set wins). count is the number of sets (1-3, bounded by the
    // three physical set-score columns). Defaults preserve the common setup:
    // pool play is two straight sets; playoffs are best of three.
    pool_sets_mode: text("pool_sets_mode").notNull().default("exact"),
    pool_sets_count: integer("pool_sets_count").notNull().default(2),
    playoff_sets_mode: text("playoff_sets_mode").notNull().default("best_of"),
    playoff_sets_count: integer("playoff_sets_count").notNull().default(3),
    // Free-form notes shown on the public marketing page (formats, prizes,
    // raffles, where to park, etc.). Plain text — newlines preserved.
    additional_info: text("additional_info"),
    created_at: timestamp("created_at").defaultNow().notNull()
})

export const tournamentDivisions = pgTable(
    "tournament_divisions",
    {
        id: serial("id").primaryKey(),
        tournament_id: integer("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        // Identity comes from the league-wide `divisions` table (e.g. "A", "BB").
        // Display always uses divisions.name; sorting uses divisions.level.
        division_id: integer("division_id")
            .notNull()
            .references(() => divisions.id, { onDelete: "restrict" }),
        team_count: integer("team_count").notNull(),
        male_per_team: integer("male_per_team").notNull(),
        non_male_per_team: integer("non_male_per_team").notNull(),
        // Number of teams from each pool that advance to bracket play
        teams_advancing_per_pool: integer("teams_advancing_per_pool")
            .default(2)
            .notNull(),
        sort_order: integer("sort_order").notNull()
    },
    (table) => ({
        tournamentDivisionsTournamentIdx: index(
            "tournament_divisions_tournament_idx"
        ).on(table.tournament_id),
        // One row per (tournament, league-division) — can't list "A" twice.
        tournamentDivisionsUniq: uniqueIndex(
            "tournament_divisions_tournament_division_uniq"
        ).on(table.tournament_id, table.division_id)
    })
)

export const tournamentTeams = pgTable(
    "tournament_teams",
    {
        id: serial("id").primaryKey(),
        // Restrict (not cascade): rows carry payment records (order_id,
        // amount_paid) — deleting a tournament with paid teams must fail
        // until those teams are handled explicitly.
        tournament_id: integer("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "restrict" }),
        // Final division — set by admin during prepare phase; may differ from preferred.
        division_id: integer("division_id").references(
            () => tournamentDivisions.id,
            { onDelete: "set null" }
        ),
        preferred_division_id: integer("preferred_division_id")
            .notNull()
            .references(() => tournamentDivisions.id),
        captain_user_id: text("captain_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        name: text("name").notNull(),
        order_id: text("order_id"),
        amount_paid: numeric("amount_paid"),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        tournamentTeamsTournamentIdx: index(
            "tournament_teams_tournament_idx"
        ).on(table.tournament_id),
        tournamentTeamsCaptainIdx: index("tournament_teams_captain_idx").on(
            table.captain_user_id
        ),
        // One captain may only register one team per tournament.
        tournamentTeamsCaptainUniq: uniqueIndex(
            "tournament_teams_tournament_captain_uniq"
        ).on(table.tournament_id, table.captain_user_id)
    })
)

// Rostered players (includes the captain).
// DB-level unique on (tournament_id, user_id) enforces "no player on two teams"
// in the same tournament — defense-in-depth so app bugs can't double-roster.
export const tournamentRoster = pgTable(
    "tournament_roster",
    {
        id: serial("id").primaryKey(),
        tournament_id: integer("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        team_id: integer("team_id")
            .notNull()
            .references(() => tournamentTeams.id, { onDelete: "cascade" }),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        added_by_user_id: text("added_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        added_at: timestamp("added_at").defaultNow().notNull()
    },
    (table) => ({
        tournamentRosterTeamIdx: index("tournament_roster_team_idx").on(
            table.team_id
        ),
        tournamentRosterUserIdx: index("tournament_roster_user_idx").on(
            table.user_id
        ),
        tournamentRosterUserUniq: uniqueIndex(
            "tournament_roster_tournament_user_uniq"
        ).on(table.tournament_id, table.user_id)
    })
)

// Players without a team express interest; waiver acceptance is required at
// time of waitlist join. Admins later place them onto a team.
export const tournamentWaitlist = pgTable(
    "tournament_waitlist",
    {
        id: serial("id").primaryKey(),
        tournament_id: integer("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        user_id: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        waiver_id: integer("waiver_id")
            .notNull()
            .references(() => waivers.id, { onDelete: "restrict" }),
        approved: boolean("approved").default(false).notNull(),
        placed_team_id: integer("placed_team_id").references(
            () => tournamentTeams.id,
            { onDelete: "set null" }
        ),
        // Optional: player's preferred division (e.g. "A", "BB"). Null = no
        // preference. Cascade to null if the division row goes away so we
        // never end up with a dangling reference.
        preferred_division_id: integer("preferred_division_id").references(
            () => tournamentDivisions.id,
            { onDelete: "set null" }
        ),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        tournamentWaitlistTournamentIdx: index(
            "tournament_waitlist_tournament_idx"
        ).on(table.tournament_id),
        tournamentWaitlistUserUniq: uniqueIndex(
            "tournament_waitlist_tournament_user_uniq"
        ).on(table.tournament_id, table.user_id)
    })
)

export const tournamentPools = pgTable(
    "tournament_pools",
    {
        id: serial("id").primaryKey(),
        tournament_id: integer("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        division_id: integer("division_id")
            .notNull()
            .references(() => tournamentDivisions.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        sort_order: integer("sort_order").notNull()
    },
    (table) => ({
        tournamentPoolsDivisionIdx: index("tournament_pools_division_idx").on(
            table.division_id
        )
    })
)

export const tournamentPoolTeams = pgTable(
    "tournament_pool_teams",
    {
        id: serial("id").primaryKey(),
        tournament_id: integer("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        pool_id: integer("pool_id")
            .notNull()
            .references(() => tournamentPools.id, { onDelete: "cascade" }),
        team_id: integer("team_id")
            .notNull()
            .references(() => tournamentTeams.id, { onDelete: "cascade" })
    },
    (table) => ({
        tournamentPoolTeamsPoolIdx: index("tournament_pool_teams_pool_idx").on(
            table.pool_id
        ),
        // Each team belongs to exactly one pool in its tournament.
        tournamentPoolTeamsTeamUniq: uniqueIndex(
            "tournament_pool_teams_tournament_team_uniq"
        ).on(table.tournament_id, table.team_id)
    })
)

// Mirrors the league `matches` shape (3 sets, scores) but tournament-scoped.
// `bracket` distinguishes pool play from bracket rounds.
// `work_team_id` is the team responsible for entering the score (replaces the
// season's referee_team concept) — auth for score entry checks the caller's
// roster against this column.
export const tournamentMatches = pgTable(
    "tournament_matches",
    {
        id: serial("id").primaryKey(),
        tournament_id: integer("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        // division_id / home_team_id / away_team_id intentionally have no
        // onDelete: NO ACTION defers the FK check to end-of-statement so a
        // tournament-level cascade can remove matches and their referenced
        // divisions/teams in one statement (RESTRICT would fail mid-cascade).
        division_id: integer("division_id")
            .notNull()
            .references(() => tournamentDivisions.id),
        // null for bracket matches
        pool_id: integer("pool_id").references(() => tournamentPools.id, {
            onDelete: "cascade"
        }),
        // 'pool' | 'winners' | 'losers' | 'final'
        bracket: text("bracket").notNull(),
        bracket_round: integer("bracket_round"),
        bracket_slot: integer("bracket_slot"),
        court: integer("court"),
        start_time: time("start_time"),
        home_team_id: integer("home_team_id").references(
            () => tournamentTeams.id
        ),
        away_team_id: integer("away_team_id").references(
            () => tournamentTeams.id
        ),
        home_set1_score: integer("home_set1_score"),
        away_set1_score: integer("away_set1_score"),
        home_set2_score: integer("home_set2_score"),
        away_set2_score: integer("away_set2_score"),
        home_set3_score: integer("home_set3_score"),
        away_set3_score: integer("away_set3_score"),
        winner_team_id: integer("winner_team_id").references(
            () => tournamentTeams.id,
            { onDelete: "set null" }
        ),
        work_team_id: integer("work_team_id").references(
            () => tournamentTeams.id,
            { onDelete: "set null" }
        )
    },
    (table) => ({
        tournamentMatchesTournamentIdx: index(
            "tournament_matches_tournament_idx"
        ).on(table.tournament_id),
        tournamentMatchesPoolIdx: index("tournament_matches_pool_idx").on(
            table.pool_id
        ),
        tournamentMatchesDivisionIdx: index(
            "tournament_matches_division_idx"
        ).on(table.division_id),
        tournamentMatchesCourtTimeIdx: index(
            "tournament_matches_court_time_idx"
        ).on(table.tournament_id, table.court, table.start_time)
    })
)

// Final placements per division, recorded when a tournament completes (normally
// or via "end early"). Unlike the season `champions` table (1st place only), this
// stores a full ordinal ranking so 1st/2nd (and beyond) are all persisted.
export const tournamentPlacements = pgTable(
    "tournament_placements",
    {
        id: serial("id").primaryKey(),
        tournament_id: integer("tournament_id")
            .notNull()
            .references(() => tournaments.id, { onDelete: "cascade" }),
        // Per-tournament division (matches how tournament_matches/_teams reference it).
        division_id: integer("division_id")
            .notNull()
            .references(() => tournamentDivisions.id, { onDelete: "cascade" }),
        // No onDelete (NO ACTION): placement history blocks team deletion
        // unless the whole tournament is being removed in one statement.
        team_id: integer("team_id")
            .notNull()
            .references(() => tournamentTeams.id),
        // 1-based ordinal finish within the division (1 = champion).
        place: integer("place").notNull(),
        created_at: timestamp("created_at").defaultNow().notNull()
    },
    (table) => ({
        tournamentPlacementsTournamentIdx: index(
            "tournament_placements_tournament_idx"
        ).on(table.tournament_id),
        // One team gets exactly one placement per tournament.
        tournamentPlacementsTeamUniq: uniqueIndex(
            "tournament_placements_tournament_team_uniq"
        ).on(table.tournament_id, table.team_id),
        // Each place is used once per division.
        tournamentPlacementsPlaceUniq: uniqueIndex(
            "tournament_placements_division_place_uniq"
        ).on(table.tournament_id, table.division_id, table.place)
    })
)

// --- Relations (core league graph) ---
// Code-only metadata: enables `db.query.*.with(...)` relational queries.
// No DDL is generated from these.

export const usersRelations = relations(users, ({ many }) => ({
    signups: many(signups),
    drafts: many(drafts),
    captainedTeams: many(teams),
    roles: many(userRoles)
}))

export const seasonsRelations = relations(seasons, ({ many }) => ({
    signups: many(signups),
    teams: many(teams),
    matches: many(matches),
    events: many(seasonEvents)
}))

export const divisionsRelations = relations(divisions, ({ many }) => ({
    teams: many(teams),
    matches: many(matches)
}))

export const teamsRelations = relations(teams, ({ one, many }) => ({
    season: one(seasons, {
        fields: [teams.season],
        references: [seasons.id]
    }),
    division: one(divisions, {
        fields: [teams.division],
        references: [divisions.id]
    }),
    captain: one(users, {
        fields: [teams.captain],
        references: [users.id]
    }),
    drafts: many(drafts)
}))

export const signupsRelations = relations(signups, ({ one }) => ({
    season: one(seasons, {
        fields: [signups.season],
        references: [seasons.id]
    }),
    player: one(users, {
        fields: [signups.player],
        references: [users.id]
    })
}))

export const draftsRelations = relations(drafts, ({ one }) => ({
    team: one(teams, {
        fields: [drafts.team],
        references: [teams.id]
    }),
    user: one(users, {
        fields: [drafts.user],
        references: [users.id]
    })
}))

export const matchesRelations = relations(matches, ({ one }) => ({
    season: one(seasons, {
        fields: [matches.season],
        references: [seasons.id]
    }),
    division: one(divisions, {
        fields: [matches.division],
        references: [divisions.id]
    }),
    homeTeam: one(teams, {
        fields: [matches.home_team],
        references: [teams.id]
    }),
    awayTeam: one(teams, {
        fields: [matches.away_team],
        references: [teams.id]
    })
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
    user: one(users, {
        fields: [userRoles.user_id],
        references: [users.id]
    })
}))
