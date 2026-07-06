import { requireSessionOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { ReportConcernForm } from "./report-concern-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Report a Concern"
}

export default async function ReportConcernPage() {
    await requireSessionOrRedirect()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Report a Concern"
                description="Use this form to report any concerns, incidents, or disputes. All submissions are handled confidentially by our league ombudsman."
            />
            <ReportConcernForm />
        </div>
    )
}
