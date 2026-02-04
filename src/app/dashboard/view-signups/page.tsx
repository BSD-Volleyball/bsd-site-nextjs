import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/layout/page-header"
import { SignupsList } from "./signups-list"
import { getSeasonSignups } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "View Signups"
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

export default async function ViewSignupsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await checkAdminAccess(session.user.id)

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getSeasonSignups()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="View Signups"
                    description="View all players signed up for the current season."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load signups."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`View Signups — ${result.seasonLabel}`}
                description="View all players signed up for the current season. New players are highlighted in blue."
            />
            <SignupsList
                signups={result.signups}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
