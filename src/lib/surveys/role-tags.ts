/**
 * role-tags.ts — the segments a survey respondent belongs to.
 *
 * Question visibility and the results breakdown both key off role tags, so one
 * pass computes them for a whole recipient list: every source is a single
 * batched query over the requested ids (chunked when the list is longer than
 * Postgres comfortably takes in one IN list), never a query per user.
 *
 * A season is the frame for most tags. With `seasonId === null` (a league-wide
 * survey) only the tags that mean something without one are computed: `admin`,
 * `leadership_group` and gender.
 *
 * Framework-independent: db + drizzle + lib only.
 */

import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { db } from "@/database/db"
import {
    drafts,
    individual_divisions,
    seasonRefs,
    seasons,
    signupDrops,
    signups,
    teams,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
    userRoles,
    users,
    waitlist
} from "@/database/schema"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import { seasonRecencyKey } from "@/lib/season-utils"
import {
    type RespondentSegments,
    type SurveyGender,
    type SurveyRoleTag,
    SURVEY_ROLE_TAGS
} from "./types"

/** Postgres handles far more, but chunking keeps one bad list from stalling. */
const ID_CHUNK_SIZE = 1000

/** Global (season-less) role rows worth tagging. "director" is the legacy admin. */
const GLOBAL_ROLES = ["admin", "director", "leadership_group"]

/**
 * Season-scoped role rows worth tagging. `tryout_volunteer` is deliberately
 * absent: that tag means an actual job assignment, not the role grant.
 */
const SEASON_ROLES = ["commissioner", "referee_coordinator"]

type Accumulator = {
    tags: Set<SurveyRoleTag>
    divisionId: number | null
    gender: SurveyGender | null
}

/**
 * Role tags, division and gender for each of `userIds`.
 *
 * Every requested id gets an entry, even one that matches nothing (empty tags)
 * and even the ghost captain placeholder, which is never tagged.
 */
