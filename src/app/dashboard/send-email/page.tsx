import { requireAdminOrCommissionerOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { SendEmailClient } from "./send-email-client"
import { getEmailFormData, getBroadcastHistory } from "./actions"

export const metadata = { title: "Send Email" }
export const dynamic = "force-dynamic"

export default async function SendEmailPage() {
    await requireAdminOrCommissionerOrRedirect()

    const [{ canSendToAll, divisions, teams, templates, tryouts }, history] =
        await Promise.all([getEmailFormData(), getBroadcastHistory()])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Send Email"
                description="Compose and send broadcast emails to your user population."
            />
            <SendEmailClient
                canSendToAll={canSendToAll}
                divisions={divisions}
                teams={teams}
                templates={templates}
                tryouts={tryouts}
                history={history}
            />
        </div>
    )
}
