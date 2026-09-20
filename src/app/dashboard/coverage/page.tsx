import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/next/page-guards"
import { getSessionUserId } from "@/next/session"

import { getCoverageView } from "./actions"
import { CoverageClient } from "./coverage-client"

export const metadata: Metadata = {
    title: "Coverage"
}

export default async function CoveragePage() {
    await requireAdminOrRedirect()
    const currentUserId = (await getSessionUserId()) ?? ""
    const result = await getCoverageView()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Coverage"
                description="Which admins are at the gym for each upcoming match night. Every night needs at least one admin in every slot, especially the first (setup) and last (cleanup)."
            />
            {!result.status ? (
                <p className="text-muted-foreground">{result.message}</p>
            ) : (
                <CoverageClient
                    view={result.data}
                    currentUserId={currentUserId}
                />
            )}
        </div>
    )
}
