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
    uniqueIndex,
    jsonb,
    index
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
    id: text("id").primaryKey(),
    name: text("name"),
    first_name: text("first_name").notNull(),
    last_name: text("last_name").notNull(),
    preferred_name: text("preferred_name"),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified")
        .$defaultFn(() => false)
        .notNull(),
    image: text("image"),
    avatar: text("avatar"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at")
        .$defaultFn(() => /* @__PURE__ */ new Date())
        .notNull(),
    updatedAt: timestamp("updated_at")
        .$defaultFn(() => /* @__PURE__ */ new Date())
        .notNull(),
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
    onboarding_completed: boolean("onboarding_completed").$defaultFn(
        () => false
    ),
    seasons_list: text("seasons_list")
        .$defaultFn(() => "false")
        .notNull(),
    notification_list: text("notification_list")
        .$defaultFn(() => "false")
        .notNull(),
    captain_eligible: boolean("captain_eligible")
        .$defaultFn(() => true)
        .notNull(),
    resend_contact_id: text("resend_contact_id"),
    unsubscribed: boolean("unsubscribed")
        .$defaultFn(() => false)
        .notNull()
})

export const sessions = pgTable("sessions", {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
})

export const accounts = pgTable("accounts", {
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
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull()
})

export const verifications = pgTable("verifications", {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").$defaultFn(
        () => /* @__PURE__ */ new Date()
    ),
    updatedAt: timestamp("updated_at").$defaultFn(
        () => /* @__PURE__ */ new Date()
    )
})

export const seasons = pgTable("seasons", {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    year: integer("year").notNull(),
    season: text("season").notNull(),
    phase: text("phase")
        .$defaultFn(() => "off_season")
        .notNull(),
    season_amount: numeric("season_amount"),
    late_amount: numeric("late_amount"),
    max_players: integer("max_players"),
    certified_ref_rate: numeric("certified_ref_rate"),
    uncertified_ref_rate: numeric("uncertified_ref_rate")
})

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
    active: boolean("active")
        .$defaultFn(() => true)
        .notNull()
})

export const individual_divisions = pgTable("individual_divisions", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    division: integer("divisions")
        .notNull()
        .references(() => divisions.id),
    coaches: boolean("coaches")
        .$defaultFn(() => false)
        .notNull(),
    gender_split: text("gender_split").notNull(),
    teams: integer("teams").notNull()
})

export const signups = pgTable(
    "signups",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id),
        player: text("player")
            .notNull()
            .references(() => users.id),
        age: text("age"),
        captain: text("captain"),
        pair: boolean("pair"),
        pair_pick: text("pair_pick").references(() => users.id),
        pair_reason: text("pair_reason"),
        order_id: text("order_id"),
        amount_paid: numeric("amount_paid"),
        created_at: timestamp("created_at").notNull()
    },
    (table) => ({
        signupsSeasonIdx: index("signups_season_idx").on(table.season),
        signupsPlayerIdx: index("signups_player_idx").on(table.player)
    })
)

