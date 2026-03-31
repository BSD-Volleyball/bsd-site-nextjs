import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { PageHeader } from "@/components/layout/page-header"
import { DiscountsManager } from "./discounts-manager"
import { getDiscounts, getUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Manage Discounts"
}

export const revalidate = 300

export default async function ManageDiscountsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirectorBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const [discountsResult, usersData] = await Promise.all([
        getDiscounts(),
        getUsers()
    ])

    if (!discountsResult.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Manage Discounts"
                    description="Create and manage player discounts."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {discountsResult.message || "Failed to load discounts."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manage Discounts"
                description="Create and manage player discounts for season registration."
            />
            <DiscountsManager
                discounts={discountsResult.discounts}
                users={usersData}
            />
        </div>
    )
}
