import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { getSeasonConfig } from "@/lib/site-config"
import { getTryoutSlotLabels } from "@/lib/tryout-slot-labels"
import { TryoutSlotRequestsManager } from "./tryout-slot-requests-manager"
import { getTryoutSlotRequests, getUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Tryout Slot Requests"
}

export const dynamic = "force-dynamic"

async function getSlotLabelsByWeek(): Promise<Record<number, string[]>> {
    const config = await getSeasonConfig()
    return {
        1: getTryoutSlotLabels(config, 1),
        2: getTryoutSlotLabels(config, 2),
        3: getTryoutSlotLabels(config, 3)
    }
}

export default async function TryoutSlotRequestsPage() {
    await requireAdminOrRedirect()

    const [requestsResult, usersData, slotLabelsByWeek] = await Promise.all([
        getTryoutSlotRequests(),
        getUsers(),
        getSlotLabelsByWeek()
    ])

    if (!requestsResult.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Tryout Slot Requests"
                    description="Track which tryout time slots players can attend."
                />
                <StatusBanner variant="error">
                    {requestsResult.message ||
                        "Failed to load tryout slot requests."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <PageHeader
                title="Tryout Slot Requests"
                description={`Track which tryout time slots players can attend for ${requestsResult.seasonLabel}. Placement honors these as a strong preference — check the slots the player CAN make.`}
            />
            <TryoutSlotRequestsManager
                requests={requestsResult.requests}
                users={usersData}
                slotLabelsByWeek={slotLabelsByWeek}
            />
        </div>
    )
}
