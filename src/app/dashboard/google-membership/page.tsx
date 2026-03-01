import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/layout/page-header"
import { getGoogleMembershipUsers } from "./actions"
import { GoogleMembershipTable } from "./google-membership-table"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Google Membership"
}

export const dynamic = "force-dynamic"

interface GoogleMembershipPageProps {
    searchParams?: Promise<{
        q?: string
        page?: string
    }>
}

async function checkAdminAccess(userId: string): Promise<boolean> {
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return user?.role === "admin" || user?.role === "director"
}

export default async function GoogleMembershipPage({
    searchParams
}: GoogleMembershipPageProps) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const query = resolvedSearchParams?.q ?? ""
    const pageRaw = Number.parseInt(resolvedSearchParams?.page ?? "1", 10)
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1

    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await checkAdminAccess(session.user.id)

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getGoogleMembershipUsers({
        query,
        page,
        limit: 50
    })

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Google Membership"
                    description="Manage seasons and notification list membership values for users."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load users."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Google Membership"
                description="Edit list membership values for each user."
            />
            <GoogleMembershipTable
                users={result.users}
                initialQuery={result.query}
                page={result.page}
                totalPages={result.totalPages}
                total={result.total}
            />
        </div>
    )
}
