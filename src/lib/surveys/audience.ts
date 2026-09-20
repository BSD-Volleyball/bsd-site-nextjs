/**
 * audience.ts — turning a survey's audience definition into people.
 *
 * The groups a survey targets are the same recipient groups the Send Email
 * page uses, so resolution goes through email-recipients rather than
 * re-deriving "everyone signed up this season" a second time: one definition
 * of each group, one place where a roster change shows up.
 *
 * Resolution is a union of the groups, plus the hand-added ids, minus the
 * hand-removed ones — in that order, so a removal always wins. Placeholder
 * `legacy-*` accounts from the archive backfill are dropped: the group
 * resolvers already do it, and the manual add path mirrors them so an admin's
 * recipient count matches what actually goes out.
 *
 * Framework-independent: db + drizzle + lib only.
 */

import { eq, inArray } from "drizzle-orm"
import { db } from "@/database/db"
import { divisions, seasons, teams, users } from "@/database/schema"
import { ActionError } from "@/lib/action-result"
import {
    type Recipient,
    ensureRecipientGroup,
    getRecipientsForGroup
} from "@/lib/email-recipients"
import { isLegacyEmail } from "@/lib/legacy-matching"
import { formatSeasonLabel } from "@/lib/season-utils"
import {
    type SurveyAudienceDefinition,
    type SurveyAudienceGroup,
    SEASON_BOUND_GROUP_TYPES,
    describeAudienceGroup,
    validateAudience
} from "./types"

export interface ResolvedAudience {
    recipients: Recipient[]
    groupCounts: { group: SurveyAudienceGroup; count: number }[]
}

/**
 * Everyone the definition targets, deduplicated by user id, with the per-group
 * counts the editor shows beside each row.
 *
 * Throws ActionError on the first definition problem (a season-bound group
 * with no season, a division group with no division). Groups are resolved one
 * at a time on purpose: ensureRecipientGroup inserts the group row when it is
 * missing, and two concurrent inserts of the same scope would race.
 */
export async function resolveAudience(
    def: SurveyAudienceDefinition,
    seasonId: number | null
): Promise<ResolvedAudience> {
    const errors = validateAudience(def, seasonId)
    if (errors.length > 0) throw new ActionError(errors[0])

    const groups = def.groups ?? []
    const seasonLabel =
        seasonId === null ? undefined : await loadSeasonLabel(seasonId)
    // Without these every division group would be minted as "Division (Fall
    // 2026)", and the Send Email page would list a row per division under one
    // indistinguishable name.
    const divisionNames = await loadNames(
        divisions,
        groups.map((group) => group.divisionId)
    )
    const teamNames = await loadNames(
        teams,
        groups.map((group) => group.teamId)
    )

    const byUserId = new Map<string, Recipient>()
    const groupCounts: ResolvedAudience["groupCounts"] = []

    for (const group of groups) {
        // Season-less groups (everyone, all refs, leadership) must not be
        // scoped to a season: ensureRecipientGroup keys on the scope columns,
        // so passing one would mint a duplicate group row per season.
        const seasonScoped = SEASON_BOUND_GROUP_TYPES.includes(group.type)
        const groupId = await ensureRecipientGroup(group.type, {
            name: describeAudienceGroup(group, {
                seasonLabel,
                divisionName:
                    group.divisionId === undefined
                        ? undefined
                        : divisionNames.get(group.divisionId),
                teamName:
                    group.teamId === undefined
                        ? undefined
                        : teamNames.get(group.teamId)
            }),
            seasonId: seasonScoped && seasonId !== null ? seasonId : undefined,
            divisionId: group.divisionId,
            teamId: group.teamId,
            eventId: group.eventId
        })

        const recipients = await getRecipientsForGroup(groupId)
        for (const recipient of recipients) {
            if (!byUserId.has(recipient.userId)) {
                byUserId.set(recipient.userId, recipient)
            }
        }
        groupCounts.push({ group, count: recipients.length })
    }

    for (const recipient of await loadUsersAsRecipients(def.addUserIds ?? [])) {
        if (!byUserId.has(recipient.userId)) {
            byUserId.set(recipient.userId, recipient)
        }
    }

    for (const userId of def.removeUserIds ?? []) {
        byUserId.delete(userId)
    }

    return { recipients: [...byUserId.values()], groupCounts }
}

/** id → name for whichever of `ids` are set, in one query. */
async function loadNames(
    table: typeof divisions | typeof teams,
    ids: (number | undefined)[]
): Promise<Map<number, string>> {
    const wanted = [
        ...new Set(ids.filter((id): id is number => typeof id === "number"))
    ]
    if (wanted.length === 0) return new Map()

    const rows = await db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(inArray(table.id, wanted))
    return new Map(rows.map((row) => [row.id, row.name]))
}

async function loadSeasonLabel(seasonId: number): Promise<string | undefined> {
    const [row] = await db
        .select({ year: seasons.year, season: seasons.season })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
    if (!row) return undefined
    const label = formatSeasonLabel({
        seasonName: row.season,
        seasonYear: row.year
    })
    return label === "" ? undefined : label
}

/** Hand-added ids, as recipients. Unknown ids and placeholders fall away. */
async function loadUsersAsRecipients(userIds: string[]): Promise<Recipient[]> {
    const ids = [...new Set(userIds)].filter((id) => id !== "")
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

    const recipients: Recipient[] = []
    for (const row of rows) {
        if (!row.email || isLegacyEmail(row.email)) continue
        recipients.push({
            email: row.email,
            firstName: row.first_name ?? "",
            lastName: row.last_name ?? "",
            userId: row.id
        })
    }
    return recipients
}
