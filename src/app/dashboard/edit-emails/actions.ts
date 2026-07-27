"use server"

import { db } from "@/database/db"
import { emailTemplates } from "@/database/schema"
import { eq } from "drizzle-orm"
import {
    type ActionResult,
    fail,
    ok,
    requireAdmin,
    requireNonEmptyString,
    requirePositiveInt,
    requireSession,
    withAction
} from "@/lib/action-helpers"
import { logAuditEntry } from "@/lib/audit-log"
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

export const getEmailTemplates = withAction(
    async (): Promise<ActionResult<EmailTemplate[]>> => {
        await requireAdmin()

        const templates = await db
            .select()
            .from(emailTemplates)
            .orderBy(emailTemplates.name)

        const normalizedTemplates = templates.map((template) => ({
            ...template,
            content: normalizeEmailTemplateContent(template.content)
        }))

        return ok(normalizedTemplates)
    }
)

export const updateEmailTemplate = withAction(
    async (
        id: number,
        name: string,
        subject: string | null,
        content: LexicalEmailTemplateContent
    ): Promise<ActionResult<void>> => {
        await requireAdmin()
        const session = await requireSession()

        const templateId = requirePositiveInt(id, "template ID")
        const trimmedName = requireNonEmptyString(name, "Template name")

        const normalizedContent = normalizeEmailTemplateContent(content)

        if (
            !extractPlainTextFromEmailTemplateContent(normalizedContent).trim()
        ) {
            return fail("Template content is required.")
        }

        // Check if template exists
        const [existingTemplate] = await db
            .select()
            .from(emailTemplates)
            .where(eq(emailTemplates.id, templateId))
            .limit(1)

        if (!existingTemplate) {
            return fail("Email template not found.")
        }

        // Update the template
        await db
            .update(emailTemplates)
            .set({
                name: trimmedName,
                subject: subject?.trim() || null,
                content: normalizedContent as unknown as Record<
                    string,
                    unknown
                >,
                updated_at: new Date()
            })
            .where(eq(emailTemplates.id, templateId))

        await logAuditEntry({
            userId: session.user.id,
            action: "update",
            entityType: "email_template",
            entityId: templateId,
            summary: `Updated email template "${trimmedName}" (id ${templateId})`
        })

        return ok(undefined, "Email template updated successfully.")
    }
)

export const createEmailTemplate = withAction(
    async (name: string): Promise<ActionResult<void>> => {
        await requireAdmin()
        const session = await requireSession()

        const trimmedName = requireNonEmptyString(name, "Template name")
        const emptyContent = normalizeEmailTemplateContent("")

        try {
            const [created] = await db
                .insert(emailTemplates)
                .values({
                    name: trimmedName,
                    subject: null,
                    content: emptyContent as unknown as Record<string, unknown>,
                    created_at: new Date(),
                    updated_at: new Date()
                })
                .returning({ id: emailTemplates.id })

            await logAuditEntry({
                userId: session.user.id,
                action: "create",
                entityType: "email_template",
                entityId: created.id,
                summary: `Created email template "${trimmedName}" (id ${created.id})`
            })
        } catch (error) {
            if (
                error instanceof Error &&
                "code" in error &&
                (error as { code: string }).code === "23505"
            ) {
                return fail("A template with that name already exists.")
            }
            throw error
        }

        return ok(undefined, "Email template created successfully.")
    }
)
