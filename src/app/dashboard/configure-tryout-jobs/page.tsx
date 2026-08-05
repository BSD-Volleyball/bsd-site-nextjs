import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"

import { getConfigureTryoutJobsView } from "./actions"
import { ConfigureTryoutJobsForm } from "./configure-tryout-jobs-form"

export const metadata: Metadata = {
    title: "Configure Tryout Jobs"
}

export default async function ConfigureTryoutJobsPage() {
    await requireAdminOrRedirect()

    const result = await getConfigureTryoutJobsView()
    const data = result.status ? result.data : null

    return (
        <div className="space-y-6">
            <PageHeader
                title="Configure Tryout Jobs"
                description="Define the volunteer jobs that need filling on each tryout night."
            />
            {!result.status ? (
                <p className="text-muted-foreground">{result.message}</p>
            ) : !data ? (
                <p className="text-muted-foreground">
                    This season has no tryout dates yet. Add them in Season
                    Configuration first.
                </p>
            ) : (
                <ConfigureTryoutJobsForm view={data} />
            )}
        </div>
    )
}
