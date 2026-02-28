import {
    pgTable,
    text,
    timestamp,
    boolean,
    integer,
    serial,
    numeric,
    uniqueIndex
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
    id: text("id").primaryKey(),
    name: text("name"),
    first_name: text("first_name").notNull(),
    last_name: text("last_name").notNull(),
    preffered_name: text("preffered_name"),
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
    role: text("role"),
    male: boolean("male"),
    onboarding_completed: boolean("onboarding_completed").$defaultFn(
        () => false
    ),
    captain_eligible: boolean("captain_eligible")
        .$defaultFn(() => true)
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
    late_date: text("late_date"),
    tryout_1_date: text("tryout_1_date"),
    tryout_1_s1_time: text("tryout_1_s1_time"),
    tryout_1_s2_time: text("tryout_1_s2_time"),
    tryout_2_date: text("tryout_2_date"),
    tryout_2_s1_time: text("tryout_2_s1_time"),
    tryout_2_s2_time: text("tryout_2_s2_time"),
    tryout_2_s3_time: text("tryout_2_s3_time"),
    tryout_3_date: text("tryout_3_date"),
    tryout_3_s1_time: text("tryout_3_s1_time"),
    tryout_3_s2_time: text("tryout_3_s2_time"),
    tryout_3_s3_time: text("tryout_3_s3_time"),
    season_s1_time: text("season_s1_time"),
    season_s2_time: text("season_s2_time"),
    season_s3_time: text("season_s3_time"),
    season_1_date: text("season_1_date"),
    season_2_date: text("season_2_date"),
    season_3_date: text("season_3_date"),
    season_4_date: text("season_4_date"),
    season_5_date: text("season_5_date"),
    season_6_date: text("season_6_date"),
    playoff_1_date: text("playoff_1_date"),
    playoff_2_date: text("playoff_2_date"),
    playoff_3_date: text("playoff_3_date"),
    season_amount: text("season_amount"),
    late_amount: text("late_amount"),
    max_players: text("max_players")
})

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

export const signups = pgTable("signups", {
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
    dates_missing: text("dates_missing"),
    play_1st_week: boolean("play_1st_week"),
    order_id: text("order_id"),
    amount_paid: numeric("amount_paid"),
    created_at: timestamp("created_at").notNull()
})

export const teams = pgTable("teams", {
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
    name: text("name").notNull(),
    number: integer("number"),
    rank: integer("rank")
})

export const matchs = pgTable("matchs", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    division: integer("division")
        .notNull()
        .references(() => divisions.id),
    week: integer("week").notNull(),
    date: text("date"),
    time: text("time"),
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
})

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
    match_id: integer("match_id").references(() => matchs.id),
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

export const week1Rosters = pgTable("week1_rosters", {
    id: serial("id").primaryKey(),
    season: integer("season")
        .notNull()
        .references(() => seasons.id),
    user: text("user")
        .notNull()
        .references(() => users.id),
    session_number: integer("session_number").notNull(),
    court_number: integer("court_number").notNull()
})

export const week2Rosters = pgTable("week2_rosters", {
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
})

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

export const drafts = pgTable("drafts", {
    id: serial("id").primaryKey(),
    team: integer("team")
        .notNull()
        .references(() => teams.id),
    user: text("user")
        .notNull()
        .references(() => users.id),
    round: integer("round").notNull(),
    overall: integer("overall").notNull()
})

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
        overall: integer("overall"),
        passing: integer("passing"),
        setting: integer("setting"),
        hitting: integer("hitting"),
        serving: integer("serving"),
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

export const emailTemplates = pgTable("email_templates", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    subject: text("subject"),
    content: text("content").notNull(),
    created_at: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updated_at: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull()
})
