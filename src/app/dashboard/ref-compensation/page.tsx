import { requireSessionOrRedirect } from "@/lib/page-guards"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { hasPermission, isAdminOrDirector } from "@/lib/rbac"
import { getRefCompensationData } from "./actions"
import { RefCompensationClient } from "./ref-compensation-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Ref Compensation"
}

export default async function RefCompensationPage() {
    const session = await requireSessionOrRedirect()

    const [canManage, isAdmin] = await Promise.all([
        hasPermission(session.user.id, "schedule:manage"),
        isAdminOrDirector(session.user.id)
    ])

    if (!canManage && !isAdmin) {
        redirect("/dashboard")
    }

    const result = await getRefCompensationData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Ref Compensation"
                    description="Season referee compensation breakdown"
                />
                <p className="text-muted-foreground">{result.message}</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Ref Compensation"
                description="Season referee compensation breakdown"
            />
            <RefCompensationClient data={result.data} />
        </div>
    )
}
