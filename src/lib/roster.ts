import "server-only"

import { db } from "@/database/db"
import {
    divisions,
    drafts,
    matchSubstitutions,
    matches,
    seasons,
    substitutions,
    teams,
    users
} from "@/database/schema"
import { and, asc, desc, eq, inArray } from "drizzle-orm"

export type PlayerSummary = {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
}

export type RosterSubLink = {
    substitutionId: number
    outUser: PlayerSummary
    inUser: PlayerSummary
    effectiveAt: Date
    reason: string | null
}

export type RosterEntry = {
    draftId: number
    teamId: number
    round: number
    overall: number
    originalUser: PlayerSummary
    chain: RosterSubLink[]
    activeUser: PlayerSummary
}

export type MatchSubEntry = {
    matchSubId: number
    matchId: number
    matchDate: string | null
    teamId: number
    originalUser: PlayerSummary
    subUser: PlayerSummary
    notes: string | null
}

function toSummary(u: {
    id: string
    firstName: string
    lastName: string
    preferredName: string | null
    male: boolean | null
}): PlayerSummary {
    return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        preferredName: u.preferredName,
        male: u.male
    }
}

/**
 * Returns one entry per draft slot for the season (or for a specific team when
 * teamId is provided). Each entry exposes the full chain of permanent subs in
 * effective_at ASC order, plus the currently-active player computed from the
 * end of that chain.
 *
 * Rosters in the rest of the app should consume this rather than querying
 * `drafts` and `substitutions` directly so the chain semantics stay consistent.
 */
export async function getTeamRosterWithSubs(
    seasonId: number,
    teamId?: number
): Promise<RosterEntry[]> {
    if (!Number.isInteger(seasonId) || seasonId <= 0) return []

    const draftRows = await (teamId !== undefined
        ? db
              .select({
                  draftId: drafts.id,
                  teamId: drafts.team,
                  round: drafts.round,
                  overall: drafts.overall,
                  userId: drafts.user,
                  firstName: users.first_name,
                  lastName: users.last_name,
                  preferredName: users.preferred_name,
                  male: users.male
              })
              .from(drafts)
              .innerJoin(users, eq(drafts.user, users.id))
              .innerJoin(teams, eq(drafts.team, teams.id))
              .where(and(eq(drafts.team, teamId), eq(teams.season, seasonId)))
              .orderBy(asc(drafts.round), asc(drafts.overall))
        : db
              .select({
                  draftId: drafts.id,
                  teamId: drafts.team,
                  round: drafts.round,
                  overall: drafts.overall,
                  userId: drafts.user,
                  firstName: users.first_name,
                  lastName: users.last_name,
                  preferredName: users.preferred_name,
                  male: users.male
              })
              .from(drafts)
              .innerJoin(users, eq(drafts.user, users.id))
              .innerJoin(teams, eq(drafts.team, teams.id))
              .where(eq(teams.season, seasonId))
              .orderBy(asc(drafts.round), asc(drafts.overall)))

    if (draftRows.length === 0) return []

    const draftIds = draftRows.map((r) => r.draftId)

    // Fetch chain links. Join users twice for out + in player names.
    const subRows = await db
        .select({
            id: substitutions.id,
            originalDraft: substitutions.original_draft,
            originalUser: substitutions.original_user,
            subUser: substitutions.sub_user,
            effectiveAt: substitutions.effective_at,
            reason: substitutions.reason
        })
        .from(substitutions)
        .where(inArray(substitutions.original_draft, draftIds))
        .orderBy(asc(substitutions.effective_at), asc(substitutions.id))

    // Collect every user id we'll need (originals + chain endpoints).
    const userIds = new Set<string>()
    for (const r of draftRows) userIds.add(r.userId)
    for (const s of subRows) {
        userIds.add(s.originalUser)
        userIds.add(s.subUser)
    }

    const userRows = userIds.size
        ? await db
              .select({
                  id: users.id,
                  firstName: users.first_name,
                  lastName: users.last_name,
                  preferredName: users.preferred_name,
                  male: users.male
              })
              .from(users)
              .where(inArray(users.id, Array.from(userIds)))
        : []

    const userMap = new Map(userRows.map((u) => [u.id, toSummary(u)]))

    const subsByDraftId = new Map<number, typeof subRows>()
    for (const s of subRows) {
        const arr = subsByDraftId.get(s.originalDraft) ?? []
        arr.push(s)
        subsByDraftId.set(s.originalDraft, arr)
    }

    return draftRows.map((d) => {
        const original =
            userMap.get(d.userId) ??
            toSummary({
                id: d.userId,
                firstName: d.firstName,
                lastName: d.lastName,
                preferredName: d.preferredName,
                male: d.male
            })
        const chainRaw = subsByDraftId.get(d.draftId) ?? []
        const chain: RosterSubLink[] = chainRaw.map((s) => ({
            substitutionId: s.id,
            outUser: userMap.get(s.originalUser) ?? {
                id: s.originalUser,
                firstName: "",
                lastName: "",
                preferredName: null,
                male: null
            },
            inUser: userMap.get(s.subUser) ?? {
                id: s.subUser,
                firstName: "",
                lastName: "",
                preferredName: null,
                male: null
            },
            effectiveAt: s.effectiveAt,
            reason: s.reason
        }))
        const activeUser =
            chain.length > 0 ? chain[chain.length - 1].inUser : original
        return {
            draftId: d.draftId,
            teamId: d.teamId,
            round: d.round,
            overall: d.overall,
            originalUser: original,
            chain,
            activeUser
        }
    })
}

