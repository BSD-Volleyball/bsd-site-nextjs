import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { getFriendsPageData } from "./data"
import { FriendsPageClient } from "./friends-page-client"

export const metadata: Metadata = {
    title: "Friends"
}

export default async function FriendsPage() {
    const session = await requireSessionOrRedirect()
    const data = await getFriendsPageData(session.user.id)

    return (
        <div className="space-y-6">
            <PageHeader
                title="Friends"
                description="Follow other players to see where and when they play next."
            />
            <FriendsPageClient data={data} />
        </div>
    )
}
