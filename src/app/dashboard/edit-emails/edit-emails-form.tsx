"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { RiArrowDownSLine, RiAddLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"
import { updateEmailTemplate, createEmailTemplate } from "./actions"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent
} from "@/lib/email-template-content"
import { LexicalEmailEditor } from "@/components/email-template/lexical-email-editor"

const SUBJECT_VARIABLES = [
    { key: "division_name", label: "Division Name" },
    { key: "season_name", label: "Season Name" },
    { key: "season_year", label: "Season Year" },
    { key: "user_preferred_name", label: "User Preferred Name" },
    { key: "user_last_name", label: "User Last Name" }
]

interface EmailTemplate {
    id: number
    name: string
    subject: string | null
    content: LexicalEmailTemplateContent
    created_at: Date
    updated_at: Date
}

interface TemplateFormData {
    name: string
    subject: string
    content: LexicalEmailTemplateContent
}

export function EditEmailsForm({ templates }: { templates: EmailTemplate[] }) {
    const router = useRouter()
    const subjectInputRefs = useRef<Map<number, HTMLInputElement>>(new Map())
    const [formData, setFormData] = useState<Record<number, TemplateFormData>>(
        templates.reduce<Record<number, TemplateFormData>>((acc, template) => {
            acc[template.id] = {
                name: template.name,
                subject: template.subject || "",
                content: normalizeEmailTemplateContent(template.content)
            }
            return acc
        }, {})
    )
    const [loading, setLoading] = useState<Record<number, boolean>>({})
    const [messages, setMessages] = useState<
        Record<number, { type: "success" | "error"; text: string }>
    >({})
    useEffect(() => {
        setFormData((prev) => {
            const updated = { ...prev }
            for (const template of templates) {
                if (!updated[template.id]) {
                    updated[template.id] = {
                        name: template.name,
                        subject: template.subject || "",
                        content: normalizeEmailTemplateContent(template.content)
                    }
                }
            }
            return updated
        })
    }, [templates])

    const [createDialogOpen, setCreateDialogOpen] = useState(false)
    const [newTemplateName, setNewTemplateName] = useState("")
    const [createLoading, setCreateLoading] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)

    const handleUpdate = async (templateId: number) => {
        setLoading((prev) => ({ ...prev, [templateId]: true }))
        setMessages((prev) => {
            const newMessages = { ...prev }
            delete newMessages[templateId]
            return newMessages
        })

        const data = formData[templateId]
        const result = await updateEmailTemplate(
            templateId,
            data.name,
            data.subject || null,
            data.content
        )

        setLoading((prev) => ({ ...prev, [templateId]: false }))

        if (result.status) {
            setMessages((prev) => ({
                ...prev,
                [templateId]: { type: "success", text: result.message }
            }))
            router.refresh()
        } else {
            setMessages((prev) => ({
                ...prev,
                [templateId]: { type: "error", text: result.message }
            }))
        }
    }

    const handleInputChange = <K extends keyof TemplateFormData>(
        templateId: number,
        field: K,
        value: TemplateFormData[K]
    ) => {
        setFormData((prev) => ({
            ...prev,
            [templateId]: {
                ...prev[templateId],
                [field]: value
            }
        }))
    }

    const insertSubjectVariable = (templateId: number, variableKey: string) => {
        const input = subjectInputRefs.current.get(templateId)
        if (!input) return
        const start = input.selectionStart ?? input.value.length
        const end = input.selectionEnd ?? input.value.length
        const insertion = `[${variableKey}]`
        const newValue =
            input.value.slice(0, start) + insertion + input.value.slice(end)
        handleInputChange(templateId, "subject", newValue)
        requestAnimationFrame(() => {
            input.focus()
            input.setSelectionRange(
                start + insertion.length,
                start + insertion.length
            )
        })
    }

    const handleCreate = async () => {
        setCreateLoading(true)
        setCreateError(null)
        const result = await createEmailTemplate(newTemplateName)
        setCreateLoading(false)
        if (result.status) {
            setCreateDialogOpen(false)
            setNewTemplateName("")
            router.refresh()
        } else {
            setCreateError(result.message)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={() => setCreateDialogOpen(true)}>
                    <RiAddLine size={16} />
                    Create New Template
                </Button>
            </div>

            <Dialog
                open={createDialogOpen}
                onOpenChange={(open) => {
                    setCreateDialogOpen(open)
                    if (!open) {
                        setNewTemplateName("")
                        setCreateError(null)
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Template</DialogTitle>
                        <DialogDescription>
                            Enter a unique name for the new email template. You
                            can edit the subject and content after creation.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label htmlFor="new-template-name">Template Name</Label>
                        <Input
                            id="new-template-name"
                            value={newTemplateName}
                            onChange={(e) => setNewTemplateName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !createLoading)
                                    handleCreate()
                            }}
                            placeholder="e.g. welcome email"
                            autoFocus
                        />
                        {createError && (
                            <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                                {createError}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCreateDialogOpen(false)}
                            disabled={createLoading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={createLoading}>
                            {createLoading ? "Creating..." : "Create"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {templates.map((template) => (
                <Collapsible key={template.id}>
                    <div className="rounded-lg border bg-card shadow-sm">
                        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50">
                            <h2 className="font-semibold text-xl">
                                {template.name}
                            </h2>
                            <RiArrowDownSLine
                                className="transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                                size={20}
                            />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="space-y-4 border-t p-4">
                                <div className="space-y-2">
                                    <Label htmlFor={`name-${template.id}`}>
                                        Template Name
                                    </Label>
                                    <Input
                                        id={`name-${template.id}`}
                                        value={
                                            formData[template.id]?.name || ""
                                        }
                                        readOnly
                                        className="cursor-not-allowed bg-muted"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor={`subject-${template.id}`}>
                                        Subject (Optional)
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id={`subject-${template.id}`}
                                            ref={(el) => {
                                                if (el) {
                                                    subjectInputRefs.current.set(
                                                        template.id,
                                                        el
                                                    )
                                                } else {
                                                    subjectInputRefs.current.delete(
                                                        template.id
                                                    )
                                                }
                                            }}
                                            value={
                                                formData[template.id]
                                                    ?.subject || ""
                                            }
                                            onChange={(e) =>
                                                handleInputChange(
                                                    template.id,
                                                    "subject",
                                                    e.target.value
                                                )
                                            }
                                            placeholder="Email subject line"
                                        />
                                        <select
                                            className="h-10 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                                            value="default"
                                            onChange={(e) => {
                                                if (
                                                    e.target.value !== "default"
                                                ) {
                                                    insertSubjectVariable(
                                                        template.id,
                                                        e.target.value
                                                    )
                                                    e.target.value = "default"
                                                }
                                            }}
                                            aria-label="Insert subject variable"
                                        >
                                            <option value="default">
                                                Insert variable...
                                            </option>
                                            {SUBJECT_VARIABLES.map((v) => (
                                                <option
                                                    key={v.key}
                                                    value={v.key}
                                                >
                                                    {v.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor={`content-${template.id}`}>
                                        Content
                                    </Label>
                                    <div id={`content-${template.id}`}>
                                        <LexicalEmailEditor
                                            content={
                                                formData[template.id]
                                                    ?.content ||
                                                normalizeEmailTemplateContent(
                                                    ""
                                                )
                                            }
                                            onChange={(value) =>
                                                handleInputChange(
                                                    template.id,
                                                    "content",
                                                    value
                                                )
                                            }
                                        />
                                    </div>
                                </div>

                                {messages[template.id] && (
                                    <div
                                        className={`rounded-md p-3 text-sm ${
                                            messages[template.id].type ===
                                            "success"
                                                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                                        }`}
                                    >
                                        {messages[template.id].text}
                                    </div>
                                )}

                                <div className="flex justify-end">
                                    <Button
                                        onClick={() =>
                                            handleUpdate(template.id)
                                        }
                                        disabled={loading[template.id]}
                                    >
                                        {loading[template.id]
                                            ? "Saving..."
                                            : "Save Changes"}
                                    </Button>
                                </div>
                            </div>
                        </CollapsibleContent>
                    </div>
                </Collapsible>
            ))}
        </div>
    )
}
