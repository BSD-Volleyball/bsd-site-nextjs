"use client"

import { RiAddLine, RiArrowLeftLine, RiSaveLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { SurveyPreview } from "@/components/surveys/survey-preview"
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { StatusBanner } from "@/components/ui/status-banner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { QUESTION_TYPE_DEFS, optionsOf } from "@/lib/surveys/question-types"
import type { TemplateQuestionInput } from "@/lib/surveys/template-rules"
import type { TemplateEditorData } from "@/lib/surveys/templates"
import {
    SURVEY_LIMITS,
    SURVEY_QUESTION_TYPES,
    type SurveyQuestionDef,
    type SurveyQuestionType
} from "@/lib/surveys/types"
import { validateVisibilityGraph } from "@/lib/surveys/visibility"
import {
    getSurveyTemplateEditor,
    restoreTemplateQuestion,
    saveTemplateQuestions,
    updateSurveyTemplate
} from "./actions"
import { QuestionEditorCard, type QuestionDraft } from "./question-editor-card"
import { visibilityErrors } from "./visibility-editor"

let keyCounter = 0
function nextKey() {
    keyCounter += 1
    return keyCounter
}

type EditorQuestion = TemplateEditorData["questions"][number]

function toDraft(question: EditorQuestion): QuestionDraft {
    return {
        key: nextKey(),
        id: question.id,
        type: question.type,
        prompt: question.prompt,
        helpText: question.helpText ?? "",
        required: question.required,
        config: question.config,
        visibility: question.visibility,
        hasAnswers: question.hasAnswers,
        savedOptionKeys: optionsOf(question.config).map((option) => option.key)
    }
}

/**
 * The draft as the pure modules see it. New questions have no id yet, so they
 * borrow a negative one: nothing can point at them, and the ordering checks
 * only ever compare sort orders, which are the list indexes.
 */
function toQuestionDef(draft: QuestionDraft, index: number): SurveyQuestionDef {
    return {
        id: draft.id ?? -draft.key,
        sortOrder: index,
        type: draft.type,
        prompt: draft.prompt,
        helpText: draft.helpText.trim() === "" ? null : draft.helpText.trim(),
        required: draft.required,
        config: draft.config,
        visibility: draft.visibility,
        archivedAt: null
    }
}

function toPayload(drafts: QuestionDraft[]): TemplateQuestionInput[] {
    return drafts.map((draft) => ({
        id: draft.id,
        type: draft.type,
        prompt: draft.prompt.trim(),
        helpText: draft.helpText.trim() === "" ? null : draft.helpText.trim(),
        required: draft.required,
        config: draft.config,
        visibility: draft.visibility
    }))
}

export function TemplateEditor({ data }: { data: TemplateEditorData }) {
    const router = useRouter()

    const [template, setTemplate] = useState(data.template)
    const [name, setName] = useState(data.template.name)
    const [description, setDescription] = useState(
        data.template.description ?? ""
    )
    const [drafts, setDrafts] = useState<QuestionDraft[]>(() =>
        data.questions
            .filter((question) => question.archivedAt === null)
            .map(toDraft)
    )
    const [archived, setArchived] = useState<EditorQuestion[]>(() =>
        data.questions.filter((question) => question.archivedAt !== null)
    )
    const [baseline, setBaseline] = useState(() =>
        JSON.stringify(
            toPayload(
                data.questions
                    .filter((question) => question.archivedAt === null)
                    .map(toDraft)
            )
        )
    )

    const [newType, setNewType] = useState<SurveyQuestionType>("single_choice")
    const [busy, setBusy] = useState(false)
    const [pendingRemoval, setPendingRemoval] = useState<QuestionDraft | null>(
        null
    )
    const [pendingRestore, setPendingRestore] = useState<EditorQuestion | null>(
        null
    )
    const [draggingKey, setDraggingKey] = useState<number | null>(null)
    const [dragOverKey, setDragOverKey] = useState<number | null>(null)

    const defs = useMemo(() => drafts.map(toQuestionDef), [drafts])

    /** Earlier, answerable, already-saved questions each row may branch on. */
    const candidatesByIndex = useMemo(
        () =>
            drafts.map((_, index) =>
                defs
                    .slice(0, index)
                    .filter(
                        (def, defIndex) =>
                            drafts[defIndex].id !== null &&
                            QUESTION_TYPE_DEFS[def.type].hasAnswer
                    )
            ),
        [drafts, defs]
    )

    const questionErrors = useMemo(
        () =>
            drafts.map((draft, index) => {
                const errors: string[] = []
                if (draft.prompt.trim() === "") {
                    errors.push(
                        draft.type === "section"
                            ? "Add a heading."
                            : "Add a prompt."
                    )
                }
                const configError = QUESTION_TYPE_DEFS[
                    draft.type
                ].validateConfig(draft.config)
                if (configError) errors.push(configError)
                errors.push(
                    ...visibilityErrors(
                        draft.visibility,
                        candidatesByIndex[index]
                    )
                )
                return errors
            }),
        [drafts, candidatesByIndex]
    )

    const graphErrors = useMemo(() => validateVisibilityGraph(defs), [defs])

    const hasErrors =
        graphErrors.length > 0 ||
        questionErrors.some((errors) => errors.length > 0)
    const dirty = JSON.stringify(toPayload(drafts)) !== baseline

    function applyData(next: TemplateEditorData) {
        const active = next.questions.filter(
            (question) => question.archivedAt === null
        )
        const nextDrafts = active.map(toDraft)
        setTemplate(next.template)
        setName(next.template.name)
        setDescription(next.template.description ?? "")
        setDrafts(nextDrafts)
        setArchived(
            next.questions.filter((question) => question.archivedAt !== null)
        )
        setBaseline(JSON.stringify(toPayload(nextDrafts)))
    }

    async function reload() {
        const result = await getSurveyTemplateEditor(template.id)
        if (result.status && result.data) applyData(result.data)
    }

    function updateDraft(key: number, patch: Partial<QuestionDraft>) {
        setDrafts((previous) =>
            previous.map((draft) =>
                draft.key === key ? { ...draft, ...patch } : draft
            )
        )
    }

    function moveDraft(from: number, to: number) {
        if (from === to || to < 0 || to >= drafts.length) return
        setDrafts((previous) => {
            const next = [...previous]
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            return next
        })
    }

    function addQuestion() {
        if (drafts.length >= SURVEY_LIMITS.maxQuestions) {
            toast.error(
                `A template can hold at most ${SURVEY_LIMITS.maxQuestions} questions.`
            )
            return
        }
        setDrafts((previous) => [
            ...previous,
            {
                key: nextKey(),
                id: null,
                type: newType,
                prompt: "",
                helpText: "",
                required: false,
                config: QUESTION_TYPE_DEFS[newType].defaultConfig(),
                visibility: { conditions: [], roleTags: [] },
                hasAnswers: false,
                savedOptionKeys: []
            }
        ])
    }

    async function handleSaveDetails() {
        if (name.trim() === "") {
            toast.error("Give the template a name.")
            return
        }
        setBusy(true)
        const result = await updateSurveyTemplate(template.id, {
            name: name.trim(),
            description: description.trim() === "" ? null : description.trim()
        })
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Template saved.")
            setTemplate({
                ...template,
                name: name.trim(),
                description:
                    description.trim() === "" ? null : description.trim()
            })
            router.refresh()
        } else {
            toast.error(result.message)
        }
    }

    async function handleSaveQuestions() {
        if (hasErrors) {
            toast.error("Fix the highlighted problems first.")
            return
        }
        setBusy(true)
        const result = await saveTemplateQuestions(
            template.id,
            toPayload(drafts)
        )
        if (result.status) {
            await reload()
            setBusy(false)
            toast.success(result.message ?? "Questions saved.")
            router.refresh()
        } else {
            setBusy(false)
            toast.error(result.message)
        }
    }

    async function handleRestore(question: EditorQuestion) {
        setBusy(true)
        const result = await restoreTemplateQuestion(template.id, question.id)
        if (result.status) {
            await reload()
            setBusy(false)
            toast.success(result.message ?? "Question restored.")
            router.refresh()
        } else {
            setBusy(false)
            toast.error(result.message)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/dashboard/manage-surveys">
                        <RiArrowLeftLine className="mr-1 h-4 w-4" />
                        All templates
                    </Link>
                </Button>
                {template.isArchived && (
                    <Badge variant="secondary">Archived</Badge>
                )}
                {data.surveys.length > 0 && (
                    <span className="text-muted-foreground text-sm">
                        Used by {data.surveys.length} survey
                        {data.surveys.length === 1 ? "" : "s"}
                    </span>
                )}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Template details</CardTitle>
                    <CardDescription>
                        The name and blurb admins see when they pick a template.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="template-name">Name</Label>
                        <Input
                            id="template-name"
                            value={name}
                            disabled={busy}
                            maxLength={SURVEY_LIMITS.maxTitleLength}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="template-description">
                            Description (optional)
                        </Label>
                        <Textarea
                            id="template-description"
                            value={description}
                            rows={2}
                            disabled={busy}
                            onChange={(event) =>
                                setDescription(event.target.value)
                            }
                        />
                    </div>
                    <Button
                        type="button"
                        disabled={busy}
                        onClick={handleSaveDetails}
                    >
                        Save details
                    </Button>
                </CardContent>
            </Card>

            <Tabs defaultValue="questions">
                <TabsList>
                    <TabsTrigger value="questions">
                        Questions ({drafts.length})
                    </TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="questions" className="space-y-4">
                    {graphErrors.length > 0 && (
                        <StatusBanner variant="error">
                            <ul className="space-y-1">
                                {graphErrors.map((error) => (
                                    <li key={error}>{error}</li>
                                ))}
                            </ul>
                        </StatusBanner>
                    )}

                    {data.surveys.some(
                        (survey) => survey.status !== "draft"
                    ) && (
                        <StatusBanner variant="warning">
                            Surveys have already run from this template. A
                            question with responses keeps its type, scale and
                            existing options.
                        </StatusBanner>
                    )}

                    {drafts.length === 0 && (
                        <StatusBanner variant="info">
                            No questions yet. Pick a type below and add the
                            first one.
                        </StatusBanner>
                    )}

                    <div className="space-y-4">
                        {drafts.map((draft, index) => (
                            <QuestionEditorCard
                                key={draft.key}
                                draft={draft}
                                index={index}
                                total={drafts.length}
                                candidates={candidatesByIndex[index]}
                                errors={questionErrors[index]}
                                disabled={busy}
                                onChange={(patch) =>
                                    updateDraft(draft.key, patch)
                                }
                                onRemove={() => setPendingRemoval(draft)}
                                onMove={(delta) =>
                                    moveDraft(index, index + delta)
                                }
                                draggingKey={draggingKey}
                                dragOverKey={dragOverKey}
                                onDraggingKeyChange={setDraggingKey}
                                onDragOverKeyChange={setDragOverKey}
                                onDropOn={(targetKey) => {
                                    if (draggingKey === null) return
                                    moveDraft(
                                        drafts.findIndex(
                                            (item) => item.key === draggingKey
                                        ),
                                        drafts.findIndex(
                                            (item) => item.key === targetKey
                                        )
                                    )
                                }}
                            />
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={newType}
                            disabled={busy}
                            onValueChange={(value) =>
                                setNewType(value as SurveyQuestionType)
                            }
                        >
                            <SelectTrigger
                                className="w-56"
                                aria-label="New question type"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SURVEY_QUESTION_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {QUESTION_TYPE_DEFS[type].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={addQuestion}
                        >
                            <RiAddLine className="mr-1 h-4 w-4" />
                            Add question
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                        <Button
                            type="button"
                            disabled={busy || hasErrors}
                            onClick={handleSaveQuestions}
                        >
                            <RiSaveLine className="mr-1 h-4 w-4" />
                            {busy ? "Saving..." : "Save questions"}
                        </Button>
                        {dirty && (
                            <span className="text-muted-foreground text-sm">
                                You have unsaved changes.
                            </span>
                        )}
                    </div>

                    {archived.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Archived questions</CardTitle>
                                <CardDescription>
                                    Kept so past responses still resolve.
                                    Restoring one puts it back at the end of the
                                    list.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {archived.map((question) => (
                                    <div
                                        key={question.id}
                                        className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                                    >
                                        <span className="grow text-sm">
                                            {question.prompt}
                                        </span>
                                        <Badge variant="outline">
                                            {
                                                QUESTION_TYPE_DEFS[
                                                    question.type
                                                ].label
                                            }
                                        </Badge>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() =>
                                                setPendingRestore(question)
                                            }
                                        >
                                            Restore
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="preview">
                    <Card>
                        <CardHeader>
                            <CardTitle>Preview</CardTitle>
                            <CardDescription>
                                The questions as they stand right now, unsaved
                                edits included. Nothing here is recorded.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <SurveyPreview questions={defs} roleTags={[]} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <AlertDialog
                open={pendingRemoval !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingRemoval(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Remove this question?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingRemoval?.hasAnswers
                                ? "It already has responses, so saving will archive it instead of deleting it. The responses stay."
                                : "Saving will delete it from the template for good."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingRemoval) {
                                    setDrafts((previous) =>
                                        previous.filter(
                                            (draft) =>
                                                draft.key !== pendingRemoval.key
                                        )
                                    )
                                }
                                setPendingRemoval(null)
                            }}
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={pendingRestore !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingRestore(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Restore this question?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            It goes back into the active list right away, and
                            the question list reloads — any unsaved edits are
                            lost.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const target = pendingRestore
                                setPendingRestore(null)
                                if (target) void handleRestore(target)
                            }}
                        >
                            Restore
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
