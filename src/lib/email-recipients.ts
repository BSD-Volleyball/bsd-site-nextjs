/**
 * email-recipients.ts — Local recipient-group management for broadcast emails.
 *
 * Recipient groups are stored entirely in our DB. When sending, recipients are
 * queried live from the users/signups/drafts/teams tables — no third-party
 * contact sync needed.
 */

import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    teams,
    divisions,
    seasons,
    emailRecipientGroups,
    emailSuppressions,
    userRoles
} from "@/database/schema"
import { eq, and, inArray, isNotNull } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecipientGroupType =
    | "all_users"
    | "season_signups"
    | "season_division"
    | "season_team"

export interface Recipient {
    email: string
    firstName: string
    lastName: string
    userId: string
}

interface EnsureGroupOptions {
    name: string
    seasonId?: number
    divisionId?: number
    teamId?: number
}

// ---------------------------------------------------------------------------
// Ensure recipient group exists (local DB only, idempotent)
// ---------------------------------------------------------------------------

export async function ensureRecipientGroup(
    type: RecipientGroupType,
    opts: EnsureGroupOptions
): Promise<number> {
    const seasonId = opts.seasonId ?? null
    const divisionId = opts.divisionId ?? null
    const teamId = opts.teamId ?? null

    // Check if group already exists
    const existing = await db
        .select({ id: emailRecipientGroups.id })
        .from(emailRecipientGroups)
        .where(
            and(
                eq(emailRecipientGroups.group_type, type),
                seasonId
                    ? eq(emailRecipientGroups.season_id, seasonId)
                    : eq(emailRecipientGroups.season_id, seasonId as never),
                divisionId
                    ? eq(emailRecipientGroups.division_id, divisionId)
                    : eq(emailRecipientGroups.division_id, divisionId as never),
                teamId
                    ? eq(emailRecipientGroups.team_id, teamId)
                    : eq(emailRecipientGroups.team_id, teamId as never)
            )
        )
        .limit(1)

    if (existing.length > 0) {
        return existing[0].id
    }

    const [row] = await db
        .insert(emailRecipientGroups)
        .values({
            name: opts.name,
            group_type: type,
            season_id: seasonId,
            division_id: divisionId,
            team_id: teamId
        })
        .returning({ id: emailRecipientGroups.id })

    return row.id
}

// ---------------------------------------------------------------------------
// Query recipients for a group (live from DB)
// ---------------------------------------------------------------------------

export async function getRecipientsForGroup(
    groupId: number
): Promise<Recipient[]> {
    const [group] = await db
        .select()
        .from(emailRecipientGroups)
        .where(eq(emailRecipientGroups.id, groupId))
        .limit(1)

    if (!group) return []

    switch (group.group_type) {
        case "all_users":
            return getAllUserRecipients()
        case "season_signups":
            return group.season_id
                ? getSeasonSignupRecipients(group.season_id)
                : []
        case "season_division":
            return group.season_id && group.division_id
                ? getDivisionRecipients(group.season_id, group.division_id)
                : []
        case "season_team":
            return group.season_id && group.team_id
                ? getTeamRecipients(group.season_id, group.team_id)
                : []
        default:
            return []
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type UserRow = {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
}

function toRecipient(r: UserRow): Recipient | null {
    if (!r.email) return null
    return {
        email: r.email,
        firstName: r.first_name ?? "",
        lastName: r.last_name ?? "",
        userId: r.id
    }
}

function deduplicateRecipients(recipients: Recipient[]): Recipient[] {
    const seen = new Map<string, Recipient>()
    for (const r of recipients) {
        if (!seen.has(r.userId)) seen.set(r.userId, r)
    }
    return Array.from(seen.values())
}

async function getUsersByIds(ids: string[]): Promise<Recipient[]> {
    if (ids.length === 0) return []
    const rows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(users)
        .where(inArray(users.id, ids))
    return rows.map(toRecipient).filter(Boolean) as Recipient[]
}

async function getAllUserRecipients(): Promise<Recipient[]> {
    const rows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(users)
        .where(isNotNull(users.email))
    return rows.map(toRecipient).filter(Boolean) as Recipient[]
}

/**
 * Season signups: signed-up players + admins/directors (global) +
 * commissioners for this season + team captains/coaches for this season.
 */
async function getSeasonSignupRecipients(
    seasonId: number
): Promise<Recipient[]> {
    // 1. Players signed up for this season
    const signupRows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(signups)
        .innerJoin(users, eq(signups.player, users.id))
        .where(eq(signups.season, seasonId))

    // 2. Admins and directors (global roles, no season restriction)
    const adminRows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(inArray(userRoles.role, ["admin", "director"]))

    // 3. Commissioners assigned to this season
    const commRows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(
            and(
                eq(userRoles.role, "commissioner"),
                eq(userRoles.season_id, seasonId)
            )
        )

    // 4. Team captains/coaches for this season
    const teamRows = await db
        .select({ captain: teams.captain, captain2: teams.captain2 })
        .from(teams)
        .where(eq(teams.season, seasonId))

    const captainIds = [
        ...new Set([
            ...teamRows.map((t) => t.captain),
            ...teamRows
                .filter((t) => t.captain2)
                .map((t) => t.captain2 as string)
        ])
    ]
    const captainRows = await getUsersByIds(captainIds)

    return deduplicateRecipients(
        [
            ...signupRows.map(toRecipient),
            ...adminRows.map(toRecipient),
            ...commRows.map(toRecipient),
            ...captainRows
        ].filter(Boolean) as Recipient[]
    )
}

/**
 * Division recipients: drafted players in that division + commissioners
 * scoped to that division + team captains/coaches in that division.
 */
async function getDivisionRecipients(
    seasonId: number,
    divisionId: number
): Promise<Recipient[]> {
    // 1. Players drafted onto teams in this division
    const draftRows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(users, eq(drafts.user, users.id))
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))

    // 2. Commissioners scoped to this division
    const commRows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(
            and(
                eq(userRoles.role, "commissioner"),
                eq(userRoles.season_id, seasonId),
                eq(userRoles.division_id, divisionId)
            )
        )

    // 3. Team captains/coaches in this division
    const teamRows = await db
        .select({ captain: teams.captain, captain2: teams.captain2 })
        .from(teams)
        .where(and(eq(teams.season, seasonId), eq(teams.division, divisionId)))

    const captainIds = [
        ...new Set([
            ...teamRows.map((t) => t.captain),
            ...teamRows
                .filter((t) => t.captain2)
                .map((t) => t.captain2 as string)
        ])
    ]
    const captainRows = await getUsersByIds(captainIds)

    return deduplicateRecipients(
        [
            ...draftRows.map(toRecipient),
            ...commRows.map(toRecipient),
            ...captainRows
        ].filter(Boolean) as Recipient[]
    )
}

