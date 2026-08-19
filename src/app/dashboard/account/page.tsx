import { PageHeader } from "@/components/layout/page-header"
import { CalendarLinksDialog } from "@/components/calendar/calendar-links-dialog"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { getAccountProfile } from "../settings/actions"
import { AccountForm } from "./account-form"
import { requireSessionOrRedirect } from "@/lib/page-guards"

export const metadata = {
    title: "Account"
}

export default async function AccountPage() {
    const session = await requireSessionOrRedirect()

    const result = await getAccountProfile()
    const profile = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Account"
                description="Manage your account information."
            />

            <div className="max-w-2xl space-y-6">
                <AccountForm profile={profile} email={session.user.email} />

                <Card>
                    <CardHeader>
                        <CardTitle>Calendar</CardTitle>
                        <CardDescription>
                            Subscribe to or download your schedule and your
                            friends&apos; schedules.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CalendarLinksDialog triggerLabel="Manage calendar links" />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
