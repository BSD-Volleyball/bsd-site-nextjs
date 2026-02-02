import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/layout/page-header"
import { PlayerLookupForm } from "./player-lookup-form"
import { getPlayersForLookup } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Player Lookup"
}

export const dynamic = "force-dynamic"

async function checkAdminAccess(userId: string): Promise<boolean> {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export default async function PlayerLookupPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await checkAdminAccess(session.user.id)

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getPlayersForLookup()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Player Lookup"
                    description="Search and view player information."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load players."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Player Lookup"
                description="Search and view player information."
            />
            <PlayerLookupForm players={result.players} playerPicUrl={process.env.PLAYER_PIC_URL || ""} />
        </div>
    )
}
