import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { isAdminOrDirector } from "@/lib/rbac"
import { hasPermissionBySession } from "@/lib/rbac"
import type { Metadata } from "next"
import { SelectRefsClient } from "./select-refs-client"
import { getSelectRefsData } from "./actions"

export const metadata: Metadata = {
    title: "Select Refs"
}

export default async function SelectRefsPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const [hasSchedule, isAdmin] = await Promise.all([
        hasPermissionBySession("schedule:manage"),
        isAdminOrDirector(session.user.id)
    ])

    if (!hasSchedule && !isAdmin) {
        redirect("/dashboard")
    }

    const data = await getSelectRefsData()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Select Refs"
                description="Manage the referee roster for the current season. Add referees, update certifications, and set maximum division levels."
            />
            <SelectRefsClient initialData={data} />
        </div>
    )
}
