import { PageHeader } from "@/components/layout/page-header"
import { WizardForm } from "./wizard-form"
import type { Metadata } from "next"
import { listUserNames } from "@/lib/user-directory"
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
import { drafts, signups } from "@/database/schema"
import { and, eq } from "drizzle-orm"
import { hasRecordedAdultAge } from "@/lib/signup-age"

export const metadata: Metadata = {
    title: "Sign-up for Season"
}

export const dynamic = "force-dynamic"

export default async function PaySeasonPage() {
    const config = await getSeasonConfig()
    const seasonLabel = formatSeasonLabel(config)
    const users = await listUserNames()
    const activeWaiver = await getActiveWaiver()

    // Get user's discount if logged in
    let discount: { id: number; percentage: string } | null = null
    const session = await auth.api.getSession({ headers: await headers() })
    if (session) {
        discount = await getActiveDiscountForUser(session.user.id, "season")
    }

    // Returning player = has ever been drafted. Drives the week 1 tryout
    // default on the schedule step (returning players opt in, new players
    // are expected to attend).
    let isReturningPlayer = false
    if (session) {
        const [draftRow] = await db
            .select({ user: drafts.user })
            .from(drafts)
            .where(eq(drafts.user, session.user.id))
            .limit(1)
        isReturningPlayer = draftRow !== undefined
    }

    // A player who has already told us they were "20 or older" isn't asked
    // again — the wizard hides the question and submits the same answer.
    const isKnownAdult = session
        ? await hasRecordedAdultAge(session.user.id)
        : false

    // A signups row is only written after payment succeeds, so its presence
    // means this player has already signed up and paid for the current season.
    // Passed to the wizard, which shows a confirmation note instead of the
    // form (unless the signup just completed in this session — then it keeps
    // its success card up).
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
            <WizardForm
                amount={getCurrentSeasonAmount(config)}
                users={users}
                config={config}
                discount={discount}
                activeWaiver={activeWaiver}
                isReturningPlayer={isReturningPlayer}
                isKnownAdult={isKnownAdult}
                seasonLabel={seasonLabel}
                existingSignup={existingSignup}
            />
        </div>
    )
}
