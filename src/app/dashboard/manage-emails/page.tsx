import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { ManageEmailsClient } from "./manage-emails-client"
import { getInboundEmails, getAssignableAdmins } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Manage Emails"
}

export const revalidate = 300

export default async function ManageEmailsPage() {
    await requireAdminOrRedirect()

    const [emailsResult, assignableAdmins] = await Promise.all([
        getInboundEmails(),
        getAssignableAdmins()
    ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manage Emails"
                description="Review, assign, and track inbound emails received by the league."
            />
            {!emailsResult.status ? (
                <StatusBanner variant="error">
                    {emailsResult.message || "Failed to load emails."}
                </StatusBanner>
            ) : (
                <ManageEmailsClient
                    initialEmails={emailsResult.data}
                    assignableAdmins={assignableAdmins}
                    playerPicUrl={process.env.PLAYER_PIC_URL ?? ""}
                />
            )}
        </div>
    )
}