/**
 * Resolve the currently-active player for a roster slot identified by the
 * "original" user id on a team. Follows the permanent-sub chain. Returns null
 * if no draft slot owned by that user exists on the team.
 *
 * Useful for actions that receive a UI-supplied "originalUserId" and need to
 * confirm it still maps to a live roster slot before mutating.
 */
export async function resolveActiveUserForSlot(
    teamId: number,
    originalUserId: string
): Promise<{ draftId: number; activeUserId: string } | null> {
    const [draftRow] = await db
        .select({ id: drafts.id })
        .from(drafts)
        .where(and(eq(drafts.team, teamId), eq(drafts.user, originalUserId)))
        .limit(1)
    if (!draftRow) return null

    const chain = await db
        .select({
            subUser: substitutions.sub_user,
            id: substitutions.id,
            effectiveAt: substitutions.effective_at
        })
        .from(substitutions)
        .where(eq(substitutions.original_draft, draftRow.id))
    if (chain.length === 0) {
        return { draftId: draftRow.id, activeUserId: originalUserId }
    }
    chain.sort((a, b) => {
        const t = b.effectiveAt.getTime() - a.effectiveAt.getTime()
        return t !== 0 ? t : b.id - a.id
    })
    return { draftId: draftRow.id, activeUserId: chain[0].subUser }
}

/**
 * Returns regular-sub records for a single match. Includes lookups for both
 * the original (subbed-out) and sub-in players so callers can render names
 * directly without a follow-up query.
 */
export async function getMatchSubsForMatch(
    matchId: number
): Promise<MatchSubEntry[]> {
    if (!Number.isInteger(matchId) || matchId <= 0) return []
    const rows = await db
        .select({
            id: matchSubstitutions.id,
            matchId: matchSubstitutions.match,
            matchDate: matches.date,
            teamId: matchSubstitutions.team,
            originalUser: matchSubstitutions.original_user,
            subUser: matchSubstitutions.sub_user,
            notes: matchSubstitutions.notes
        })
        .from(matchSubstitutions)
        .innerJoin(matches, eq(matchSubstitutions.match, matches.id))
        .where(eq(matchSubstitutions.match, matchId))

    if (rows.length === 0) return []

    const ids = new Set<string>()
    for (const r of rows) {
        ids.add(r.originalUser)
        ids.add(r.subUser)
    }
    const userRows = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male
        })
        .from(users)
        .where(inArray(users.id, Array.from(ids)))
    const userMap = new Map(userRows.map((u) => [u.id, toSummary(u)]))

    return rows.map((r) => ({
        matchSubId: r.id,
        matchId: r.matchId,
        matchDate: r.matchDate,
        teamId: r.teamId,
        originalUser: userMap.get(r.originalUser) ?? {
            id: r.originalUser,
            firstName: "",
            lastName: "",
            preferredName: null,
            male: null
        },
        subUser: userMap.get(r.subUser) ?? {
            id: r.subUser,
            firstName: "",
            lastName: "",
            preferredName: null,
            male: null
        },
        notes: r.notes
    }))
}

/**
 * Returns regular-sub records grouped by match id for a set of matches.
 * Useful when a page loads many matches at once (availability matrix).
 */
