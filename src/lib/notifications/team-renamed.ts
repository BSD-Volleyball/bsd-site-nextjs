import { and, eq, isNull, or } from "drizzle-orm"
import { db } from "@/database/db"
import { userRoles, users } from "@/database/schema"
import { buildTeamRenamedHtml } from "@/lib/email-html"
import {
    type DispatchResult,
    dispatchNotification,
    type NotificationRecipient
} from "./dispatch"

/**
 * Commissioners who oversee `divisionId` in `seasonId`: a commissioner row for
 * that division, or a league-wide one (division_id NULL), granted for that
 * season or globally — the same scoping hasPermission applies.
 */
export async function getDivisionCommissionerRecipients(
    seasonId: number,
    divisionId: number
): Promise<NotificationRecipient[]> {
    const rows = await db
        .select({
            id: users.id,
            email: users.email,
            firstName: users.first_name,
            preferredName: users.preferred_name
        })
        .from(userRoles)
        .innerJoin(users, eq(userRoles.user_id, users.id))
        .where(
            and(
                eq(userRoles.role, "commissioner"),
                or(
                    isNull(userRoles.season_id),
                    eq(userRoles.season_id, seasonId)
                ),
                or(
                    isNull(userRoles.division_id),
                    eq(userRoles.division_id, divisionId)
                )
            )
        )

    const seen = new Set<string>()
    const recipients: NotificationRecipient[] = []
    for (const row of rows) {
        if (!row.email || seen.has(row.id)) continue
        seen.add(row.id)
        recipients.push({
            userId: row.id,
            email: row.email,
            firstName: row.preferredName || row.firstName
        })
    }
    return recipients
}

/**
 * Tells a division's commissioners that a captain or coach renamed their
 * team. The person who made the change is never mailed about it, even when
 * they are also a commissioner. Never throws (dispatchNotification doesn't).
 */
export async function notifyCommissionersOfTeamRename(opts: {
    seasonId: number
    divisionId: number
    divisionName: string
    teamId: number
    oldName: string
    newName: string
    renamedByUserId: string
    renamedByName: string
}): Promise<DispatchResult> {
    const recipients = (
        await getDivisionCommissionerRecipients(opts.seasonId, opts.divisionId)
    ).filter((r) => r.userId !== opts.renamedByUserId)
    if (recipients.length === 0) return { sent: 0, failed: 0, skipped: 0 }

    return dispatchNotification({
        type: "team_renamed",
        recipients,
        subject: `${opts.divisionName}: "${opts.oldName}" is now "${opts.newName}"`,
        htmlBody: (r) =>
            buildTeamRenamedHtml({
                firstName: r.firstName ?? "there",
                renamedBy: opts.renamedByName,
                divisionName: opts.divisionName,
                oldName: opts.oldName,
                newName: opts.newName
            })
    })
}
