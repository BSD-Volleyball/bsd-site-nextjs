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
                description="Who is covering the gym for each upcoming match night. Every night needs at least one admin (or a leadership member added here) in every slot, especially the first (setup) and last (mid-way and cleanup). Expand a slot's jobs to see what needs doing and who it falls to."
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
