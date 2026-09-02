import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { requireSessionOrRedirect } from "@/lib/page-guards"
import { getIsCommissioner } from "@/app/dashboard/access-actions"

export const dynamic = "force-dynamic"

/**
 * Shared shell for the two Draft Setup steps (rounds → order). The
 * division-specific status lives in each step's page because layouts don't
 * receive searchParams; this only guards access and draws the header.
 */
export default async function DraftSetupLayout({
    children
}: {
    children: ReactNode
}) {
    await requireSessionOrRedirect()
    if (!(await getIsCommissioner())) {
        redirect("/dashboard")
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Draft Setup"
                description="Two steps, in order: seat the captains, then set the draft order. The live draft board opens once both are locked."
            />
            {children}
        </div>
    )
}
