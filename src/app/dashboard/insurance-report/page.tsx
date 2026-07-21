import { PageHeader } from "@/components/layout/page-header"
import { requireAdminOrRedirect } from "@/lib/page-guards"
import { getInsuranceReportYears } from "./actions"
import { InsuranceReportClient } from "./insurance-report-client"

export default async function InsuranceReportPage() {
    await requireAdminOrRedirect()

    const years = await getInsuranceReportYears()
    const defaultYear = new Date().getFullYear()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Insurance Report"
                description="Distinct players who participated in any season or tournament during a calendar year, grouped by the youngest age they registered as. Used for the league's annual insurance headcount."
            />
            <InsuranceReportClient years={years} defaultYear={defaultYear} />
        </div>
    )
}
