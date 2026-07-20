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
import { db } from "@/database/db"
import { signups } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { CheckCircle2 } from "lucide-react"

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

    // A signups row is only written after payment succeeds, so its presence
    // means this player has already signed up and paid for the current season.
    // Show a confirmation note instead of letting them re-fill the form.
    let existingSignup: { amountPaid: string | null; signedUpAt: Date } | null =
        null
    if (session && config.seasonId) {
        const [row] = await db
            .select({
                amountPaid: signups.amount_paid,
                signedUpAt: signups.created_at
            })
            .from(signups)
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    eq(signups.player, session.user.id)
                )
            )
            .limit(1)
        existingSignup = row ?? null
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
            {existingSignup ? (
                <div className="rounded-lg border-2 border-green-600/40 bg-green-50 p-6 dark:bg-green-950/30">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-green-600 dark:text-green-400" />
                        <div className="space-y-2">
                            <h2 className="font-semibold text-green-800 text-lg dark:text-green-300">
                                You&apos;re already registered
                                {seasonLabel
                                    ? ` for the ${seasonLabel} season`
                                    : ""}
                                !
                            </h2>
                            <p className="text-green-700 text-sm dark:text-green-400">
                                Our records show you signed up
                                {existingSignup.amountPaid &&
                                Number(existingSignup.amountPaid) > 0
                                    ? ` and paid $${existingSignup.amountPaid}`
                                    : ""}{" "}
                                on{" "}
                                {existingSignup.signedUpAt.toLocaleDateString(
                                    "en-US",
                                    {
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric"
                                    }
                                )}
                                . There&apos;s no need to sign up again.
                            </p>
                            <Button asChild size="sm" className="mt-1">
                                <Link href="/dashboard">Back to Dashboard</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <WizardForm
                    amount={getCurrentSeasonAmount(config)}
                    users={users}
                    config={config}
                    discount={discount}
                    activeWaiver={activeWaiver}
                />
            )}
        </div>
    )
}
