"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RiArrowDownSLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateEmailTemplate } from "./actions"

interface EmailTemplate {
    id: number
    name: string
    subject: string | null
    content: string
    created_at: Date
    updated_at: Date
}

interface TemplateFormData {
    name: string
    subject: string
    content: string
}

export function EditEmailsForm({ templates }: { templates: EmailTemplate[] }) {
    const router = useRouter()
    const [formData, setFormData] = useState<Record<number, TemplateFormData>>(
        templates.reduce(
            (acc, template) => ({
                ...acc,
                [template.id]: {
                    name: template.name,
                    subject: template.subject || "",
                    content: template.content
                }
            }),
            {}
        )
    )
    const [loading, setLoading] = useState<Record<number, boolean>>({})
    const [messages, setMessages] = useState<
        Record<number, { type: "success" | "error"; text: string }>
    >({})

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

    const handleInputChange = (
        templateId: number,
        field: keyof TemplateFormData,
        value: string
    ) => {
        setFormData((prev) => ({
            ...prev,
            [templateId]: {
                ...prev[templateId],
                [field]: value
            }
        }))
    }

    return (
        <div className="space-y-4">
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
                                    <Input
                                        id={`subject-${template.id}`}
                                        value={
                                            formData[template.id]?.subject || ""
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
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor={`content-${template.id}`}>
                                        Content
                                    </Label>
                                    <Textarea
                                        id={`content-${template.id}`}
                                        value={
                                            formData[template.id]?.content || ""
                                        }
                                        onChange={(e) =>
                                            handleInputChange(
                                                template.id,
                                                "content",
                                                e.target.value
                                            )
                                        }
                                        placeholder="Email content"
                                        rows={15}
                                        className="font-mono text-sm"
                                    />
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
