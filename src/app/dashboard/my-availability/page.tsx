import { auth } from "@/lib/auth"
import { db } from "@/database/db"
import { signups, playerUnavailability } from "@/database/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getSeasonConfig } from "@/lib/site-config"
import { PageHeader } from "@/components/layout/page-header"
import { AvailabilityForm } from "./availability-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "My Availability"
}

export const dynamic = "force-dynamic"

export default async function MyAvailabilityPage() {
    const session = await auth.api.getSession({
        headers: await headers()
    })
    if (!session) {
        redirect("/login")
    }

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="My Availability"
                    description="Manage which season dates you will miss."
                />
                <p className="text-muted-foreground">
                    There is no active season at this time.
                </p>
            </div>
        )
    }

    // Find the player's signup for the current season
    const [signup] = await db
        .select({ id: signups.id })
        .from(signups)
        .where(
            and(
                eq(signups.season, config.seasonId),
                eq(signups.player, session.user.id)
            )
        )
        .limit(1)

    if (!signup) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="My Availability"
                    description="Manage which season dates you will miss."
                />
                <p className="text-muted-foreground">
                    You don&apos;t have a signup for the current season.
                </p>
            </div>
        )
    }

    // Get existing unavailability records
    const unavailRows = await db
        .select({ eventId: playerUnavailability.event_id })
        .from(playerUnavailability)
        .where(eq(playerUnavailability.signup_id, signup.id))

    const initialUnavailableIds = unavailRows.map((r) => r.eventId)

    return (
        <div className="space-y-6">
            <PageHeader
                title="My Availability"
                description="Manage which season dates you will miss."
            />
            <AvailabilityForm
                signupId={signup.id}
                config={config}
                initialUnavailableIds={initialUnavailableIds}
            />
        </div>
    )
}
