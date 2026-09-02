import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function DraftSetupIndexPage({
    searchParams
}: {
    searchParams: Promise<{ divisionId?: string }>
}) {
    const { divisionId } = await searchParams
    redirect(
        divisionId
            ? `/dashboard/draft-setup/rounds?divisionId=${encodeURIComponent(divisionId)}`
            : "/dashboard/draft-setup/rounds"
    )
}
