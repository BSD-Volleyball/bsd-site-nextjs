import { requireAdminOrRedirect } from "@/lib/page-guards"
import { PageHeader } from "@/components/layout/page-header"
import { ManageRolesClient } from "./manage-roles-client"
import { getSeasonOptions, getDivisionOptions } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Manage Roles"
}

export const revalidate = 300

export default async function ManageRolesPage() {
    await requireAdminOrRedirect()

    const [seasons, divisions] = await Promise.all([
        getSeasonOptions(),
        getDivisionOptions()
    ])

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manage Roles"
                description="Assign and revoke roles for users. Season-bound roles (commissioner, captain, etc.) are scoped to a specific season and optionally a division."
            />
            <ManageRolesClient seasons={seasons} divisions={divisions} />
        </div>
    )
}
