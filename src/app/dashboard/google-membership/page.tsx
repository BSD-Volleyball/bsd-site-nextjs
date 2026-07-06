import { requireAdminOrRedirect } from "@/lib/page-guards"
import { StatusBanner } from "@/components/ui/status-banner"
import { PageHeader } from "@/components/layout/page-header"
import { getGoogleMembershipUsers } from "./actions"
import { GoogleMembershipTable } from "./google-membership-table"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Google Membership"
}

export const revalidate = 300

interface GoogleMembershipPageProps {
    searchParams?: Promise<{
        q?: string
        page?: string
        filter?: string
    }>
}

export default async function GoogleMembershipPage({
    searchParams
}: GoogleMembershipPageProps) {
    const resolvedSearchParams = searchParams ? await searchParams : undefined
    const query = resolvedSearchParams?.q ?? ""
    const pageRaw = Number.parseInt(resolvedSearchParams?.page ?? "1", 10)
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const filterRaw = resolvedSearchParams?.filter ?? ""
    const filter =
        filterRaw === "notification" || filterRaw === "season" ? filterRaw : ""

    await requireAdminOrRedirect()

    const result = await getGoogleMembershipUsers({
        query,
        page,
        limit: 50,
        filter
    })

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Google Membership"
                    description="Manage seasons and notification list membership values for users."
                />
                <StatusBanner variant="error">
                    {result.message || "Failed to load users."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Google Membership"
                description="Edit list membership values for each user."
            />
            <GoogleMembershipTable
                users={result.users}
                initialQuery={result.query}
                initialFilter={result.filter}
                page={result.page}
                totalPages={result.totalPages}
                total={result.total}
            />
        </div>
    )
}
