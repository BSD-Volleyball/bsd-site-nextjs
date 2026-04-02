import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { isAdminOrDirector } from "@/lib/rbac"
import { hasPermission } from "@/lib/rbac"
import { getRefCompensationData } from "./actions"
import { RefCompensationClient } from "./ref-compensation-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Ref Compensation"
}

export default async function RefCompensationPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session?.user) {
        redirect("/auth/sign-in")
    }

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
