/**
 * resend-sync.ts — Core Resend Contacts/Segments/Topics sync library.
 *
 * All public functions are fire-and-forget safe: they never throw to callers.
 * Failures are logged to console but do not block user-facing operations.
 *
 * Resend SDK v6 API notes:
 * - resend.contacts.get(id: string)
 * - resend.contacts.create({ email, firstName?, lastName?, unsubscribed? })
 * - resend.contacts.update({ id, firstName?, lastName?, unsubscribed? })
 * - resend.contacts.remove(id: string)
 * - resend.contacts.segments.add({ contactId, segmentId })
 * - resend.segments.create({ name })
 * - resend.segments.remove(id: string)
 * - resend.topics.create({ name, defaultSubscription })
 *
 * Email addresses cannot be changed on existing Resend contacts — must delete + recreate.
 */

import { resend } from "@/lib/resend"
import { db } from "@/database/db"
import {
    users,
    signups,
    drafts,
    teams,
    divisions,
    seasons,
    resendSegments,
    resendTopics
} from "@/database/schema"
import { eq, and, inArray, isNull } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserForSync {
    id: string
    email: string
    first_name: string
    last_name: string
    unsubscribed: boolean
    resend_contact_id: string | null
}

type SegmentType =
    | "all_users"
    | "season_signups"
    | "season_division"
    | "season_team"

// ---------------------------------------------------------------------------
// Contact upsert
// ---------------------------------------------------------------------------

/**
 * Creates or updates a Resend contact for the given user.
 * Handles email changes by deleting the old contact and creating a new one.
 * Updates users.resend_contact_id in the DB on first creation.
 * Returns the Resend contact ID on success, or null on failure.
 */
export async function upsertContact(user: UserForSync): Promise<string | null> {
    try {
        let currentUser = user

        if (currentUser.resend_contact_id) {
            const existing = await resend.contacts.get(
                currentUser.resend_contact_id
            )

            if (existing.data && existing.data.email !== currentUser.email) {
                // Email changed — Resend does not allow updating email.
                // Delete old contact and create a new one.
                await resend.contacts.remove(currentUser.resend_contact_id)
                await db
                    .update(users)
                    .set({ resend_contact_id: null })
                    .where(eq(users.id, currentUser.id))
                currentUser = { ...currentUser, resend_contact_id: null }
            } else if (existing.data) {
                // Contact exists and email matches — update fields
                await resend.contacts.update({
                    id: currentUser.resend_contact_id,
                    firstName: currentUser.first_name || null,
                    lastName: currentUser.last_name || null,
                    unsubscribed: currentUser.unsubscribed
                })
                return currentUser.resend_contact_id
            }
            // If existing.data is null, contact was deleted externally — fall through to create
        }

        // Create new contact
        const created = await resend.contacts.create({
            email: currentUser.email,
            firstName: currentUser.first_name || undefined,
            lastName: currentUser.last_name || undefined,
            unsubscribed: currentUser.unsubscribed
        })

        if (!created.data?.id) {
            console.error(
                "[resend-sync] Failed to create contact for user",
                currentUser.id,
                created.error
            )
            return null
        }

        const contactId = created.data.id

        // Persist the contact ID back to the DB
        await db
            .update(users)
            .set({ resend_contact_id: contactId })
            .where(eq(users.id, currentUser.id))

        return contactId
    } catch (err) {
        console.error(
            "[resend-sync] upsertContact error for user",
            user.id,
            err
        )
        return null
    }
}

// ---------------------------------------------------------------------------
// Segment management
// ---------------------------------------------------------------------------

/**
 * Idempotent segment creator. Checks our resend_segments table first;
 * if not found, creates the segment in Resend and stores the ID.
 * Returns the Resend segment ID, or null on failure.
 */
