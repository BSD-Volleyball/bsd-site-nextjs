import {
    ChangePasswordCard,
    ProvidersCard,
    SessionsCard
} from "@daveyplate/better-auth-ui"
import { PageHeader } from "@/components/layout/page-header"

export const metadata = {
    title: "Security"
}

export default function SecurityPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Security"
                description="Manage your password and security settings."
            />

            <div className="max-w-2xl space-y-4 sm:space-y-6">
                <ChangePasswordCard />
                <ProvidersCard />
                <SessionsCard />
            </div>
        </div>
    )
}
