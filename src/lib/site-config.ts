import { db } from "@/database/db"
import { siteConfig } from "@/database/schema"
import { eq, inArray } from "drizzle-orm"

export interface SeasonConfig {
    seasonAmount: string
    lateAmount: string
    lateDate: string
    maxPlayers: string
    seasonYear: number
    seasonName: string
    registrationOpen: boolean
    tryout1Date: string
    tryout2Date: string
    tryout3Date: string
    season1Date: string
    season2Date: string
    season3Date: string
    season4Date: string
    season5Date: string
    season6Date: string
    playoff1Date: string
    playoff2Date: string
    playoff3Date: string
}

export async function getSeasonConfig(): Promise<SeasonConfig> {
    const rows = await db
        .select()
        .from(siteConfig)
        .where(
            inArray(siteConfig.key, [
                "season_amount",
                "late_amount",
                "late_date",
                "max_players",
                "season_year",
                "season_name",
                "registration_open",
                "tryout_1_date",
                "tryout_2_date",
                "tryout_3_date",
                "season_1_date",
                "season_2_date",
                "season_3_date",
                "season_4_date",
                "season_5_date",
                "season_6_date",
                "playoff_1_date",
                "playoff_2_date",
                "playoff_3_date"
            ])
        )

    const configMap = new Map<string, string>(
        rows.map((row: { key: string; value: string }) => [row.key, row.value])
    )

    return {
        seasonAmount: configMap.get("season_amount") || "",
        lateAmount: configMap.get("late_amount") || "",
        lateDate: configMap.get("late_date") || "",
        maxPlayers: configMap.get("max_players") || "",
        seasonYear: parseInt(configMap.get("season_year") || "", 10),
        seasonName: configMap.get("season_name") || "",
        registrationOpen: configMap.get("registration_open") === "true",
        tryout1Date: configMap.get("tryout_1_date") || "",
        tryout2Date: configMap.get("tryout_2_date") || "",
        tryout3Date: configMap.get("tryout_3_date") || "",
        season1Date: configMap.get("season_1_date") || "",
        season2Date: configMap.get("season_2_date") || "",
        season3Date: configMap.get("season_3_date") || "",
        season4Date: configMap.get("season_4_date") || "",
        season5Date: configMap.get("season_5_date") || "",
        season6Date: configMap.get("season_6_date") || "",
        playoff1Date: configMap.get("playoff_1_date") || "",
        playoff2Date: configMap.get("playoff_2_date") || "",
        playoff3Date: configMap.get("playoff_3_date") || ""
    }
}

export function getCurrentSeasonAmount(config: SeasonConfig): string {
    if (config.lateDate && config.lateAmount) {
        const now = new Date()
        const lateDate = new Date(config.lateDate)
        if (now >= lateDate) {
            return config.lateAmount
        }
    }
    return config.seasonAmount
}

export function isLatePricing(config: SeasonConfig): boolean {
    if (config.lateDate && config.lateAmount) {
        return new Date() >= new Date(config.lateDate)
    }
    return false
}

export async function getConfigValue(key: string): Promise<string | null> {
    const [row] = await db
        .select()
        .from(siteConfig)
        .where(eq(siteConfig.key, key))
        .limit(1)

    return row?.value || null
}

export async function checkSignupEligibility(userId: string): Promise<boolean> {
    const { seasons, signups } = await import("@/database/schema")
    const { and, count } = await import("drizzle-orm")

    const config = await getSeasonConfig()

    // If registration is closed, not eligible
    if (!config.registrationOpen) {
        return false
    }

    // Look up the current season
    const [season] = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(
            and(
                eq(seasons.year, config.seasonYear),
                eq(seasons.season, config.seasonName)
            )
        )
        .limit(1)

    if (!season) {
        return false
    }

    // Check if user already has a signup for this season
    const [existingSignup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(and(eq(signups.season, season.id), eq(signups.player, userId)))
        .limit(1)

    if (existingSignup) {
        return false
    }

    // Check if season is full
    const maxPlayers = parseInt(config.maxPlayers, 10)
    if (maxPlayers > 0) {
        const [result] = await db
            .select({ total: count() })
            .from(signups)
            .where(eq(signups.season, season.id))

        if (result && result.total >= maxPlayers) {
            return false
        }
    }

    return true
}