export async function ensureSegment(
    type: SegmentType,
    options: {
        seasonId?: number
        divisionId?: number
        teamId?: number
        name: string
    }
): Promise<string | null> {
    try {
        // Build DB lookup conditions
        const conditions = [eq(resendSegments.segment_type, type)]
        if (options.seasonId !== undefined) {
            conditions.push(eq(resendSegments.season_id, options.seasonId))
        } else {
            conditions.push(isNull(resendSegments.season_id))
        }
        if (options.divisionId !== undefined) {
            conditions.push(eq(resendSegments.division_id, options.divisionId))
        } else {
            conditions.push(isNull(resendSegments.division_id))
        }
        if (options.teamId !== undefined) {
            conditions.push(eq(resendSegments.team_id, options.teamId))
        } else {
            conditions.push(isNull(resendSegments.team_id))
        }

        const [existing] = await db
            .select({
                resend_segment_id: resendSegments.resend_segment_id
            })
            .from(resendSegments)
            .where(and(...conditions))
            .limit(1)

        if (existing) {
            return existing.resend_segment_id
        }

        // Create in Resend
        const created = await resend.segments.create({ name: options.name })

        if (!created.data?.id) {
            console.error(
                "[resend-sync] Failed to create segment",
                options.name,
                created.error
            )
            return null
        }

        const segmentId = created.data.id

        // Store in DB
        await db.insert(resendSegments).values({
            name: options.name,
            resend_segment_id: segmentId,
            segment_type: type,
            season_id: options.seasonId ?? null,
            division_id: options.divisionId ?? null,
            team_id: options.teamId ?? null
        })

        return segmentId
    } catch (err) {
        console.error(
            "[resend-sync] ensureSegment error for",
            options.name,
            err
        )
        return null
    }
}

/**
 * Adds a contact to a Resend segment.
 * Uses resend.contacts.segments.add({ contactId, segmentId }).
 */
