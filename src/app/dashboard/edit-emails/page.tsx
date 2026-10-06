import { StatusBanner } from "@/components/ui/status-banner"
import { requireAdminOrRedirect } from "@/next/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { EditEmailsForm } from "./edit-emails-form"
import { getEmailTemplates } from "./actions"

import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Emails"
}

export const dynamic = "force-dynamic"

export default async function EditEmailsPage() {
    await requireAdminOrRedirect()

    const result = await getEmailTemplates()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Edit Emails"
                    description="Manage email templates for automated communications."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load email templates."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Edit Emails"
                description="Manage email templates for automated communications."
            />
            <EditEmailsForm templates={result.data} />
        </div>
    )
}
