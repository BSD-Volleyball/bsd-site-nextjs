import { redirect } from "next/navigation"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { getIsCommissioner } from "@/app/dashboard/actions"
import { PageHeader } from "@/components/layout/page-header"
import { AddPicturesList } from "./add-pictures-list"
import { getPlayersNeedingPictures } from "./actions"

export const metadata: Metadata = {
    title: "Add Pictures"
}

export const dynamic = "force-dynamic"

export default async function AddPicturesPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await getIsCommissioner()

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
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message ||
                        "Failed to load players missing pictures."}
                </div>
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
