import { requireAdminOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { AuditLogList } from "./audit-log-list"
import { getAuditLogs } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Audit Log"
}

export const revalidate = 300

export default async function AuditLogPage() {
    await requireAdminOrRedirect()

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
                    initialEntries={result.data.entries}
                    initialTotal={result.data.total}
                />
            )}
        </div>
    )
}
