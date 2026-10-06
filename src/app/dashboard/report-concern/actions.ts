"use server"

import { db } from "@/database/db"
import { concerns } from "@/database/schema"
import { count, gt, sql } from "drizzle-orm"
import { logger } from "@/lib/logger"
import { getRecipientsWithRole } from "@/lib/rbac"
import { site } from "@/config/site"
import { sendMail } from "@/lib/email/send"
import { buildConcernNotificationHtml } from "@/lib/email-html"
import {
    withAction,
    ok,
    requireSession,
    requireNonEmptyString
} from "@/next/action-helpers"
import type { ActionResult } from "@/next/action-helpers"

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

const CONCERN_ALERT_WINDOW = "1 hour"
const CONCERN_ALERTS_PER_WINDOW = 10

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

        // Every concern is stored, but a flood (an account scripting this
        // action) must not become a flood of ombudsman email. Counted
        // league-wide because anonymous concerns deliberately record no user.
        const [recent] = await db
            .select({ total: count() })
            .from(concerns)
            // Window computed by Postgres: created_at is a naive timestamp
            // filled by now(), so comparing it with a JS Date would skew by
            // the server's UTC offset.
            .where(
                gt(
                    concerns.created_at,
                    sql`now() - ${CONCERN_ALERT_WINDOW}::interval`
                )
            )
        const alertsPaused = (recent?.total ?? 0) > CONCERN_ALERTS_PER_WINDOW
        if (alertsPaused) {
            logger.warn("[report-concern] Concern alerts paused by volume", {
                lastHour: recent?.total
            })
        }

        const ombudsmen = alertsPaused
            ? []
            : await getRecipientsWithRole("ombudsman")
        if (ombudsmen.length > 0) {
            // Staff mode: no preference covers operational mail, but a
            // hard-bounced ombudsman address is still unreachable.
            await sendMail({
                mode: { kind: "staff", category: "concern_submitted" },
                recipients: ombudsmen.map((r) => ({
                    userId: r.userId,
                    email: r.email
                })),
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
