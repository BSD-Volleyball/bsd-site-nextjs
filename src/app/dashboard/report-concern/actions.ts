"use server"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { db } from "@/database/db"
import { concerns } from "@/database/schema"
import { Resend } from "resend"
import { site } from "@/config/site"

const resend = new Resend(process.env.RESEND_API_KEY)

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

export async function submitConcern(
    input: SubmitConcernInput
): Promise<{ status: boolean; message: string }> {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        return {
            status: false,
            message: "You must be logged in to submit a concern."
        }
    }

    if (!input.incident_date?.trim()) {
        return { status: false, message: "Date of incident is required." }
    }
    if (!input.location?.trim()) {
        return { status: false, message: "Location of incident is required." }
    }
    if (!input.person_involved?.trim()) {
        return { status: false, message: "Person involved is required." }
    }
    if (!input.description?.trim()) {
        return { status: false, message: "Description is required." }
    }

    try {
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

        const notifyEmail = process.env.CONCERNS_NOTIFY_EMAIL
        if (notifyEmail) {
            const appUrl =
                process.env.NEXT_PUBLIC_APP_URL || "https://bumpsetdrink.com"
            await resend.emails.send({
                from: site.mailFrom,
                to: notifyEmail,
                subject: "New Concern Submitted",
                html: `<p>A new concern has been submitted.</p><p><a href="${appUrl}/dashboard/manage-concerns">View concerns</a></p>`
            })
        }

        return {
            status: true,
            message:
                "Your concern has been submitted. Thank you for bringing this to our attention."
        }
    } catch (error) {
        console.error("Error submitting concern:", error)
        return {
            status: false,
            message: "Something went wrong. Please try again."
        }
    }
}
