import { requirePermissionOrRedirect } from "@/next/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { getRefCompensationData } from "./actions"
import { RefCompensationClient } from "./ref-compensation-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Ref Compensation"
}

export default async function RefCompensationPage() {
    await requirePermissionOrRedirect("schedule:manage")

    const result = await getRefCompensationData()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Ref Compensation"
                    description="Season referee compensation breakdown"
                />
                <p className="text-muted-foreground">{result.message}</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Ref Compensation"
                description="Season referee compensation breakdown"
            />
            <RefCompensationClient data={result.data} />
        </div>
    )
}
