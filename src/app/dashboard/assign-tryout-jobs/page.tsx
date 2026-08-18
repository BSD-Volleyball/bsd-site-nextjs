import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { getLeagueDateString } from "@/lib/date-utils"
import { requireAdminOrRedirect } from "@/lib/page-guards"

import { getAssignTryoutJobsView } from "./actions"
import { AssignTryoutJobsClient } from "./assign-tryout-jobs-client"

export const metadata: Metadata = {
    title: "Assign Tryout Jobs"
}

export default async function AssignTryoutJobsPage() {
    await requireAdminOrRedirect()

    const result = await getAssignTryoutJobsView()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Assign Tryout Jobs"
                description="Put volunteers into the jobs that need filling on each tryout night."
            />
            {!result.status ? (
                <p className="text-muted-foreground">{result.message}</p>
            ) : !data ? (
                <p className="text-muted-foreground">
                    This season has no tryout dates yet. Add them in Season
                    Configuration first.
                </p>
            ) : (
                <AssignTryoutJobsClient
                    view={data}
                    today={getLeagueDateString()}
                />
            )}
        </div>
    )
}