/**
 * Team recipients: players on the team (from drafts) + team captains/coaches.
 */
async function getTeamRecipients(
    seasonId: number,
    teamId: number
): Promise<Recipient[]> {
    // 1. Drafted players on this team
    const draftRows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(users, eq(drafts.user, users.id))
        .where(and(eq(teams.season, seasonId), eq(drafts.team, teamId)))

    // 2. Team captains/coaches
    const [teamRow] = await db
        .select({ captain: teams.captain, captain2: teams.captain2 })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1)

    const captainIds = teamRow
        ? [teamRow.captain, ...(teamRow.captain2 ? [teamRow.captain2] : [])]
        : []
    const captainRows = await getUsersByIds(captainIds)

    return deduplicateRecipients(
        [...draftRows.map(toRecipient), ...captainRows].filter(
            Boolean
        ) as Recipient[]
    )
}

// ---------------------------------------------------------------------------
// Filter out suppressed recipients for a given stream
// ---------------------------------------------------------------------------

export async function filterSuppressed(
    recipients: Recipient[],
    streamId: string
): Promise<Recipient[]> {
    if (recipients.length === 0) return []

    const emails = recipients.map((r) => r.email.toLowerCase())
    const suppressedRows = await db
        .select({ email: emailSuppressions.email })
        .from(emailSuppressions)
        .where(
            and(
                inArray(emailSuppressions.email, emails),
                eq(emailSuppressions.stream_id, streamId)
            )
        )

    const suppressedSet = new Set(
        suppressedRows.map((r) => r.email.toLowerCase())
    )
    return recipients.filter((r) => !suppressedSet.has(r.email.toLowerCase()))
}

// ---------------------------------------------------------------------------
// Ensure team/division recipient groups (called from draft/lifecycle actions)
// ---------------------------------------------------------------------------

function buildSeasonLabel(year: number, season: string): string {
    return `${season.charAt(0).toUpperCase() + season.slice(1)} ${year}`
}

export async function ensureTeamRecipientGroup(
    teamId: number,
    seasonId: number
): Promise<void> {
    try {
        const [teamRow] = await db
            .select({
                name: teams.name,
                divisionId: teams.division
            })
            .from(teams)
            .where(eq(teams.id, teamId))
            .limit(1)

        if (!teamRow) return

        const [seasonRow] = await db
            .select({ year: seasons.year, season: seasons.season })
            .from(seasons)
            .where(eq(seasons.id, seasonId))
            .limit(1)

        if (!seasonRow) return
        const seasonLabel = buildSeasonLabel(seasonRow.year, seasonRow.season)

        // Ensure season signups group
        await ensureRecipientGroup("season_signups", {
            seasonId,
            name: `${seasonLabel} - All Signups`
        })

        // Ensure division group
        const [divisionRow] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, teamRow.divisionId))
            .limit(1)

        if (divisionRow) {
            await ensureRecipientGroup("season_division", {
                seasonId,
                divisionId: teamRow.divisionId,
                name: `${seasonLabel} - ${divisionRow.name}`
            })
        }

        // Ensure team group
        await ensureRecipientGroup("season_team", {
            seasonId,
            teamId,
            name: `${seasonLabel} - Team ${teamRow.name}`
        })
    } catch (err) {
        console.error(
            "[email-recipients] ensureTeamRecipientGroup error",
            teamId,
            err
        )
    }
}

// ---------------------------------------------------------------------------
// Cleanup season groups when season completes
// ---------------------------------------------------------------------------

export async function cleanupSeasonRecipientGroups(
    seasonId: number
): Promise<void> {
    try {
        await db
            .delete(emailRecipientGroups)
            .where(
                and(
                    eq(emailRecipientGroups.season_id, seasonId),
                    inArray(emailRecipientGroups.group_type, [
                        "season_division",
                        "season_team"
                    ])
                )
            )
        console.log(
            `[email-recipients] Cleaned up division/team groups for season ${seasonId}`
        )
    } catch (err) {
        console.error(
            "[email-recipients] cleanupSeasonRecipientGroups error",
            seasonId,
            err
        )
    }
}
