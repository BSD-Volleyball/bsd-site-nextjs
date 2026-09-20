import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { requirePermissionOrRedirect } from "@/next/page-guards"
import { getTemplateTrends } from "../../../actions"
import { TrendsClient } from "./trends-client"

export const metadata: Metadata = {
    title: "Survey Trends"
}

export default async function TemplateTrendsPage({
    params
}: {
    params: Promise<{ templateId: string }>
}) {
    await requirePermissionOrRedirect("surveys:view_results")

    const { templateId } = await params
    const id = Number(templateId)
    if (!Number.isInteger(id) || id <= 0) notFound()

    const result = await getTemplateTrends(id)

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader title="Survey Trends" />
                <StatusBanner variant="error">
                    {result.message || "Failed to load trends."}
                </StatusBanner>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.data.template.name} — Trends`}
                description="How each question has trended across every survey run from this template."
            />
            <TrendsClient trends={result.data.trends} />
        </div>
    )
}
