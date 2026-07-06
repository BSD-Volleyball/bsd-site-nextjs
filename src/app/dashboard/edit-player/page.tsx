import { requireAdminOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { EditPlayerForm } from "./edit-player-form"
import { getUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Player"
}

export const revalidate = 300

export default async function EditPlayerPage() {
    await requireAdminOrRedirect()

    const usersData = await getUsers()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Edit Player"
                description="View and edit player details."
            />
            <EditPlayerForm
                users={usersData}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
