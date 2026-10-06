import "server-only"

import { db } from "@/database/db"
import { emailTemplates } from "@/database/schema"
import {
    type ActionResult,
    ok,
    requireAdmin,
    withAction
} from "@/next/action-helpers"
import {
    type LexicalEmailTemplateContent,
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
