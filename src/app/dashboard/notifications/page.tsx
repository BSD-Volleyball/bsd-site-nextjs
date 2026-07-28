import { PageHeader } from "@/components/layout/page-header"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { getNotificationSettings } from "./actions"
import { NotificationsForm } from "./notifications-form"

export const metadata = {
    title: "Notifications"
}

export default async function NotificationsPage() {
    await requireSessionOrRedirect()
    const result = await getNotificationSettings()
    const settings = result.status
        ? result.data
        : { optedOut: [], suppressions: [] }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Notifications"
                description="Choose which emails you receive from the league."
            />
            <div className="max-w-2xl">
                <NotificationsForm
                    initialOptedOut={settings.optedOut}
                    suppressions={settings.suppressions}
                />
            </div>
        </div>
    )
}
