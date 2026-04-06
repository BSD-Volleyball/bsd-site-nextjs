import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isAdminOrDirectorBySession, isCommissionerBySession } from "@/lib/rbac"
import { PageHeader } from "@/components/layout/page-header"
import { SendEmailClient } from "./send-email-client"
import { getAvailableRecipientGroups, getBroadcastHistory } from "./actions"

export const metadata = { title: "Send Email" }
export const dynamic = "force-dynamic"

export default async function SendEmailPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")

    const [isAdmin, isCommissioner] = await Promise.all([
        isAdminOrDirectorBySession(),
        isCommissionerBySession()
    ])

    if (!isAdmin && !isCommissioner) redirect("/dashboard")

    const [{ groups, templates }, history] = await Promise.all([
        getAvailableRecipientGroups(),
        getBroadcastHistory()
    ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Send Email"
                description="Compose and send broadcast emails to your user population."
            />
            <SendEmailClient
                groups={groups}
                templates={templates}
                history={history}
            />
        </div>
    )
}
