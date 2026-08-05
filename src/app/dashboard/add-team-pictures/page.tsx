import { redirect } from "next/navigation"
import { playerPicBaseUrl } from "@/config/env"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/lib/rbac"
import { getSeasonOptionsForPictures, getTeamsForPicturePage } from "./actions"
import { AddTeamPicturesClient } from "./add-team-pictures-client"

export default async function AddTeamPicturesPage() {
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

    const [result, seasonOptions] = await Promise.all([
        getTeamsForPicturePage(),
        // Empty for non-admins, which hides the selector entirely.
        getSeasonOptionsForPictures()
    ])
    const playerPicUrl = playerPicBaseUrl()

    return (
        <div className="space-y-6">
            <h1 className="font-bold text-2xl">Add Team Pictures</h1>
            <AddTeamPicturesClient
                divisions={result.divisions}
                picBaseUrl={playerPicUrl}
                seasonOptions={seasonOptions}
                currentSeasonId={config.seasonId}
            />
        </div>
    )
}
