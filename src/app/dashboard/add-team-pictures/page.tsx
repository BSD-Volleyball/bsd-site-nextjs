import { redirect } from "next/navigation"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { getSeasonConfig } from "@/lib/site-config"
import { hasPermissionBySession } from "@/lib/rbac"
import { getTeamsForPicturePage } from "./actions"
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

    const result = await getTeamsForPicturePage()
    const playerPicUrl = process.env.PLAYER_PIC_URL ?? ""

    return (
        <div className="space-y-6">
            <h1 className="font-bold text-2xl">Add Team Pictures</h1>
            <AddTeamPicturesClient
                divisions={result.divisions}
                picBaseUrl={playerPicUrl}
            />
        </div>
    )
}