export const deletedSignups = pgTable(
    "deleted_signups",
    {
        id: integer("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id),
        player: text("player")
            .notNull()
            .references(() => users.id),
        age: text("age"),
        captain: text("captain"),
        pair: boolean("pair"),
        pair_pick: text("pair_pick"),
        pair_reason: text("pair_reason"),
        order_id: text("order_id"),
        amount_paid: numeric("amount_paid"),
        created_at: timestamp("created_at").notNull(),
        deleted_at: timestamp("deleted_at")
            .$defaultFn(() => new Date())
            .notNull(),
        deleted_by: text("deleted_by")
            .notNull()
            .references(() => users.id),
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
        created_at: timestamp("created_at")
            .$defaultFn(() => new Date())
            .notNull(),
        updated_at: timestamp("updated_at")
            .$defaultFn(() => new Date())
            .notNull()
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

export const teams = pgTable(
    "teams",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id),
        captain: text("captain")
            .notNull()
            .references(() => users.id),
        captain2: text("captain2").references(() => users.id),
        division: integer("division")
            .notNull()
            .references(() => divisions.id),
        name: text("name").notNull(),
        number: integer("number"),
        rank: integer("rank")
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
            .references(() => seasons.id),
        division: integer("division")
            .notNull()
            .references(() => divisions.id),
        week: integer("week").notNull(),
        date: date("date", { mode: "string" }),
        time: time("time"),
        court: integer("court"),
        home_team: integer("home_team").references(() => teams.id),
        away_team: integer("away_team").references(() => teams.id),
        home_score: integer("home_score"),
        away_score: integer("away_score"),
        home_set1_score: integer("home_set1_score"),
        away_set1_score: integer("away_set1_score"),
        home_set2_score: integer("home_set2_score"),
        away_set2_score: integer("away_set2_score"),
        home_set3_score: integer("home_set3_score"),
        away_set3_score: integer("away_set3_score"),
        winner: integer("winner").references(() => teams.id),
        playoff: boolean("playoff")
            .$defaultFn(() => false)
            .notNull()
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

export const playoffMatchesMeta = pgTable("playoff_matches_meta", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    division: integer("division")
        .notNull()
        .references(() => divisions.id),
    week: integer("week").notNull(),
    match_num: integer("match_num").notNull(),
    match_id: integer("match_id").references(() => matches.id),
    bracket: text("bracket"),
    home_source: text("home_source").notNull(),
    away_source: text("away_source").notNull(),
    next_match_num: integer("next_match_num"),
    next_loser_match_num: integer("next_loser_match_num"),
    work_team: integer("work_team").references(() => teams.id),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const week1Rosters = pgTable(
    "week1_rosters",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id),
        user: text("user")
            .notNull()
            .references(() => users.id),
        session_number: integer("session_number").notNull(),
        court_number: integer("court_number").notNull()
    },
    (table) => ({
        week1RostersSeasonIdx: index("week1_rosters_season_idx").on(
            table.season
        )
    })
)

export const week2Rosters = pgTable(
    "week2_rosters",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id),
        user: text("user")
            .notNull()
            .references(() => users.id),
        division: integer("division")
            .notNull()
            .references(() => divisions.id),
        team_number: integer("team_number").notNull(),
        is_captain: boolean("is_captain")
            .$defaultFn(() => false)
            .notNull()
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
            .references(() => seasons.id),
        user: text("user")
            .notNull()
            .references(() => users.id),
        division: integer("division")
            .notNull()
            .references(() => divisions.id),
        team_number: integer("team_number").notNull(),
        is_captain: boolean("is_captain")
            .$defaultFn(() => false)
            .notNull()
    },
    (table) => ({
        week3RostersSeasonIdx: index("week3_rosters_season_idx").on(
            table.season
        )
    })
)

export const champions = pgTable("champions", {
    id: serial("id").primaryKey(),
    team: integer("team")
        .notNull()
        .references(() => teams.id),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    division: integer("division")
        .notNull()
        .references(() => divisions.id),
    picture: text("picture"),
    picture2: text("picture2"),
    caption: text("caption")
})

export const drafts = pgTable(
    "drafts",
    {
        id: serial("id").primaryKey(),
        team: integer("team")
            .notNull()
            .references(() => teams.id),
        user: text("user")
            .notNull()
            .references(() => users.id),
        round: integer("round").notNull(),
        overall: integer("overall").notNull()
    },
    (table) => ({
        draftsTeamIdx: index("drafts_team_idx").on(table.team),
        draftsUserIdx: index("drafts_user_idx").on(table.user)
    })
)

export const waitlist = pgTable("waitlist", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    user: text("user")
        .notNull()
        .references(() => users.id),
    approved: boolean("approved")
        .$defaultFn(() => false)
        .notNull(),
    created_at: timestamp("created_at").notNull()
})

