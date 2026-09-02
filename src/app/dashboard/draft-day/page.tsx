import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

/** Legacy route — Draft Day is now Draft Setup, Step 2. */
export default async function LegacyDraftDayPage({
    searchParams
}: {
    searchParams: Promise<{ divisionId?: string }>
}) {
    const { divisionId } = await searchParams
    redirect(
        divisionId
            ? `/dashboard/draft-setup/order?divisionId=${encodeURIComponent(divisionId)}`
            : "/dashboard/draft-setup/order"
    )
}
