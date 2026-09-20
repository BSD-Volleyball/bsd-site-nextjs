import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBanner } from "@/components/ui/status-banner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { requirePermissionOrRedirect } from "@/next/page-guards"
import {
    getSurveyEditorOptions,
    getSurveys,
    getSurveyTemplates
} from "./actions"
import { SurveysList } from "./surveys-list"
import { TemplatesList } from "./templates-list"

export const metadata: Metadata = {
    title: "Manage Surveys"
}

export default async function ManageSurveysPage() {
    await requirePermissionOrRedirect("surveys:manage")

    const [templatesResult, surveysResult, optionsResult] = await Promise.all([
        getSurveyTemplates(),
        getSurveys(),
        getSurveyEditorOptions()
    ])

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
                    {surveysResult.status &&
                    templatesResult.status &&
                    optionsResult.status ? (
                        <SurveysList
                            surveys={surveysResult.data}
                            templates={templatesResult.data}
                            seasons={optionsResult.data.seasons}
                        />
                    ) : (
                        <StatusBanner variant="error">
                            {(!surveysResult.status && surveysResult.message) ||
                                (!templatesResult.status &&
                                    templatesResult.message) ||
                                (!optionsResult.status &&
                                    optionsResult.message) ||
                                "Failed to load surveys."}
                        </StatusBanner>
                    )}
                </TabsContent>

                <TabsContent value="templates">
                    {templatesResult.status ? (
                        <TemplatesList templates={templatesResult.data} />
                    ) : (
                        <StatusBanner variant="error">
                            {templatesResult.message ||
                                "Failed to load templates."}
                        </StatusBanner>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
