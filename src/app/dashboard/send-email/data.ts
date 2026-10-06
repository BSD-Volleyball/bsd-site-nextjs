import "server-only"

import { db } from "@/database/db"
import {
    emailRecipientGroups,
    emailBroadcasts,
    emailTemplates,
    users,
    teams,
    divisions
} from "@/database/schema"
import { eq, desc } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import {
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    getSessionUserId
} from "@/next/session"
import { getCommissionerDivisionScope } from "@/lib/rbac"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent
} from "@/lib/email-template-content"
import { getEventsByType } from "@/lib/season-utils"
import { formatDisplayName } from "@/lib/utils"

export interface DivisionOption {
    id: number
    name: string
}

export interface TeamOption {
    id: number
    name: string
    number: number | null
    divisionId: number
    divisionName: string
}

export interface TemplateOption {
    id: number
    name: string
    subject: string | null
    content: LexicalEmailTemplateContent
}

export interface TryoutOption {
    id: number
    /** 1-based position of this tryout night within the season. */
    ordinal: number
    eventDate: string
}

export interface BroadcastHistoryItem {
    id: number
    subject: string
    groupName: string
    groupId: number | null
    groupType: string | null
    divisionId: number | null
    teamId: number | null
    eventId: number | null
    streamId: string | null
    lexicalContent: LexicalEmailTemplateContent
    sentByName: string
    status: string
    /** Group size before suppression filtering; null for pre-2026-07 sends. */
    recipientTotal: number | null
    sentCount: number | null
    sentAt: Date | null
    createdAt: Date
}

// ---------------------------------------------------------------------------
// getEmailFormData
// ---------------------------------------------------------------------------

/**
 * Returns divisions, teams (for the current season), and templates.
 * canSendToAll indicates whether the user may send to Everyone/Season-wide.
 * Commissioners see only their permitted divisions/teams.
 */
export async function getEmailFormData(): Promise<{
    canSendToAll: boolean
    divisions: DivisionOption[]
    teams: TeamOption[]
    templates: TemplateOption[]
    tryouts: TryoutOption[]
}> {
    const isAdmin = await isAdminOrDirectorBySession()
    const isCommissioner = await isCommissionerBySession()

    if (!isAdmin && !isCommissioner) {
        return {
            canSendToAll: false,
            divisions: [],
            teams: [],
            templates: [],
            tryouts: []
        }
    }

    const config = await getSeasonConfig()

    let divisionRows: DivisionOption[] = []
    let teamRows: TeamOption[] = []

    if (config.seasonId) {
        // Fetch all teams + division info for the current season
        const rawTeams = await db
            .select({
                id: teams.id,
                name: teams.name,
                number: teams.number,
                divisionId: teams.division,
                divisionName: divisions.name
            })
            .from(teams)
            .innerJoin(divisions, eq(teams.division, divisions.id))
            .where(eq(teams.season, config.seasonId))
            .orderBy(divisions.name, teams.number)

        // Unique divisions from those teams
        const divMap = new Map<number, string>()
        for (const t of rawTeams) divMap.set(t.divisionId, t.divisionName)
        divisionRows = Array.from(divMap.entries()).map(([id, name]) => ({
            id,
            name
        }))

        // Commissioner RBAC: filter to permitted divisions only
        if (!isAdmin && isCommissioner) {
            const userId = await getSessionUserId()
            if (userId) {
                const scope = await getCommissionerDivisionScope(
                    userId,
                    config.seasonId
                )
                if (scope.type === "division_specific") {
                    divisionRows = divisionRows.filter((d) =>
                        scope.divisionIds.includes(d.id)
                    )
                    teamRows = rawTeams.filter((t) =>
                        scope.divisionIds.includes(t.divisionId)
                    )
                } else {
                    teamRows = rawTeams
                }
            }
        } else {
            teamRows = rawTeams
        }
    }

    const templateRows = await db
        .select({
            id: emailTemplates.id,
            name: emailTemplates.name,
            subject: emailTemplates.subject,
            content: emailTemplates.content
        })
        .from(emailTemplates)
        .orderBy(emailTemplates.name)

    const templates: TemplateOption[] = templateRows.map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        content: normalizeEmailTemplateContent(t.content)
    }))

    // Tryout nights, for the volunteer recipient sub-picker. Read from the
    // season config rather than a fresh query so the ordering matches every
    // other "Tryout N" label in the app.
    const tryouts: TryoutOption[] = getEventsByType(config, "tryout").map(
        (event, index) => ({
            id: event.id,
            ordinal: index + 1,
            eventDate: event.eventDate
        })
    )

    return {
        canSendToAll: isAdmin,
        divisions: divisionRows,
        teams: teamRows,
        templates,
        tryouts
    }
}

// ---------------------------------------------------------------------------
// getBroadcastHistory
// ---------------------------------------------------------------------------

export async function getBroadcastHistory(): Promise<BroadcastHistoryItem[]> {
    const isAdmin = await isAdminOrDirectorBySession()
    const isCommissioner = await isCommissionerBySession()
    if (!isAdmin && !isCommissioner) return []

    const rows = await db
        .select({
            id: emailBroadcasts.id,
            subject: emailBroadcasts.subject,
            groupName: emailRecipientGroups.name,
            groupId: emailBroadcasts.recipient_group_id,
            groupType: emailRecipientGroups.group_type,
            divisionId: emailRecipientGroups.division_id,
            teamId: emailRecipientGroups.team_id,
            eventId: emailRecipientGroups.event_id,
            streamId: emailBroadcasts.stream_id,
            lexicalContent: emailBroadcasts.lexical_content,
            recipientTotal: emailBroadcasts.recipient_total,
            sentByFirstName: users.first_name,
            sentByLastName: users.last_name,
            sentByPreferredName: users.preferred_name,
            status: emailBroadcasts.status,
            sentCount: emailBroadcasts.sent_count,
            sentAt: emailBroadcasts.sent_at,
            createdAt: emailBroadcasts.created_at
        })
        .from(emailBroadcasts)
        .leftJoin(
            emailRecipientGroups,
            eq(emailBroadcasts.recipient_group_id, emailRecipientGroups.id)
        )
        .innerJoin(users, eq(emailBroadcasts.sent_by, users.id))
        .orderBy(desc(emailBroadcasts.created_at))
        .limit(50)

    return rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        groupName: r.groupName ?? "Unknown",
        groupId: r.groupId,
        groupType: r.groupType ?? null,
        divisionId: r.divisionId ?? null,
        teamId: r.teamId ?? null,
        eventId: r.eventId ?? null,
        streamId: r.streamId,
        lexicalContent: normalizeEmailTemplateContent(r.lexicalContent),
        sentByName: formatDisplayName(
            r.sentByFirstName,
            r.sentByLastName,
            r.sentByPreferredName
        ),
        status: r.status,
        recipientTotal: r.recipientTotal,
        sentCount: r.sentCount,
        sentAt: r.sentAt,
        createdAt: r.createdAt
    }))
}
