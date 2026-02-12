import { PageHeader } from "@/components/layout/page-header"
import { getAccountProfile } from "../settings/actions"
import { AccountForm } from "./account-form"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export const metadata = {
    title: "Account"
}

export default async function AccountPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const { profile } = await getAccountProfile()

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
