import { redirect } from "next/navigation"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { EditEmailsForm } from "./edit-emails-form"
import { getEmailTemplates } from "./actions"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Emails"
}

export const dynamic = "force-dynamic"

export default async function EditEmailsPage() {
    await requireSessionOrRedirect()

    const hasAccess = await getIsAdminOrDirector()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getEmailTemplates()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Edit Emails"
                    description="Manage email templates for automated communications."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load email templates."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Edit Emails"
                description="Manage email templates for automated communications."
            />
            <EditEmailsForm templates={result.templates} />
        </div>
    )
}