export const discounts = pgTable("discounts", {
    id: serial("id").primaryKey(),
    user: text("user")
        .notNull()
        .references(() => users.id),
    percentage: numeric("percentage").notNull(),
    expiration: timestamp("expiration"),
    reason: text("reason"),
    used: boolean("used")
        .$defaultFn(() => false)
        .notNull(),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const evaluations = pgTable("evaluations", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    player: text("player")
        .notNull()
        .references(() => users.id),
    division: integer("division")
        .notNull()
        .references(() => divisions.id),
    evaluator: text("evaluator")
        .notNull()
        .references(() => users.id)
})

export const playerRatings = pgTable(
    "player_ratings",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id),
        player: text("player")
            .notNull()
            .references(() => users.id),
        evaluator: text("evaluator")
            .notNull()
            .references(() => users.id),
        overall: real("overall"),
        passing: real("passing"),
        setting: real("setting"),
        hitting: real("hitting"),
        serving: real("serving"),
        shared_notes: text("shared_notes"),
        private_notes: text("private_notes"),
        updated_at: timestamp("updated_at")
            .$defaultFn(() => new Date())
            .notNull()
    },
    (table) => ({
        seasonPlayerEvaluatorUnique: uniqueIndex(
            "player_ratings_season_player_evaluator_unique"
        ).on(table.season, table.player, table.evaluator)
    })
)

export const commissioners = pgTable("commissioners", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    commissioner: text("commissioner")
        .notNull()
        .references(() => users.id),
    division: integer("division")
        .notNull()
        .references(() => divisions.id)
})

