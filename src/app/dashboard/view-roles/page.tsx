import { requireAdminOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { playerPicBaseUrl } from "@/config/env"
import { ViewRolesClient } from "./view-roles-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "View Roles"
}

export default async function ViewRolesPage() {
    await requireAdminOrRedirect()

    return (
        <div className="space-y-6">
            <PageHeader
                title="View Roles"
                description="Select a role to see everyone who holds it, along with the season and division each assignment is scoped to."
            />
            <ViewRolesClient playerPicUrl={playerPicBaseUrl()} />
        </div>
    )
}
