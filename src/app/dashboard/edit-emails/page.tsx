import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { EditEmailsForm } from "./edit-emails-form"
import { getEmailTemplates } from "./actions"
import { getIsAdminOrDirector } from "@/app/dashboard/actions"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Emails"
}

export const dynamic = "force-dynamic"

export default async function EditEmailsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

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
            {result.templates.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No email templates found.
                </div>
            ) : (
                <EditEmailsForm templates={result.templates} />
            )}
        </div>
    )
}
