"use client"

import { RiAddLine } from "@remixicon/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import type { TemplateSummary } from "@/lib/surveys/templates"
import { SURVEY_LIMITS } from "@/lib/surveys/types"
import { createSurvey } from "./actions"

interface NewSurveyDialogProps {
    templates: TemplateSummary[]
    seasons: { id: number; label: string }[]
}

const NO_SEASON = "none"

/** "New survey" dialog: pick a template and season, name it, and land in the editor. */
export function NewSurveyDialog({ templates, seasons }: NewSurveyDialogProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [templateId, setTemplateId] = useState<string>("")
    const [seasonId, setSeasonId] = useState<string>(NO_SEASON)
    const [title, setTitle] = useState("")

    const available = templates.filter((template) => !template.isArchived)

    function reset() {
        setTemplateId("")
        setSeasonId(NO_SEASON)
        setTitle("")
    }

    async function handleCreate() {
        if (templateId === "") {
            toast.error("Pick a template.")
            return
        }
        if (title.trim() === "") {
            toast.error("Give the survey a title.")
            return
        }
        setBusy(true)
        const result = await createSurvey({
            templateId: Number(templateId),
            seasonId: seasonId === NO_SEASON ? null : Number(seasonId),
            title: title.trim()
        })
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Survey created.")
            setOpen(false)
            reset()
            router.push(`/dashboard/manage-surveys/${result.data.surveyId}`)
        } else {
            toast.error(result.message)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                if (!next) reset()
            }}
        >
            <DialogTrigger asChild>
                <Button type="button">
                    <RiAddLine className="mr-1 h-4 w-4" />
                    New survey
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New survey</DialogTitle>
                    <DialogDescription>
                        Starts as a draft; settings and audience can change
                        until it's published.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-survey-template">Template</Label>
                        <Select
                            value={templateId}
                            onValueChange={setTemplateId}
                            disabled={busy}
                        >
                            <SelectTrigger id="new-survey-template">
                                <SelectValue placeholder="Choose a template" />
                            </SelectTrigger>
                            <SelectContent>
                                {available.map((template) => (
                                    <SelectItem
                                        key={template.id}
                                        value={String(template.id)}
                                    >
                                        {template.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-survey-season">
                            Season (optional)
                        </Label>
                        <Select
                            value={seasonId}
                            onValueChange={setSeasonId}
                            disabled={busy}
                        >
                            <SelectTrigger id="new-survey-season">
                                <SelectValue placeholder="No season" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_SEASON}>
                                    No season
                                </SelectItem>
                                {seasons.map((season) => (
                                    <SelectItem
                                        key={season.id}
                                        value={String(season.id)}
                                    >
                                        {season.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-survey-title">Title</Label>
                        <Input
                            id="new-survey-title"
                            value={title}
                            disabled={busy}
                            maxLength={SURVEY_LIMITS.maxTitleLength}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={busy}
                        onClick={handleCreate}
                    >
                        Create survey
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
