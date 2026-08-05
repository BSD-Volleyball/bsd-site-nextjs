import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"

import { getPickTryoutVolunteersView } from "./actions"
import { PickTryoutVolunteersClient } from "./pick-tryout-volunteers-client"

export const metadata: Metadata = {
    title: "Pick Tryout Volunteers"
}

export default async function PickTryoutVolunteersPage() {
    await requireAdminOrRedirect()

    const result = await getPickTryoutVolunteersView()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Pick Tryout Volunteers"
                description="Give players the Tryout Volunteer role so they can be assigned to jobs on tryout nights."
            />
            {!result.status ? (
                <p className="text-muted-foreground">{result.message}</p>
            ) : (
                <PickTryoutVolunteersClient view={result.data} />
            )}
        </div>
    )
}
