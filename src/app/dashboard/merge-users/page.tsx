import { requireAdminOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { MergeUsersForm } from "./merge-users-form"
import { getOldUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Merge Users"
}

export const revalidate = 300

export default async function MergeUsersPage() {
    await requireAdminOrRedirect()

    // Both selects offer the same pool now, so one query feeds both.
    const allUsers = await getOldUsers()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Merge Users"
                description="Combine duplicate user accounts by transferring records from an old user to a new user."
            />
            <MergeUsersForm oldUsers={allUsers} newUsers={allUsers} />
        </div>
    )
}
