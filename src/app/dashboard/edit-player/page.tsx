import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isAdminOrDirectorBySession } from "@/lib/rbac"
import { PageHeader } from "@/components/layout/page-header"
import { EditPlayerForm } from "./edit-player-form"
import { getUsers } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Edit Player"
}

export const revalidate = 300

export default async function EditPlayerPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirectorBySession()

    if (!hasAccess) {
        redirect("/dashboard")
    }

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
