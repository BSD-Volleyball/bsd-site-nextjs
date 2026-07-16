import { PageHeader } from "@/components/layout/page-header"
import { WizardForm } from "./wizard-form"
import { getUsers } from "./actions"
import type { Metadata } from "next"
import {
    getSeasonConfig,
    getCurrentSeasonAmount,
    formatSeasonLabel
} from "@/lib/site-config"
import { getActiveDiscountForUser } from "@/lib/discount"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getActiveWaiver } from "@/lib/waivers"

export const metadata: Metadata = {
    title: "Sign-up for Season"
}

export const dynamic = "force-dynamic"

export default async function PaySeasonPage() {
    const config = await getSeasonConfig()
    const seasonLabel = formatSeasonLabel(config)
    const users = await getUsers()
    const activeWaiver = await getActiveWaiver()

    // Get user's discount if logged in
    let discount: { id: number; percentage: string } | null = null
    const session = await auth.api.getSession({ headers: await headers() })
    if (session) {
        discount = await getActiveDiscountForUser(session.user.id, "season")
    }

    return (
        <div className="space-y-6">
            <div>
                <PageHeader
                    title="Season Registration"
                    description="Complete the form below to register for the upcoming volleyball season."
                    className="mb-2"
                />
                <Button asChild size="sm">
                    <Link href="/season-info">
                        {seasonLabel
                            ? `View ${seasonLabel} Season Info`
                            : "View Season Info"}
                    </Link>
                </Button>
            </div>
            <WizardForm
                amount={getCurrentSeasonAmount(config)}
                users={users}
                config={config}
                discount={discount}
                activeWaiver={activeWaiver}
            />
        </div>
    )
}
