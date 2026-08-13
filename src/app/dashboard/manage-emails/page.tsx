import { requireAdminOrRedirect } from "@/lib/page-guards"
import { playerPicBaseUrl } from "@/config/env"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { ManageEmailsClient } from "./manage-emails-client"
import { getInboundEmails, getAssignableAdmins } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Manage Emails"
}

export const revalidate = 300

export default async function ManageEmailsPage({
    searchParams
}: {
    searchParams: Promise<{ email?: string }>
}) {
    await requireAdminOrRedirect()

    // Notification emails deep-link to a specific thread via ?email=<id>.
    const { email } = await searchParams
    const parsedId = Number.parseInt(email ?? "", 10)
    const focusEmailId =
        Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null

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
                    playerPicUrl={playerPicBaseUrl()}
                    focusEmailId={focusEmailId}
                />
            )}
        </div>
    )
}
