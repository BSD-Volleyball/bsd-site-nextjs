import { db } from "@/database/db"
import { signups } from "@/database/schema"
import { eq, and } from "drizzle-orm"
import { getSeasonConfig } from "@/lib/site-config"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { CaptainPairingForm } from "./captain-pairing-form"
import { getUsers } from "@/app/dashboard/pay-season/actions"
import { canEditPreferences } from "./utils"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Captain & Pairing Preferences"
}

export const dynamic = "force-dynamic"

const DESCRIPTION =
    "Update your captain interest and pairing request for the current season."

function EmptyState({ message }: { message: string }) {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Captain & Pairing Preferences"
                description={DESCRIPTION}
            />
            <p className="text-muted-foreground">{message}</p>
        </div>
    )
}

export default async function CaptainPairingPage() {
    const session = await requireSessionOrRedirect()

    const config = await getSeasonConfig()

    if (!config.seasonId) {
        return <EmptyState message="There is no active season at this time." />
    }

    const [signup] = await db
        .select({
            id: signups.id,
            captain: signups.captain,
            pair: signups.pair,
            pair_pick: signups.pair_pick,
            pair_reason: signups.pair_reason
        })
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
            <EmptyState message="You don't have a signup for the current season." />
        )
    }

    const users = await getUsers()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Captain & Pairing Preferences"
                description={DESCRIPTION}
            />
            <div className="max-w-2xl">
                <CaptainPairingForm
                    signupId={signup.id}
                    users={users}
                    initial={{
                        captain: signup.captain ?? "no",
                        pair: signup.pair ?? false,
                        pairPick: signup.pair_pick ?? null,
                        pairReason: signup.pair_reason ?? ""
                    }}
                    canEdit={canEditPreferences(config.phase)}
                />
            </div>
        </div>
    )
}
