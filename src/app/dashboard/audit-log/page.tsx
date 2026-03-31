import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { PageHeader } from "@/components/layout/page-header"
import { AuditLogList } from "./audit-log-list"
import { getAuditLogs } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Audit Log"
}

export const revalidate = 300

export default async function AuditLogPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirectorBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getAuditLogs({ offset: 0, limit: 50 })

    return (
        <div className="space-y-6">
            <PageHeader
                title="Audit Log"
                description="View a history of all actions performed in the system."
            />
            {!result.status ? (
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load audit logs."}
                </div>
            ) : (
                <AuditLogList
                    initialEntries={result.entries}
                    initialTotal={result.total}
                />
            )}
        </div>
    )
}
