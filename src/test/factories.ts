import { db } from "@/database/db"
import {
    discounts,
    divisions,
    eventTimeSlots,
    matches,
    seasonEvents,
    seasons,
    signups,
    teams,
    waivers,
    waitlist
} from "@/database/schema"

// Plain insert builders for integration tests. Each takes Partial overrides
// and returns the inserted row. getSeasonConfig() resolves the season with
// the highest id, so the most recently created season is always "current".

export async function createSeason(
    overrides: Partial<typeof seasons.$inferInsert> = {}
) {
    const [row] = await db
        .insert(seasons)
        .values({
            code: "TST",
            year: 2026,
            season: "fall",
            phase: "registration_open",
            season_amount: "100.00",
            late_amount: "120.00",
            max_players: 0,
            ...overrides
        })
        .returning()
    return row
}

export async function createSeasonEvent(
    seasonId: number,
    overrides: Partial<typeof seasonEvents.$inferInsert> = {}
) {
    const [row] = await db
        .insert(seasonEvents)
        .values({
            season_id: seasonId,
            event_type: "tryout",
            event_date: "2026-09-05",
            sort_order: 0,
            ...overrides
        })
        .returning()
    return row
}

export async function createEventTimeSlot(
    eventId: number,
    overrides: Partial<typeof eventTimeSlots.$inferInsert> = {}
) {
    const [row] = await db
        .insert(eventTimeSlots)
        .values({
            event_id: eventId,
            start_time: "18:00",
            sort_order: 0,
            ...overrides
        })
        .returning()
    return row
}

export async function createDivision(
    overrides: Partial<typeof divisions.$inferInsert> = {}
) {
    const [row] = await db
        .insert(divisions)
        .values({ name: "Test Division", level: 1, ...overrides })
        .returning()
    return row
}

export async function createTeam(
    values: Pick<typeof teams.$inferInsert, "season" | "captain" | "division"> &
        Partial<typeof teams.$inferInsert>
) {
    const [row] = await db
        .insert(teams)
        .values({ name: "Test Team", ...values })
        .returning()
    return row
}

export async function createSignup(
    values: Pick<typeof signups.$inferInsert, "season" | "player"> &
        Partial<typeof signups.$inferInsert>
) {
    const [row] = await db
        .insert(signups)
        .values({ created_at: new Date(), ...values })
        .returning()
    return row
}

export async function createMatch(
    values: Pick<typeof matches.$inferInsert, "season" | "division"> &
        Partial<typeof matches.$inferInsert>
) {
    const [row] = await db
        .insert(matches)
        .values({ week: 1, ...values })
        .returning()
    return row
}

export async function createWaiver(
    overrides: Partial<typeof waivers.$inferInsert> = {}
) {
    const [row] = await db
        .insert(waivers)
        .values({ content: "Test waiver content", active: true, ...overrides })
        .returning()
    return row
}

export async function createDiscount(
    values: Pick<typeof discounts.$inferInsert, "user"> &
        Partial<typeof discounts.$inferInsert>
) {
    const [row] = await db
        .insert(discounts)
        .values({ percentage: "100", scope: "season", ...values })
        .returning()
    return row
}

export async function addToWaitlist(
    values: Pick<typeof waitlist.$inferInsert, "season" | "user"> &
        Partial<typeof waitlist.$inferInsert>
) {
    const [row] = await db
        .insert(waitlist)
        .values({ created_at: new Date(), ...values })
        .returning()
    return row
}

/**
 * The baseline most integration tests need: a current season (registration
 * open), one division, and a tryout event with a time slot.
 */
export async function seedBaselineSeason() {
    const season = await createSeason()
    const division = await createDivision()
    const tryoutEvent = await createSeasonEvent(season.id)
    const tryoutSlot = await createEventTimeSlot(tryoutEvent.id)
    return { season, division, tryoutEvent, tryoutSlot }
}
