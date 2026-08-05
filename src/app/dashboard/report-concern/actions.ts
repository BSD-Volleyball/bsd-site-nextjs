"use server"

import { db } from "@/database/db"
import { concerns, userRoles, users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { site } from "@/config/site"
import { sendMail } from "@/lib/email/send"
import { buildConcernNotificationHtml } from "@/lib/email-html"
import {
    withAction,
    ok,
    requireSession,
    requireNonEmptyString
} from "@/lib/action-helpers"
import type { ActionResult } from "@/lib/action-helpers"

export interface SubmitConcernInput {
    anonymous: boolean
    contact_name?: string
    contact_email?: string
    contact_phone?: string
    want_followup: boolean
    incident_date: string
    location: string
    person_involved: string
    witnesses?: string
    team_match?: string
    description: string
}

export const submitConcern = withAction(
    async (input: SubmitConcernInput): Promise<ActionResult> => {
        const session = await requireSession()

        requireNonEmptyString(input.incident_date, "Date of incident")
        requireNonEmptyString(input.location, "Location of incident")
        requireNonEmptyString(input.person_involved, "Person involved")
        requireNonEmptyString(input.description, "Description")

        await db.insert(concerns).values({
            user_id: input.anonymous ? null : session.user.id,
            anonymous: input.anonymous,
            contact_name: input.contact_name?.trim() || null,
            contact_email: input.contact_email?.trim() || null,
            contact_phone: input.contact_phone?.trim() || null,
            want_followup: input.want_followup,
            incident_date: input.incident_date.trim(),
            location: input.location.trim(),
            person_involved: input.person_involved.trim(),
            witnesses: input.witnesses?.trim() || null,
            team_match: input.team_match?.trim() || null,
            description: input.description.trim(),
            status: "new"
        })

        const ombudsmenRows = await db
            .select({ id: users.id, email: users.email })
            .from(userRoles)
            .innerJoin(users, eq(userRoles.user_id, users.id))
            .where(eq(userRoles.role, "ombudsman"))

        if (ombudsmenRows.length > 0) {
            // Staff mode: no preference covers operational mail, but a
            // hard-bounced ombudsman address is still unreachable.
            await sendMail({
                mode: { kind: "staff", category: "concern_submitted" },
                recipients: ombudsmenRows
                    .filter((r) => r.email)
                    .map((r) => ({ userId: r.id, email: r.email })),
                subject: "New Concern Submitted",
                htmlBody: buildConcernNotificationHtml(site.publicUrl),
                tag: "concern-notification"
            })
        }

        return ok(
            undefined,
            "Your concern has been submitted. Thank you for bringing this to our attention."
        )
    }
)
