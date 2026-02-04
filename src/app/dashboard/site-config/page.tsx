import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/database/db"
import { users } from "@/database/schema"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/layout/page-header"
import { SiteConfigForm } from "./site-config-form"
import { getAllSiteConfig } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Site Config"
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

export default async function SiteConfigPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await checkAdminAccess(session.user.id)

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getAllSiteConfig()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Site Configuration"
                    description="Manage site-wide configuration values."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load configuration."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Site Configuration"
                description="Manage site-wide configuration values."
            />
            <SiteConfigForm
                initialRows={result.rows.map((r) => ({
                    key: r.key,
                    value: r.value,
                    updated_at: r.updated_at.toISOString()
                }))}
            />
        </div>
    )
}
