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
    emailSuppressions
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

    return rows
        .filter((r) => r.email)
        .map((r) => ({
            email: r.email,
            firstName: r.first_name ?? "",
            lastName: r.last_name ?? "",
            userId: r.id
        }))
}

async function getSeasonSignupRecipients(
    seasonId: number
): Promise<Recipient[]> {
    const rows = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name
        })
        .from(signups)
        .innerJoin(users, eq(signups.player, users.id))
        .where(eq(signups.season, seasonId))

    return rows
        .filter((r) => r.email)
        .map((r) => ({
            email: r.email,
            firstName: r.first_name ?? "",
            lastName: r.last_name ?? "",
            userId: r.id
        }))
}

async function getDivisionRecipients(
    seasonId: number,
    divisionId: number
): Promise<Recipient[]> {
    const rows = await db
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

    return rows
        .filter((r) => r.email)
        .map((r) => ({
            email: r.email,
            firstName: r.first_name ?? "",
            lastName: r.last_name ?? "",
            userId: r.id
        }))
}

async function getTeamRecipients(
    seasonId: number,
    teamId: number
): Promise<Recipient[]> {
    const rows = await db
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

    return rows
        .filter((r) => r.email)
        .map((r) => ({
            email: r.email,
            firstName: r.first_name ?? "",
            lastName: r.last_name ?? "",
            userId: r.id
        }))
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
