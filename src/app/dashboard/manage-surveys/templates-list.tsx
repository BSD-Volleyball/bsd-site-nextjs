"use client"

import { RiAddLine, RiSurveyLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBanner } from "@/components/ui/status-banner"
import { Textarea } from "@/components/ui/textarea"
import type { TemplateSummary } from "@/lib/surveys/templates"
import { SURVEY_LIMITS } from "@/lib/surveys/types"
import {
    archiveSurveyTemplate,
    createSurveyTemplate,
    restoreSurveyTemplate
} from "./actions"

function templateHref(templateId: number): string {
    return `/dashboard/manage-surveys/templates/${templateId}`
}

function trendsHref(templateId: number): string {
    return `/dashboard/manage-surveys/templates/${templateId}/trends`
}

/** The template bank: create, open, archive and restore. */
export function TemplatesList({ templates }: { templates: TemplateSummary[] }) {
    const router = useRouter()
    const [showCreate, setShowCreate] = useState(false)
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [busy, setBusy] = useState(false)
    const [pendingArchive, setPendingArchive] =
        useState<TemplateSummary | null>(null)

    const active = templates.filter((template) => !template.isArchived)
    const archived = templates.filter((template) => template.isArchived)

    async function handleCreate() {
        if (name.trim() === "") {
            toast.error("Give the template a name.")
            return
        }
        setBusy(true)
        const result = await createSurveyTemplate({
            name: name.trim(),
            description: description.trim() === "" ? null : description.trim()
        })
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Template created.")
            setName("")
            setDescription("")
            setShowCreate(false)
            router.push(templateHref(result.data.templateId))
        } else {
            toast.error(result.message)
        }
    }

    async function handleArchive(template: TemplateSummary) {
        setBusy(true)
        const result = await archiveSurveyTemplate(template.id)
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Template archived.")
            router.refresh()
        } else {
            toast.error(result.message)
        }
    }

    async function handleRestore(template: TemplateSummary) {
        setBusy(true)
        const result = await restoreSurveyTemplate(template.id)
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Template restored.")
            router.refresh()
        } else {
            toast.error(result.message)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setShowCreate((open) => !open)}
                >
                    <RiAddLine className="mr-1 h-4 w-4" />
                    New template
                </Button>
            </div>

            {showCreate && (
                <Card>
                    <CardHeader>
                        <CardTitle>New template</CardTitle>
                        <CardDescription>
                            Questions are added once the template exists.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-template-name">Name</Label>
                            <Input
                                id="new-template-name"
                                value={name}
                                disabled={busy}
                                maxLength={SURVEY_LIMITS.maxTitleLength}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-template-description">
                                Description (optional)
                            </Label>
                            <Textarea
                                id="new-template-description"
                                value={description}
                                rows={2}
                                disabled={busy}
                                onChange={(event) =>
                                    setDescription(event.target.value)
                                }
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                disabled={busy}
                                onClick={handleCreate}
                            >
                                Create template
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setShowCreate(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {active.length === 0 ? (
                <StatusBanner variant="info">
                    No templates yet. Create one to start building a survey.
                </StatusBanner>
            ) : (
                <div className="space-y-3">
                    {active.map((template) => (
                        <Card key={template.id}>
                            <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                                <RiSurveyLine className="h-5 w-5 text-muted-foreground" />
                                <div className="min-w-48 grow">
                                    <Link
                                        href={templateHref(template.id)}
                                        className="font-medium hover:underline"
                                    >
                                        {template.name}
                                    </Link>
                                    {template.description && (
                                        <p className="text-muted-foreground text-sm">
                                            {template.description}
                                        </p>
                                    )}
                                </div>
                                <Badge variant="outline">
                                    {template.questionCount} question
                                    {template.questionCount === 1 ? "" : "s"}
                                </Badge>
                                <Badge variant="outline">
                                    {template.surveyCount} survey
                                    {template.surveyCount === 1 ? "" : "s"}
                                </Badge>
                                {template.openSurveyCount > 0 && (
                                    <Badge>
                                        {template.openSurveyCount} open
                                    </Badge>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    asChild
                                >
                                    <Link href={templateHref(template.id)}>
                                        Edit
                                    </Link>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    asChild
                                >
                                    <Link href={trendsHref(template.id)}>
                                        Trends
                                    </Link>
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => setPendingArchive(template)}
                                >
                                    Archive
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {archived.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Archived templates</CardTitle>
                        <CardDescription>
                            Hidden from new surveys. Past surveys keep working.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {archived.map((template) => (
                            <div
                                key={template.id}
                                className="flex flex-wrap items-center gap-3 rounded-md border p-2"
                            >
                                <Link
                                    href={templateHref(template.id)}
                                    className="grow text-sm hover:underline"
                                >
                                    {template.name}
                                </Link>
                                <Badge variant="outline">
                                    {template.questionCount} question
                                    {template.questionCount === 1 ? "" : "s"}
                                </Badge>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    asChild
                                >
                                    <Link href={trendsHref(template.id)}>
                                        Trends
                                    </Link>
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => handleRestore(template)}
                                >
                                    Restore
                                </Button>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <AlertDialog
                open={pendingArchive !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingArchive(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Archive this template?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingArchive
                                ? `"${pendingArchive.name}" disappears from the list new surveys pick from. Surveys already run from it keep working, and you can restore it at any time.`
                                : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const target = pendingArchive
                                setPendingArchive(null)
                                if (target) void handleArchive(target)
                            }}
                        >
                            Archive
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
