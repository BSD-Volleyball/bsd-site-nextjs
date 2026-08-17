import { requireAdminOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { MergeUsersForm } from "./merge-users-form"
import { getMergeableUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Merge Users"
}

export const revalidate = 300

export default async function MergeUsersPage() {
    await requireAdminOrRedirect()

    // The two sides are symmetric, so one query feeds both pickers.
    const allUsers = await getMergeableUsers()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Merge Users"
                description="Combine two duplicate accounts into one, choosing field by field what the surviving record keeps."
            />
            <MergeUsersForm users={allUsers} />
        </div>
    )
}
