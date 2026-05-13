import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { isAdminOrDirector } from "@/lib/rbac"
import { listWaivers } from "./actions"
import { ManageWaiversClient } from "./manage-waivers-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Manage Waivers"
}

export const dynamic = "force-dynamic"

export default async function ManageWaiversPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/auth/sign-in")

    const hasAccess = await isAdminOrDirector(session.user.id)
    if (!hasAccess) redirect("/dashboard")

    const waivers = await listWaivers()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manage Waivers"
                description="Publish new versions of the league waiver. Past versions are kept as a permanent audit record and cannot be edited."
            />
            <ManageWaiversClient waivers={waivers} />
        </div>
    )
}
