import { requireAdminOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { MergeUsersForm } from "./merge-users-form"
import { getMergeableUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Merge Users"
}

export const revalidate = 300

export default async function MergeUsersPage({
    searchParams
}: {
    searchParams: Promise<{ a?: string; b?: string }>
}) {
    await requireAdminOrRedirect()

    // The two sides are symmetric, so one query feeds both pickers.
    const [allUsers, params] = await Promise.all([
        getMergeableUsers(),
        searchParams
    ])

    // `?a=&b=` lets another screen do step 1 on the admin's behalf and hand the
    // pair straight to the field comparison — the Historical Backfill page maps
    // a legacy placeholder to a member this way. Ids are only pre-selections;
    // every guard still runs server-side when the merge is submitted.
    const initialA = typeof params.a === "string" ? params.a : ""
    const initialB = typeof params.b === "string" ? params.b : ""

    return (
        <div className="space-y-6">
            <PageHeader
                title="Merge Users"
                description="Combine two duplicate accounts into one, choosing field by field what the surviving record keeps."
            />
            <MergeUsersForm
                users={allUsers}
                initialUserAId={initialA}
                initialUserBId={initialB}
            />
        </div>
    )
}
