import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { requirePermissionOrRedirect } from "@/lib/page-guards"
import { getUsers } from "@/app/dashboard/manage-discounts/actions"
import { getSponsorships } from "./actions"
import { SponsorsManager } from "./sponsors-manager"

export const metadata: Metadata = {
    title: "Manage Sponsors"
}

export default async function ManageSponsorsPage() {
    await requirePermissionOrRedirect("sponsors:manage")

    const [result, users] = await Promise.all([getSponsorships(), getUsers()])

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Manage Sponsors"
                    description="Season sponsors, their contacts, and payment status."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load sponsors."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manage Sponsors"
                description={`${result.data.seasonLabel} sponsors, their contacts, and payment status. Creating a sponsorship emails the contact a link to pay.`}
            />
            <SponsorsManager data={result.data} users={users} />
        </div>
    )
}