export async function getMatchSubsForTeamSeason(
    seasonId: number,
    teamId: number
): Promise<Map<number, MatchSubEntry[]>> {
    if (!Number.isInteger(seasonId) || seasonId <= 0) return new Map()
    if (!Number.isInteger(teamId) || teamId <= 0) return new Map()

    const rows = await db
        .select({
            id: matchSubstitutions.id,
            matchId: matchSubstitutions.match,
            matchDate: matches.date,
            teamId: matchSubstitutions.team,
            originalUser: matchSubstitutions.original_user,
            subUser: matchSubstitutions.sub_user,
            notes: matchSubstitutions.notes
        })
        .from(matchSubstitutions)
        .innerJoin(matches, eq(matchSubstitutions.match, matches.id))
        .where(
            and(
                eq(matchSubstitutions.season, seasonId),
                eq(matchSubstitutions.team, teamId)
            )
        )

    if (rows.length === 0) return new Map()

    const ids = new Set<string>()
    for (const r of rows) {
        ids.add(r.originalUser)
        ids.add(r.subUser)
    }
    const userRows = await db
        .select({
            id: users.id,
            firstName: users.first_name,
            lastName: users.last_name,
            preferredName: users.preferred_name,
            male: users.male
        })
        .from(users)
        .where(inArray(users.id, Array.from(ids)))
    const userMap = new Map(userRows.map((u) => [u.id, toSummary(u)]))

    const out = new Map<number, MatchSubEntry[]>()
    for (const r of rows) {
        const arr = out.get(r.matchId) ?? []
        arr.push({
            matchSubId: r.id,
            matchId: r.matchId,
            matchDate: r.matchDate,
            teamId: r.teamId,
            originalUser: userMap.get(r.originalUser) ?? {
                id: r.originalUser,
                firstName: "",
                lastName: "",
                preferredName: null,
                male: null
            },
            subUser: userMap.get(r.subUser) ?? {
                id: r.subUser,
                firstName: "",
                lastName: "",
                preferredName: null,
                male: null
            },
            notes: r.notes
        })
        out.set(r.matchId, arr)
    }
    return out
}

export function formatPlayerSummaryName(p: PlayerSummary): string {
    return p.preferredName
        ? `${p.preferredName} ${p.lastName}`
        : `${p.firstName} ${p.lastName}`
}

// ---------------------------------------------------------------------------
// Draft-history lookups shared by the signups views
// ---------------------------------------------------------------------------

export type LastDraftInfo = {
    seasonLabel: string
    seasonYear: number
    divisionName: string
    divisionLevel: number
    captainName: string
    overall: number
}

/**
 * Most recent draft placement per user across all seasons: season label,
 * division (with level for ordering), captain display name, and overall pick.
 */
export async function getLastDraftInfoByUser(
    userIds: string[]
): Promise<Map<string, LastDraftInfo>> {
    const map = new Map<string, LastDraftInfo>()
    if (userIds.length === 0) return map

    const draftData = await db
        .select({
            userId: drafts.user,
            overall: drafts.overall,
            seasonYear: seasons.year,
            seasonName: seasons.season,
            divisionName: divisions.name,
            divisionLevel: divisions.level,
            captainFirstName: users.first_name,
            captainLastName: users.last_name,
            captainPreferredName: users.preferred_name
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(seasons, eq(teams.season, seasons.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .innerJoin(users, eq(teams.captain, users.id))
        .where(inArray(drafts.user, userIds))
        .orderBy(desc(seasons.year), desc(seasons.id))

    for (const draft of draftData) {
        if (map.has(draft.userId)) continue
        const captainPreferred = draft.captainPreferredName
            ? ` (${draft.captainPreferredName})`
            : ""
        map.set(draft.userId, {
            seasonLabel: `${draft.seasonName.charAt(0).toUpperCase() + draft.seasonName.slice(1)} ${draft.seasonYear}`,
            seasonYear: draft.seasonYear,
            divisionName: draft.divisionName,
            divisionLevel: draft.divisionLevel,
            captainName: `${draft.captainFirstName}${captainPreferred} ${draft.captainLastName}`,
            overall: draft.overall
        })
    }
    return map
}

/**
 * Division each user is drafted into for the given season (name + level).
 */
export async function getCurrentDraftDivisions(
    seasonId: number,
    userIds: string[]
): Promise<Map<string, { divisionName: string; divisionLevel: number }>> {
    const map = new Map<
        string,
        { divisionName: string; divisionLevel: number }
    >()
    if (userIds.length === 0) return map

    const rows = await db
        .select({
            userId: drafts.user,
            divisionName: divisions.name,
            divisionLevel: divisions.level
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .innerJoin(divisions, eq(teams.division, divisions.id))
        .where(and(eq(teams.season, seasonId), inArray(drafts.user, userIds)))

    for (const row of rows) {
        map.set(row.userId, {
            divisionName: row.divisionName,
            divisionLevel: row.divisionLevel
        })
    }
    return map
}
