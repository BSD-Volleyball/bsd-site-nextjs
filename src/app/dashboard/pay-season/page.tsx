import { PageHeader } from "@/components/layout/page-header"
import { WizardForm } from "./wizard-form"
import { getUsers } from "./actions"
import type { Metadata } from "next"
import { getSeasonConfig, getCurrentSeasonAmount } from "@/lib/site-config"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
    title: "Sign-up for Season"
}

export const dynamic = "force-dynamic"

export default async function PaySeasonPage() {
    const config = await getSeasonConfig()
    const users = await getUsers()

    return (
        <div className="space-y-6">
            <div>
                <PageHeader
                    title="Season Registration"
                    description="Complete the form below to register for the upcoming volleyball season."
                    className="mb-2"
                />
                <Button asChild size="sm">
                    <Link href="/spring-2026-season-info">
                        View Spring 2026 Season Info
                    </Link>
                </Button>
            </div>
            <WizardForm
                amount={getCurrentSeasonAmount(config)}
                users={users}
                config={config}
            />
        </div>
    )
}