async function addContactToSegment(
    contactId: string,
    segmentId: string
): Promise<void> {
    try {
        await resend.contacts.segments.add({ contactId, segmentId })
    } catch (err) {
        console.error(
            "[resend-sync] addContactToSegment error",
            contactId,
            segmentId,
            err
        )
    }
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

interface TopicIds {
    generalUpdatesId: string | null
    inSeasonUpdatesId: string | null
}

/**
 * Ensures both email topics exist in Resend and our DB. Idempotent.
 * Topics:
 *   - "General Updates" (opt_in): season announcements, registration deadlines
 *   - "In Season Updates" (opt_in): in-season communications for registered players
 */
export async function ensureTopics(): Promise<TopicIds> {
    const result: TopicIds = {
        generalUpdatesId: null,
        inSeasonUpdatesId: null
    }

    try {
        const [generalRow] = await db
            .select({ resend_topic_id: resendTopics.resend_topic_id })
            .from(resendTopics)
            .where(eq(resendTopics.topic_type, "general_updates"))
            .limit(1)

        if (generalRow) {
            result.generalUpdatesId = generalRow.resend_topic_id
        } else {
            const created = await resend.topics.create({
                name: "General Updates",
                defaultSubscription: "opt_in"
            })
            if (created.data?.id) {
                result.generalUpdatesId = created.data.id
                await db.insert(resendTopics).values({
                    topic_type: "general_updates",
                    name: "General Updates",
                    resend_topic_id: created.data.id
                })
            }
        }

        const [inSeasonRow] = await db
            .select({ resend_topic_id: resendTopics.resend_topic_id })
            .from(resendTopics)
            .where(eq(resendTopics.topic_type, "in_season_updates"))
            .limit(1)

        if (inSeasonRow) {
            result.inSeasonUpdatesId = inSeasonRow.resend_topic_id
        } else {
            const created = await resend.topics.create({
                name: "In Season Updates",
                defaultSubscription: "opt_in"
            })
            if (created.data?.id) {
                result.inSeasonUpdatesId = created.data.id
                await db.insert(resendTopics).values({
                    topic_type: "in_season_updates",
                    name: "In Season Updates",
                    resend_topic_id: created.data.id
                })
            }
        }
    } catch (err) {
        console.error("[resend-sync] ensureTopics error", err)
    }

    return result
}

// ---------------------------------------------------------------------------
// Season label helper
// ---------------------------------------------------------------------------

function buildSeasonLabel(year: number, season: string): string {
    return `${season.charAt(0).toUpperCase() + season.slice(1)} ${year}`
}

// ---------------------------------------------------------------------------
// Full single-user sync
// ---------------------------------------------------------------------------

/**
 * Syncs a single user to Resend:
 * 1. Upserts the contact (creates or updates name/unsubscribed)
 * 2. Adds to the "All Users" segment
 * 3. If signed up for current season: adds to season signups segment
 * 4. If drafted: adds to division and team segments
 *
 * Fire-and-forget safe — call with .catch(console.error).
 */
export async function syncUserToResend(userId: string): Promise<void> {
    const [user] = await db
        .select({
            id: users.id,
            email: users.email,
            first_name: users.first_name,
            last_name: users.last_name,
            unsubscribed: users.unsubscribed,
            resend_contact_id: users.resend_contact_id
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (!user) return

    const contactId = await upsertContact(user)
    if (!contactId) return

    // Always add to "All Users" segment
    const allUsersSegmentId = await ensureSegment("all_users", {
        name: "All Users"
    })
    if (allUsersSegmentId) {
        await addContactToSegment(contactId, allUsersSegmentId)
    }

    // Current season context
    const config = await getSeasonConfig()
    if (!config.seasonId) return
    const seasonId = config.seasonId

    const [signup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(and(eq(signups.season, seasonId), eq(signups.player, userId)))
        .limit(1)

    if (!signup) return

    const [seasonRow] = await db
        .select({ year: seasons.year, season: seasons.season })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)

    if (!seasonRow) return
    const seasonLabel = buildSeasonLabel(seasonRow.year, seasonRow.season)

    // Season signups segment
    const signupsSegmentId = await ensureSegment("season_signups", {
        seasonId,
        name: `${seasonLabel} - All Signups`
    })
    if (signupsSegmentId) {
        await addContactToSegment(contactId, signupsSegmentId)
    }

    // Check if drafted
    const [draftRow] = await db
        .select({
            teamId: teams.id,
            teamName: teams.name,
            divisionId: teams.division
        })
        .from(drafts)
        .innerJoin(teams, eq(drafts.team, teams.id))
        .where(and(eq(drafts.user, userId), eq(teams.season, seasonId)))
        .limit(1)

    if (!draftRow) return

    // Division segment
    const [divisionRow] = await db
        .select({ name: divisions.name })
        .from(divisions)
        .where(eq(divisions.id, draftRow.divisionId))
        .limit(1)

    if (divisionRow) {
        const divisionSegmentId = await ensureSegment("season_division", {
            seasonId,
            divisionId: draftRow.divisionId,
            name: `${seasonLabel} - ${divisionRow.name}`
        })
        if (divisionSegmentId) {
            await addContactToSegment(contactId, divisionSegmentId)
        }
    }

    // Team segment
    const teamSegmentId = await ensureSegment("season_team", {
        seasonId,
        teamId: draftRow.teamId,
        name: `${seasonLabel} - Team ${draftRow.teamName}`
    })
    if (teamSegmentId) {
        await addContactToSegment(contactId, teamSegmentId)
    }
}

// ---------------------------------------------------------------------------
// Bulk resync
// ---------------------------------------------------------------------------

/**
 * Full resync of all users + current-season segment memberships.
 * Used by the "Resync with Resend" button on the Send Email admin page.
 * Returns counts of synced and failed users.
 */
export async function fullResync(): Promise<{
    synced: number
    failed: number
}> {
    let synced = 0
    let failed = 0

    try {
        const allUsers = await db.select({ id: users.id }).from(users)

        for (const user of allUsers) {
            try {
                await syncUserToResend(user.id)
                synced++
            } catch (err) {
                console.error(
                    "[resend-sync] fullResync failed for user",
                    user.id,
                    err
                )
                failed++
            }
        }
    } catch (err) {
        console.error("[resend-sync] fullResync error", err)
    }

    return { synced, failed }
}

// ---------------------------------------------------------------------------
// Season cleanup
// ---------------------------------------------------------------------------

/**
 * Deletes season_division and season_team segments for the given season
 * from both Resend and the resend_segments table.
 * Keeps the season_signups segment for historical targeting.
 * Called when a season moves to "complete" phase.
 */
export async function cleanupSeasonSegments(seasonId: number): Promise<void> {
    try {
        const segmentsToDelete = await db
            .select({
                id: resendSegments.id,
                resend_segment_id: resendSegments.resend_segment_id
            })
            .from(resendSegments)
            .where(
                and(
                    eq(resendSegments.season_id, seasonId),
                    inArray(resendSegments.segment_type, [
                        "season_division",
                        "season_team"
                    ])
                )
            )

        for (const segment of segmentsToDelete) {
            try {
                await resend.segments.remove(segment.resend_segment_id)
            } catch (err) {
                // Log but continue — segment may have been manually deleted in Resend
                console.error(
                    "[resend-sync] Failed to delete Resend segment",
                    segment.resend_segment_id,
                    err
                )
            }
            await db
                .delete(resendSegments)
                .where(eq(resendSegments.id, segment.id))
        }

        console.log(
            `[resend-sync] Cleaned up ${segmentsToDelete.length} segments for season ${seasonId}`
        )
    } catch (err) {
        console.error(
            "[resend-sync] cleanupSeasonSegments error for season",
            seasonId,
            err
        )
    }
}

// ---------------------------------------------------------------------------
// Team segment sync (called after draft submission)
// ---------------------------------------------------------------------------

/**
 * Syncs all drafted players on a team into the team's Resend segment.
 * Also ensures they are in the division and season-signups segments.
 * Called after submitDraft() succeeds.
 */
export async function syncTeamToSegment(
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

        const draftedRows = await db
            .select({ userId: drafts.user })
            .from(drafts)
            .where(eq(drafts.team, teamId))

        const playerIds = draftedRows.map((r) => r.userId)
        if (playerIds.length === 0) return

        const playerRows = await db
            .select({
                id: users.id,
                email: users.email,
                first_name: users.first_name,
                last_name: users.last_name,
                unsubscribed: users.unsubscribed,
                resend_contact_id: users.resend_contact_id
            })
            .from(users)
            .where(inArray(users.id, playerIds))

        const [divisionRow] = await db
            .select({ name: divisions.name })
            .from(divisions)
            .where(eq(divisions.id, teamRow.divisionId))
            .limit(1)

        const [signupsSegmentId, divisionSegmentId, teamSegmentId] =
            await Promise.all([
                ensureSegment("season_signups", {
                    seasonId,
                    name: `${seasonLabel} - All Signups`
                }),
                divisionRow
                    ? ensureSegment("season_division", {
                          seasonId,
                          divisionId: teamRow.divisionId,
                          name: `${seasonLabel} - ${divisionRow.name}`
                      })
                    : Promise.resolve(null),
                ensureSegment("season_team", {
                    seasonId,
                    teamId,
                    name: `${seasonLabel} - Team ${teamRow.name}`
                })
            ])

        for (const player of playerRows) {
            const contactId = await upsertContact(player)
            if (!contactId) continue

            if (signupsSegmentId) {
                await addContactToSegment(contactId, signupsSegmentId)
            }
            if (divisionSegmentId) {
                await addContactToSegment(contactId, divisionSegmentId)
            }
            if (teamSegmentId) {
                await addContactToSegment(contactId, teamSegmentId)
            }
        }
    } catch (err) {
        console.error(
            "[resend-sync] syncTeamToSegment error for team",
            teamId,
            err
        )
    }
}
