import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { ManageRolesClient } from "./manage-roles-client"
import { getSeasonOptions, getDivisionOptions } from "./actions"
import { isAdminOrDirector } from "@/lib/rbac"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Manage Roles"
}

export const revalidate = 300

export default async function ManageRolesPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const hasAccess = await isAdminOrDirector(session.user.id)

    if (!hasAccess) {
        redirect("/dashboard")
    }

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
