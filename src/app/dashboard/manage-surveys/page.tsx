import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { StatusBanner } from "@/components/ui/status-banner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { requirePermissionOrRedirect } from "@/next/page-guards"
import { getSurveyTemplates } from "./actions"
import { TemplatesList } from "./templates-list"

export const metadata: Metadata = {
    title: "Manage Surveys"
}

export default async function ManageSurveysPage() {
    await requirePermissionOrRedirect("surveys:manage")

    const result = await getSurveyTemplates()

    return (
        <div className="space-y-6">
            <PageHeader
                title="Manage Surveys"
                description="Build the question templates surveys are run from, and see the surveys themselves."
            />

            <Tabs defaultValue="surveys">
                <TabsList>
                    <TabsTrigger value="surveys">Surveys</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                </TabsList>

                <TabsContent value="surveys">
                    <Card>
                        <CardHeader>
                            <CardTitle>No surveys yet</CardTitle>
                            <CardDescription>
                                Surveys will appear here once Phase 2 ships.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="text-muted-foreground text-sm">
                            Until then, build and preview the templates a survey
                            will be run from.
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="templates">
                    {result.status ? (
                        <TemplatesList templates={result.data} />
                    ) : (
                        <StatusBanner variant="error">
                            {result.message || "Failed to load templates."}
                        </StatusBanner>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
