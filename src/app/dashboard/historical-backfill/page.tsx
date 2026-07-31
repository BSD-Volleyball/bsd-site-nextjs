import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireAdminOrRedirect } from "@/lib/page-guards"
import { getHistoricalCoverage, getLegacyAccounts } from "./actions"
import { CoverageTable } from "./coverage-table"
import { LegacyAccountsPanel } from "./legacy-accounts-panel"

export const metadata: Metadata = {
    title: "Historical Backfill"
}

// Live figures, not a cached snapshot: the point of the page is to show the
// state of the database right now, including immediately after an import or
// repair script has run.
export const dynamic = "force-dynamic"

export default async function HistoricalBackfillPage() {
    await requireAdminOrRedirect()

    const [result, legacyResult] = await Promise.all([
        getHistoricalCoverage(),
        getLegacyAccounts()
    ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Historical Backfill"
                description="What league history the database actually holds, season by season. Coverage is measured per division, so a season only counts as complete when every division it ran is covered."
            />
            {!result.status ? (
                <StatusBanner variant="error">
                    {result.message || "Failed to load historical coverage."}
                </StatusBanner>
            ) : (
                <CoverageTable coverage={result.data} />
            )}
            {!legacyResult.status ? (
                <StatusBanner variant="error">
                    {legacyResult.message ||
                        "Failed to load legacy placeholder accounts."}
                </StatusBanner>
            ) : (
                <LegacyAccountsPanel accounts={legacyResult.data} />
            )}
        </div>
    )
}
