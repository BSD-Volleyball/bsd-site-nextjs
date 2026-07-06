import { redirect } from "next/navigation"
import { StatusBanner } from "@/components/ui/status-banner"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import type { Metadata } from "next"
import { hasPermissionBySession } from "@/lib/rbac"
import { getSeasonConfig } from "@/lib/site-config"
import { PageHeader } from "@/components/layout/page-header"
import { AddPicturesList } from "./add-pictures-list"
import { getPlayersNeedingPictures } from "./actions"

export const metadata: Metadata = {
    title: "Add Pictures"
}

export const revalidate = 300

export default async function AddPicturesPage() {
    await requireSessionOrRedirect()

    const config = await getSeasonConfig()
    const hasAccess =
        !!config.seasonId &&
        (await hasPermissionBySession("pictures:manage", {
            seasonId: config.seasonId
        }))

    if (!hasAccess) {
        redirect("/dashboard")
    }

    const result = await getPlayersNeedingPictures()

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Add Pictures"
                    description="Capture and upload pictures for current-season signups missing player photos."
                />
                <StatusBanner variant="error">
                    {result.message ||
                        "Failed to load players missing pictures."}
                </StatusBanner>
            </div>
        )
    }

    const seasonPrefix = result.seasonLabel ? `${result.seasonLabel} ` : ""

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${seasonPrefix}Add Pictures`}
                description="Use your phone camera to quickly add pictures for players without one."
            />
            <AddPicturesList initialPlayers={result.players} />
        </div>
    )
}
