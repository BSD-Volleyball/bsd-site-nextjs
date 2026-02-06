import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/layout/page-header"
import { MergeUsersForm } from "./merge-users-form"
import { getOldUsers, getNewUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Merge Users"
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

export default async function MergeUsersPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await checkAdminAccess(session.user.id)

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const [oldUsers, newUsers] = await Promise.all([
        getOldUsers(),
        getNewUsers()
    ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Merge Users"
                description="Combine duplicate user accounts by transferring records from an old user to a new user."
            />
            <MergeUsersForm oldUsers={oldUsers} newUsers={newUsers} />
        </div>
    )
}