export async function computeRecipientSegments(
    seasonId: number | null,
    userIds: string[]
): Promise<Map<string, RespondentSegments>> {
    const requested = [...new Set(userIds)]
    const acc = new Map<string, Accumulator>()
    for (const id of requested) {
        acc.set(id, { tags: new Set(), divisionId: null, gender: null })
    }
    if (requested.length === 0) return toResult(acc)

    // The ghost captain is a placeholder account that stands in for an unfilled
    // captain slot; it holds no roles and answers no surveys.
    const ids = requested.filter((id) => id !== GHOST_CAPTAIN_ID)
    if (ids.length === 0) return toResult(acc)

    await applyGender(acc, ids)
    await applyGlobalRoles(acc, ids)

    if (seasonId !== null) {
        await applySeasonSources(acc, seasonId, ids)
        await applyHistory(acc, seasonId, ids)
    }

    return toResult(acc)
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

async function applyGender(acc: Map<string, Accumulator>, ids: string[]) {
    const rows = await collect(ids, (chunk) =>
        db
            .select({ id: users.id, male: users.male })
            .from(users)
            .where(inArray(users.id, chunk))
    )
    for (const row of rows) {
        const entry = acc.get(row.id)
        if (!entry || row.male === null) continue
        entry.gender = row.male ? "male" : "non_male"
    }
}

async function applyGlobalRoles(acc: Map<string, Accumulator>, ids: string[]) {
    const rows = await collect(ids, (chunk) =>
        db
            .select({ userId: userRoles.user_id, role: userRoles.role })
            .from(userRoles)
            .where(
                and(
                    isNull(userRoles.season_id),
                    inArray(userRoles.role, GLOBAL_ROLES),
                    inArray(userRoles.user_id, chunk)
                )
            )
    )
    for (const row of rows) {
        tag(
            acc,
            row.userId,
            row.role === "leadership_group" ? "leadership_group" : "admin"
        )
    }
}

async function applySeasonSources(
    acc: Map<string, Accumulator>,
    seasonId: number,
    ids: string[]
) {
    // signed_up
    const signupRows = await collect(ids, (chunk) =>
        db
            .select({ player: signups.player })
            .from(signups)
            .where(
                and(
                    eq(signups.season, seasonId),
                    inArray(signups.player, chunk)
                )
            )
    )
    for (const row of signupRows) tag(acc, row.player, "signed_up")

    // rostered + the authoritative division
    const draftRows = await collect(ids, (chunk) =>
        db
            .select({ user: drafts.user, division: teams.division })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .where(and(eq(teams.season, seasonId), inArray(drafts.user, chunk)))
    )
    for (const row of draftRows) {
        tag(acc, row.user, "rostered")
        const entry = acc.get(row.user)
        if (entry) entry.divisionId = row.division
    }

    // captain / coach — which one depends on the division's coaches flag
    const teamRows = await collect(ids, (chunk) =>
        db
            .select({
                captain: teams.captain,
                captain2: teams.captain2,
                division: teams.division
            })
            .from(teams)
            .where(
                and(
                    eq(teams.season, seasonId),
                    or(
                        inArray(teams.captain, chunk),
                        inArray(teams.captain2, chunk)
                    )
                )
            )
    )
    const coachDivisions = new Set(
        (
            await db
                .select({
                    division: individual_divisions.division,
                    coaches: individual_divisions.coaches
                })
                .from(individual_divisions)
                .where(eq(individual_divisions.season, seasonId))
        )
            .filter((row) => row.coaches)
            .map((row) => row.division)
    )
    for (const row of teamRows) {
        // A division with no individual_divisions row is not in coaches mode.
        const tagName: SurveyRoleTag = coachDivisions.has(row.division)
            ? "coach"
            : "captain"
        for (const head of [row.captain, row.captain2]) {
            if (!head) continue
            const entry = acc.get(head)
            if (!entry) continue
            entry.tags.add(tagName)
            // Only the drafts row outranks the team a captain heads.
            if (entry.divisionId === null) entry.divisionId = row.division
        }
    }

    // commissioner / ref_coordinator
    const roleRows = await collect(ids, (chunk) =>
        db
            .select({
                userId: userRoles.user_id,
                role: userRoles.role,
                divisionId: userRoles.division_id
            })
            .from(userRoles)
            .where(
                and(
                    eq(userRoles.season_id, seasonId),
                    inArray(userRoles.role, SEASON_ROLES),
                    inArray(userRoles.user_id, chunk)
                )
            )
    )
    for (const row of roleRows) {
        const entry = acc.get(row.userId)
        if (!entry) continue
        if (row.role === "commissioner") {
            entry.tags.add("commissioner")
            // A division-scoped commissioner who is not otherwise placed.
            if (entry.divisionId === null && row.divisionId !== null) {
                entry.divisionId = row.divisionId
            }
        } else {
            entry.tags.add("ref_coordinator")
        }
    }

    // tryout_volunteer — an actual job assignment for one of the season's
    // tryout nights, not the role grant (which only opens the scheduling UI).
    const volunteerRows = await collect(ids, (chunk) =>
        db
            .select({ userId: tryoutVolunteerAssignments.user_id })
            .from(tryoutVolunteerAssignments)
            .innerJoin(
                tryoutVolunteerJobs,
                eq(tryoutVolunteerJobs.id, tryoutVolunteerAssignments.job_id)
            )
            .where(
                and(
                    eq(tryoutVolunteerJobs.season_id, seasonId),
                    inArray(tryoutVolunteerAssignments.user_id, chunk)
                )
            )
    )
    for (const row of volunteerRows) tag(acc, row.userId, "tryout_volunteer")

    // referee
    const refRows = await collect(ids, (chunk) =>
        db
            .select({ userId: seasonRefs.user_id })
            .from(seasonRefs)
            .where(
                and(
                    eq(seasonRefs.season_id, seasonId),
                    eq(seasonRefs.is_active, true),
                    inArray(seasonRefs.user_id, chunk)
                )
            )
    )
    for (const row of refRows) tag(acc, row.userId, "referee")

    // waitlisted
    const waitlistRows = await collect(ids, (chunk) =>
        db
            .select({ user: waitlist.user })
            .from(waitlist)
            .where(
                and(
                    eq(waitlist.season, seasonId),
                    inArray(waitlist.user, chunk)
                )
            )
    )
    for (const row of waitlistRows) tag(acc, row.user, "waitlisted")

    // dropped — a restored drop no longer counts
    const dropRows = await collect(ids, (chunk) =>
        db
            .select({ player: signupDrops.player })
            .from(signupDrops)
            .where(
                and(
                    eq(signupDrops.season, seasonId),
                    isNull(signupDrops.restored_at),
                    inArray(signupDrops.player, chunk)
                )
            )
    )
    for (const row of dropRows) tag(acc, row.player, "dropped")
}

/**
 * first_season / returning. A player's history is every season they signed up
 * for, were drafted into, or dropped out of; the tags compare its earliest
 * season to this one. No history at all means neither tag.
 *
 * Drops have to count: a pre-draft drop deletes the signups row (it is archived
 * into signup_drops), so without them a player who quit before the draft would
 * look like they had never played that season at all.
 */
async function applyHistory(
    acc: Map<string, Accumulator>,
    seasonId: number,
    ids: string[]
) {
    const [current] = await db
        .select({ year: seasons.year, season: seasons.season })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
    if (!current) return
    const currentKey = seasonRecencyKey(current.year, current.season)

    const signupHistory = await collect(ids, (chunk) =>
        db
            .select({
                user: signups.player,
                year: seasons.year,
                season: seasons.season
            })
            .from(signups)
            .innerJoin(seasons, eq(signups.season, seasons.id))
            .where(inArray(signups.player, chunk))
    )
    const draftHistory = await collect(ids, (chunk) =>
        db
            .select({
                user: drafts.user,
                year: seasons.year,
                season: seasons.season
            })
            .from(drafts)
            .innerJoin(teams, eq(drafts.team, teams.id))
            .innerJoin(seasons, eq(teams.season, seasons.id))
            .where(inArray(drafts.user, chunk))
    )

    const dropHistory = await collect(ids, (chunk) =>
        db
            .select({
                user: signupDrops.player,
                year: seasons.year,
                season: seasons.season
            })
            .from(signupDrops)
            .innerJoin(seasons, eq(signupDrops.season, seasons.id))
            .where(inArray(signupDrops.player, chunk))
    )

    const earliest = new Map<string, number>()
    const hasEarlier = new Set<string>()
    for (const row of [...signupHistory, ...draftHistory, ...dropHistory]) {
        const key = seasonRecencyKey(row.year, row.season)
        const known = earliest.get(row.user)
        if (known === undefined || key < known) earliest.set(row.user, key)
        if (key < currentKey) hasEarlier.add(row.user)
    }

    for (const [userId, key] of earliest) {
        if (hasEarlier.has(userId)) tag(acc, userId, "returning")
        else if (key === currentKey) tag(acc, userId, "first_season")
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tag(
    acc: Map<string, Accumulator>,
    userId: string,
    name: SurveyRoleTag
): void {
    acc.get(userId)?.tags.add(name)
}

/** Runs `query` once per id chunk and concatenates the rows. */
async function collect<Row>(
    ids: string[],
    query: (chunk: string[]) => Promise<Row[]>
): Promise<Row[]> {
    if (ids.length <= ID_CHUNK_SIZE) return query(ids)
    const rows: Row[] = []
    for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
        rows.push(...(await query(ids.slice(i, i + ID_CHUNK_SIZE))))
    }
    return rows
}

/** Freezes the accumulator into tags ordered by SURVEY_ROLE_TAGS. */
function toResult(
    acc: Map<string, Accumulator>
): Map<string, RespondentSegments> {
    const result = new Map<string, RespondentSegments>()
    for (const [userId, entry] of acc) {
        result.set(userId, {
            roleTags: SURVEY_ROLE_TAGS.filter((t) => entry.tags.has(t)),
            divisionId: entry.divisionId,
            gender: entry.gender
        })
    }
    return result
}
