"use server"

import { db } from "@/database/db"
import { emailTemplates } from "@/database/schema"
import { eq } from "drizzle-orm"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { logAuditEntry } from "@/lib/audit-log"
import { headers } from "next/headers"
import {
    type LexicalEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent,
    normalizeEmailTemplateContent
} from "@/lib/email-template-content"

interface EmailTemplate {
    id: number
    name: string
    subject: string | null
    content: LexicalEmailTemplateContent
    created_at: Date
    updated_at: Date
}

interface GetEmailTemplatesResult {
    status: boolean
    message?: string
    templates: EmailTemplate[]
}

interface UpdateEmailTemplateResult {
    status: boolean
    message: string
}

export async function getEmailTemplates(): Promise<GetEmailTemplatesResult> {
    try {
        const hasAccess = await getIsAdminOrDirector()

        if (!hasAccess) {
            return {
                status: false,
                message: "Unauthorized",
                templates: []
            }
        }

        const templates = await db
            .select()
            .from(emailTemplates)
            .orderBy(emailTemplates.name)

        const normalizedTemplates = templates.map((template) => ({
            ...template,
            content: normalizeEmailTemplateContent(template.content)
        }))

        return {
            status: true,
            templates: normalizedTemplates
        }
    } catch (error) {
        console.error("Error fetching email templates:", error)
        return {
            status: false,
            message: "Failed to load email templates.",
            templates: []
        }
    }
}

export async function updateEmailTemplate(
    id: number,
    name: string,
    subject: string | null,
    content: LexicalEmailTemplateContent
): Promise<UpdateEmailTemplateResult> {
    try {
        const hasAccess = await getIsAdminOrDirector()

        if (!hasAccess) {
            return {
                status: false,
                message: "Unauthorized"
            }
        }

        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user?.id) {
            return {
                status: false,
                message: "Not authenticated."
            }
        }

        // Validate inputs
        if (!name.trim()) {
            return {
                status: false,
                message: "Template name is required."
            }
        }

        const normalizedContent = normalizeEmailTemplateContent(content)

        if (
            !extractPlainTextFromEmailTemplateContent(normalizedContent).trim()
        ) {
            return {
                status: false,
                message: "Template content is required."
            }
        }

        // Check if template exists
        const [existingTemplate] = await db
            .select()
            .from(emailTemplates)
            .where(eq(emailTemplates.id, id))
            .limit(1)

        if (!existingTemplate) {
            return {
                status: false,
                message: "Email template not found."
            }
        }

        // Update the template
        await db
            .update(emailTemplates)
            .set({
                name: name.trim(),
                subject: subject?.trim() || null,
                content: normalizedContent as unknown as Record<
                    string,
                    unknown
                >,
                updated_at: new Date()
            })
            .where(eq(emailTemplates.id, id))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "email_template",
            entityId: id,
            summary: `Updated email template \"${name.trim()}\" (id ${id})`
        })

        return {
            status: true,
            message: "Email template updated successfully."
        }
    } catch (error) {
        console.error("Error updating email template:", error)
        return {
            status: false,
            message: "Failed to update email template."
        }
    }
}
