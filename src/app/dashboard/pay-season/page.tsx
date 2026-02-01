import { PageHeader } from "@/components/layout/page-header"
import { WizardForm } from "./wizard-form"
import { getUsers } from "./actions"
import type { Metadata } from "next"
import { getSeasonConfig } from "@/lib/site-config"

export const metadata: Metadata = {
    title: "Sign-up for Season"
}

export const dynamic = "force-dynamic"

export default async function PaySeasonPage() {
    const config = await getSeasonConfig()
    const users = await getUsers()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Season Registration"
                description="Complete the form below to register for the upcoming volleyball season."
            />
            <WizardForm amount={config.seasonAmount} users={users} config={config} />
        </div>
    )
}