export const auditLog = pgTable("audit_log", {
    id: serial("id").primaryKey(),
    user: text("user")
        .notNull()
        .references(() => users.id),
    action: text("action").notNull(),
    entity_type: text("entity_type"),
    entity_id: text("entity_id"),
    summary: text("summary").notNull(),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const movingDay = pgTable("moving_day", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    submitted_by: text("submitted_by")
        .notNull()
        .references(() => users.id),
    player: text("player")
        .notNull()
        .references(() => users.id),
    direction: text("direction").notNull(), // 'up' | 'down'
    is_forced: boolean("is_forced")
        .$defaultFn(() => false)
        .notNull(),
    submitted_at: timestamp("submitted_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const draftHomework = pgTable("draft_homework", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    captain: text("captain")
        .notNull()
        .references(() => users.id),
    division: integer("division")
        .notNull()
        .references(() => divisions.id),
    round: integer("round").notNull(),
    slot: integer("slot").notNull(),
    player: text("player")
        .notNull()
        .references(() => users.id),
    is_male_tab: boolean("is_male_tab").notNull(),
    updated_at: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const emailTemplates = pgTable("email_templates", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    subject: text("subject"),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updated_at: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const concerns = pgTable("concerns", {
    id: serial("id").primaryKey(),
    // null = submitted anonymously
    user_id: text("user_id").references(() => users.id, {
        onDelete: "set null"
    }),
    anonymous: boolean("anonymous")
        .$defaultFn(() => false)
        .notNull(),
    // Contact info for non-anonymous or anonymous-with-followup
    contact_name: text("contact_name"),
    contact_email: text("contact_email"),
    contact_phone: text("contact_phone"),
    want_followup: boolean("want_followup")
        .$defaultFn(() => false)
        .notNull(),
    incident_date: text("incident_date").notNull(),
    location: text("location").notNull(),
    person_involved: text("person_involved").notNull(),
    witnesses: text("witnesses"),
    team_match: text("team_match"),
    description: text("description").notNull(),
    status: text("status")
        .$defaultFn(() => "new")
        .notNull(), // 'new' | 'active' | 'closed'
    assigned_to: text("assigned_to").references(() => users.id),
    // How the concern was submitted: 'web' (default) or 'email'
    source: text("source")
        .$defaultFn(() => "web")
        .notNull(),
    // Resend email_id when source = 'email'
    source_email_id: text("source_email_id"),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updated_at: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const concernComments = pgTable("concern_comments", {
    id: serial("id").primaryKey(),
    concern_id: integer("concern_id")
        .notNull()
        .references(() => concerns.id, { onDelete: "cascade" }),
    author_id: text("author_id")
        .notNull()
        .references(() => users.id),
    content: text("content").notNull(),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull()
})

// --- Inbound Emails (admin inbox) ---

export const inboundEmails = pgTable("inbound_emails", {
    id: serial("id").primaryKey(),
    email_id: text("email_id").notNull(), // Resend email_id
    from_address: text("from_address").notNull(),
    from_name: text("from_name"),
    to_address: text("to_address").notNull(),
    subject: text("subject").notNull(),
    body_text: text("body_text"),
    body_html: text("body_html"),
    status: text("status")
        .$defaultFn(() => "new")
        .notNull(), // 'new' | 'active' | 'closed'
    assigned_to: text("assigned_to").references(() => users.id),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updated_at: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const inboundEmailComments = pgTable("inbound_email_comments", {
    id: serial("id").primaryKey(),
    email_id: integer("email_id")
        .notNull()
        .references(() => inboundEmails.id, { onDelete: "cascade" }),
    author_id: text("author_id")
        .notNull()
        .references(() => users.id),
    content: text("content").notNull(),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull()
})

export const draftCaptRounds = pgTable(
    "draft_capt_rounds",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id),
        division: integer("division")
            .notNull()
            .references(() => divisions.id),
        saved_by: text("saved_by")
            .notNull()
            .references(() => users.id),
        captain: text("captain")
            .notNull()
            .references(() => users.id),
        round: integer("round").notNull(),
        updated_at: timestamp("updated_at")
            .$defaultFn(() => new Date())
            .notNull()
    },
    (table) => ({
        uniq: uniqueIndex("draft_capt_rounds_season_div_captain_uniq").on(
            table.season,
            table.division,
            table.captain
        )
    })
)

export const draftPairDiffs = pgTable(
    "draft_pair_diffs",
    {
        id: serial("id").primaryKey(),
        season: integer("season")
            .notNull()
            .references(() => seasons.id),
        division: integer("division")
            .notNull()
            .references(() => divisions.id),
        saved_by: text("saved_by")
            .notNull()
            .references(() => users.id),
        player1: text("player1")
            .notNull()
            .references(() => users.id),
        player2: text("player2")
            .notNull()
            .references(() => users.id),
        diff: integer("diff").notNull(),
        updated_at: timestamp("updated_at")
            .$defaultFn(() => new Date())
            .notNull()
    },
    (table) => ({
        uniq: uniqueIndex("draft_pair_diffs_season_div_players_uniq").on(
            table.season,
            table.division,
            table.player1,
            table.player2
        )
    })
)

export const scoreSheets = pgTable(
    "score_sheets",
    {
        id: serial("id").primaryKey(),
        season_id: integer("season_id")
            .notNull()
            .references(() => seasons.id),
        division_id: integer("division_id")
            .notNull()
            .references(() => divisions.id),
        match_date: date("match_date", { mode: "string" }).notNull(),
        image_path: text("image_path").notNull(),
        uploaded_by: text("uploaded_by")
            .notNull()
            .references(() => users.id),
        uploaded_at: timestamp("uploaded_at")
            .$defaultFn(() => new Date())
            .notNull()
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
        // null = global/permanent role (e.g. admin)
        season_id: integer("season_id").references(() => seasons.id),
        // null = league-wide access for the season; set to restrict to one division
        division_id: integer("division_id").references(() => divisions.id),
        granted_by: text("granted_by").references(() => users.id),
        granted_at: timestamp("granted_at")
            .$defaultFn(() => new Date())
            .notNull()
    },
    (table) => ({
        userRolesUserIdx: index("user_roles_user_idx").on(table.user_id),
        userRolesSeasonIdx: index("user_roles_season_idx").on(table.season_id)
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
        is_certified: boolean("is_certified")
            .$defaultFn(() => false)
            .notNull(),
        has_w9: boolean("has_w9")
            .$defaultFn(() => false)
            .notNull(),
        max_division_level: integer("max_division_level").notNull(),
        created_at: timestamp("created_at")
            .$defaultFn(() => new Date())
            .notNull()
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
        created_at: timestamp("created_at")
            .$defaultFn(() => new Date())
            .notNull()
    },
    (table) => ({
        matchRefereesMatchIdx: uniqueIndex("match_referees_match_idx").on(
            table.match_id
        ),
        matchRefereesRefereeIdx: index("match_referees_referee_idx").on(
            table.referee_id
        ),
        matchRefereesSeasonIdx: index("match_referees_season_idx").on(
            table.season_id
        )
    })
)

// --- Resend Audience / Segment / Topic tracking ---

/**
 * Tracks Resend Segment IDs created for targeting broadcasts.
 * Segments are created lazily via ensureSegment() in src/lib/resend-sync.ts.
 * season_division and season_team segments are cleaned up when a season moves
 * to the "complete" phase; season_signups and all_users segments are permanent.
 */
export const resendSegments = pgTable(
    "resend_segments",
    {
        id: serial("id").primaryKey(),
        name: text("name").notNull(),
        resend_segment_id: text("resend_segment_id").notNull().unique(),
        // 'all_users' | 'season_signups' | 'season_division' | 'season_team'
        segment_type: text("segment_type").notNull(),
        season_id: integer("season_id").references(() => seasons.id, {
            onDelete: "set null"
        }),
        division_id: integer("division_id").references(() => divisions.id, {
            onDelete: "set null"
        }),
        team_id: integer("team_id").references(() => teams.id, {
            onDelete: "set null"
        }),
        created_at: timestamp("created_at")
            .$defaultFn(() => new Date())
            .notNull()
    },
    (table) => ({
        resendSegmentsTypeSeasonDivTeamUniq: uniqueIndex(
            "resend_segments_type_season_div_team_uniq"
        ).on(
            table.segment_type,
            table.season_id,
            table.division_id,
            table.team_id
        )
    })
)

/**
 * Tracks the two Resend Topic IDs (General Updates, In Season Updates).
 * Created once via ensureTopics() and stored here to avoid repeated API lookups.
 */
export const resendTopics = pgTable("resend_topics", {
    id: serial("id").primaryKey(),
    // 'general_updates' | 'in_season_updates'
    topic_type: text("topic_type").notNull().unique(),
    name: text("name").notNull(),
    resend_topic_id: text("resend_topic_id").notNull().unique(),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull()
})

/**
 * Tracks all bulk email broadcasts sent via the Send Email admin page.
 * Stores both rendered HTML and raw Lexical JSON so "Send Again" can
 * reload the editor without lossy HTML-to-Lexical conversion.
 */
export const emailBroadcasts = pgTable("email_broadcasts", {
    id: serial("id").primaryKey(),
    resend_broadcast_id: text("resend_broadcast_id"),
    segment_id: integer("segment_id")
        .notNull()
        .references(() => resendSegments.id),
    topic_id: integer("topic_id").references(() => resendTopics.id),
    template_id: integer("template_id"),
    subject: text("subject").notNull(),
    html_content: text("html_content").notNull(),
    lexical_content: jsonb("lexical_content")
        .$type<Record<string, unknown>>()
        .notNull(),
    sent_by: text("sent_by")
        .notNull()
        .references(() => users.id),
    // 'draft' | 'sent' | 'failed'
    status: text("status")
        .$defaultFn(() => "draft")
        .notNull(),
    error_message: text("error_message"),
    sent_at: timestamp("sent_at"),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updated_at: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull()
})
