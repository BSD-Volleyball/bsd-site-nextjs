import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { getSeasonConfig, getEventsByType } from "@/lib/site-config"
import { formatEventTime } from "@/lib/season-utils"
import { TryoutSlotRequestsManager } from "./tryout-slot-requests-manager"
import { getTryoutSlotRequests, getUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Tryout Slot Requests"
}

export const dynamic = "force-dynamic"

async function getSlotLabelsByWeek(): Promise<Record<number, string[]>> {
    const config = await getSeasonConfig()
    const tryouts = config.seasonId ? getEventsByType(config, "tryout") : []

    const result: Record<number, string[]> = {}
    for (const week of [1, 2, 3]) {
        const slotCount = week === 1 ? 2 : 3
        const timeSlots = tryouts[week - 1]?.timeSlots ?? []
        result[week] = Array.from({ length: slotCount }, (_, index) => {
            const slot = timeSlots[index]
            const timeLabel = slot?.startTime
                ? formatEventTime(slot.startTime)
                : null
            return (
                slot?.slotLabel ??
                (timeLabel
                    ? `Slot ${index + 1} (${timeLabel})`
                    : `Slot ${index + 1}`)
            )
        })
    }
    return result
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
