import { PageHeader } from "@/components/layout/page-header"
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

            <div className="max-w-2xl">
                <AccountForm profile={profile} email={session.user.email} />
            </div>
        </div>
    )
}
