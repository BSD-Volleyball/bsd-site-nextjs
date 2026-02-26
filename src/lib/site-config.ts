import { db } from "@/database/db"
import { seasons, signups, waitlist } from "@/database/schema"
import { eq, desc, count, and } from "drizzle-orm"

export interface SeasonConfig {
    seasonId: number
    seasonAmount: string
    lateAmount: string
    lateDate: string
    maxPlayers: string
    seasonYear: number
    seasonName: string
    registrationOpen: boolean
    tryout1Date: string
    tryout1Session1Time: string
    tryout1Session2Time: string
    tryout2Date: string
    tryout2Session1Time: string
    tryout2Session2Time: string
    tryout2Session3Time: string
    tryout3Date: string
    tryout3Session1Time: string
    tryout3Session2Time: string
    tryout3Session3Time: string
    seasonSession1Time: string
    seasonSession2Time: string
    seasonSession3Time: string
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
    const [season] = await db
        .select()
        .from(seasons)
        .orderBy(desc(seasons.id))
        .limit(1)

    if (!season) {
        return {
            seasonId: 0,
            seasonAmount: "",
            lateAmount: "",
            lateDate: "",
            maxPlayers: "",
            seasonYear: 0,
            seasonName: "",
            registrationOpen: false,
            tryout1Date: "",
            tryout1Session1Time: "",
            tryout1Session2Time: "",
            tryout2Date: "",
            tryout2Session1Time: "",
            tryout2Session2Time: "",
            tryout2Session3Time: "",
            tryout3Date: "",
            tryout3Session1Time: "",
            tryout3Session2Time: "",
            tryout3Session3Time: "",
            seasonSession1Time: "",
            seasonSession2Time: "",
            seasonSession3Time: "",
            season1Date: "",
            season2Date: "",
            season3Date: "",
            season4Date: "",
            season5Date: "",
            season6Date: "",
            playoff1Date: "",
            playoff2Date: "",
            playoff3Date: ""
        }
    }

    return {
        seasonId: season.id,
        seasonAmount: season.season_amount || "",
        lateAmount: season.late_amount || "",
        lateDate: season.late_date || "",
        maxPlayers: season.max_players || "",
        seasonYear: season.year,
        seasonName: season.season,
        registrationOpen: season.registration_open,
        tryout1Date: season.tryout_1_date || "",
        tryout1Session1Time: season.tryout_1_s1_time || "",
        tryout1Session2Time: season.tryout_1_s2_time || "",
        tryout2Date: season.tryout_2_date || "",
        tryout2Session1Time: season.tryout_2_s1_time || "",
        tryout2Session2Time: season.tryout_2_s2_time || "",
        tryout2Session3Time: season.tryout_2_s3_time || "",
        tryout3Date: season.tryout_3_date || "",
        tryout3Session1Time: season.tryout_3_s1_time || "",
        tryout3Session2Time: season.tryout_3_s2_time || "",
        tryout3Session3Time: season.tryout_3_s3_time || "",
        seasonSession1Time: season.season_s1_time || "",
        seasonSession2Time: season.season_s2_time || "",
        seasonSession3Time: season.season_s3_time || "",
        season1Date: season.season_1_date || "",
        season2Date: season.season_2_date || "",
        season3Date: season.season_3_date || "",
        season4Date: season.season_4_date || "",
        season5Date: season.season_5_date || "",
        season6Date: season.season_6_date || "",
        playoff1Date: season.playoff_1_date || "",
        playoff2Date: season.playoff_2_date || "",
        playoff3Date: season.playoff_3_date || ""
    }
}

function isPastLateDateET(lateDate: string): boolean {
    const nowET = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
    )
    const target = new Date(lateDate)
    return nowET >= target
}

export function getCurrentSeasonAmount(config: SeasonConfig): string {
    if (config.lateDate && config.lateAmount) {
        if (isPastLateDateET(config.lateDate)) {
            return config.lateAmount
        }
    }
    return config.seasonAmount
}

export function isLatePricing(config: SeasonConfig): boolean {
    if (config.lateDate && config.lateAmount) {
        return isPastLateDateET(config.lateDate)
    }
    return false
}

export async function checkSignupEligibility(userId: string): Promise<boolean> {
    const config = await getSeasonConfig()

    if (!config.registrationOpen || !config.seasonId) {
        return false
    }

    // Check if user already has a signup for this season
    const [existingSignup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(
            and(eq(signups.season, config.seasonId), eq(signups.player, userId))
        )
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
            .where(eq(signups.season, config.seasonId))

        if (result && result.total >= maxPlayers) {
            const [waitlistEntry] = await db
                .select({ approved: waitlist.approved })
                .from(waitlist)
                .where(
                    and(
                        eq(waitlist.season, config.seasonId),
                        eq(waitlist.user, userId)
                    )
                )
                .limit(1)

            return waitlistEntry?.approved ?? false
        }
    }

    return true
}
