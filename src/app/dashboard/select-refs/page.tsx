import { requirePermissionOrRedirect } from "@/next/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import type { Metadata } from "next"
import { SelectRefsClient } from "./select-refs-client"
import { getSelectRefsData } from "./actions"

export const metadata: Metadata = {
    title: "Select Refs"
}

export default async function SelectRefsPage() {
    await requirePermissionOrRedirect("schedule:manage")

    const data = await getSelectRefsData()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Select Refs"
                description="Manage the referee roster for the current season. Add referees, update certifications, and set maximum division levels."
            />
            <SelectRefsClient initialData={data} />
        </div>
    )
}
