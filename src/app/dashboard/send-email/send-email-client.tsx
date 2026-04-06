"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { RiArrowDownSLine, RiSendPlaneLine } from "@remixicon/react"
import { LexicalEmailEditor } from "@/components/email-template/lexical-email-editor"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent
} from "@/lib/email-template-content"
import { createAndSendBroadcast, BROADCAST_STREAMS } from "./actions"
import type {
    RecipientGroupOption,
    TemplateOption,
    BroadcastHistoryItem
} from "./actions"

interface SendEmailClientProps {
    groups: RecipientGroupOption[]
    templates: TemplateOption[]
    history: BroadcastHistoryItem[]
}

const EMPTY_CONTENT = normalizeEmailTemplateContent("")

export function SendEmailClient({
    groups,
    templates,
    history: initialHistory
}: SendEmailClientProps) {
    const router = useRouter()

    // Compose form state
    const [selectedGroupId, setSelectedGroupId] = useState<string>("")
    const [selectedStreamId, setSelectedStreamId] = useState<string>(
        BROADCAST_STREAMS[0].id
    )
    const [subject, setSubject] = useState("")
    const [content, setContent] =
        useState<LexicalEmailTemplateContent>(EMPTY_CONTENT)
    const [editorKey, setEditorKey] = useState(0)

    // Status messages
    const [sendMessage, setSendMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    // Loading states
    const [sending, setSending] = useState(false)

    // History expand state
    const [historyOpen, setHistoryOpen] = useState(false)

    const handleTemplateSelect = useCallback(
        (templateId: string) => {
            const template = templates.find((t) => String(t.id) === templateId)
            if (!template) return
            if (template.subject) setSubject(template.subject)
            setContent(template.content)
            // Bump key to force LexicalEmailEditor to remount with new content
            setEditorKey((k) => k + 1)
        },
        [templates]
    )

    const handleSendAgain = useCallback((item: BroadcastHistoryItem) => {
        setSubject(item.subject)
        setSelectedGroupId(item.groupId ? String(item.groupId) : "")
        setSelectedStreamId(item.streamId ?? BROADCAST_STREAMS[0].id)
        setContent(item.lexicalContent)
        setEditorKey((k) => k + 1)
        setSendMessage(null)
        window.scrollTo({ top: 0, behavior: "smooth" })
    }, [])

    const handleSend = async () => {
        setSendMessage(null)

        if (!selectedGroupId) {
            setSendMessage({
                type: "error",
                text: "Please select a recipient group."
            })
            return
        }
        if (!subject.trim()) {
            setSendMessage({ type: "error", text: "Subject is required." })
            return
        }

        setSending(true)
        try {
            const result = await createAndSendBroadcast({
                recipientGroupId: Number(selectedGroupId),
                streamId: selectedStreamId,
                subject,
                lexicalContent: content
            })

            if (result.status) {
                setSendMessage({
                    type: "success",
                    text: `Email sent successfully (${result.data.broadcastId}).`
                })
                setSubject("")
                setContent(EMPTY_CONTENT)
                setSelectedGroupId("")
                setSelectedStreamId(BROADCAST_STREAMS[0].id)
                setEditorKey((k) => k + 1)
                router.refresh()
            } else {
                setSendMessage({ type: "error", text: result.message })
            }
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Compose card */}
            <Card>
                <CardHeader>
                    <CardTitle>Compose Email</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Template picker */}
                    {templates.length > 0 && (
                        <div className="space-y-1.5">
                            <Label>Start from template</Label>
                            <Select onValueChange={handleTemplateSelect}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a template to load…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {templates.map((t) => (
                                        <SelectItem
                                            key={t.id}
                                            value={String(t.id)}
                                        >
                                            {t.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Recipient group picker */}
                        <div className="space-y-1.5">
                            <Label htmlFor="group-select">
                                Send to{" "}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={selectedGroupId}
                                onValueChange={setSelectedGroupId}
                            >
                                <SelectTrigger id="group-select">
                                    <SelectValue placeholder="Select a recipient group…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {groups.map((g) => (
                                        <SelectItem
                                            key={g.id}
                                            value={String(g.id)}
                                        >
                                            {g.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Stream picker */}
                        <div className="space-y-1.5">
                            <Label htmlFor="stream-select">
                                Message stream
                            </Label>
                            <Select
                                value={selectedStreamId}
                                onValueChange={setSelectedStreamId}
                            >
                                <SelectTrigger id="stream-select">
                                    <SelectValue placeholder="Select a stream…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {BROADCAST_STREAMS.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Subject */}
                    <div className="space-y-1.5">
                        <Label htmlFor="email-subject">
                            Subject <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="email-subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Email subject line…"
                        />
                    </div>

                    {/* Rich text editor */}
                    <div className="space-y-1.5">
                        <Label>Body</Label>
                        <LexicalEmailEditor
                            key={editorKey}
                            content={content}
                            onChange={setContent}
                        />
                        <p className="text-muted-foreground text-xs">
                            An unsubscribe link is automatically appended to all
                            broadcast emails.
                        </p>
                    </div>

                    {/* Send status */}
                    {sendMessage && (
                        <p
                            className={`font-medium text-sm ${sendMessage.type === "success" ? "text-green-600" : "text-red-600"}`}
                        >
                            {sendMessage.text}
                        </p>
                    )}

                    <div className="flex justify-end">
                        <Button
                            onClick={handleSend}
                            disabled={
                                sending || !selectedGroupId || !subject.trim()
                            }
                        >
                            <RiSendPlaneLine className="mr-2 size-4" />
                            {sending ? "Sending…" : "Send Email"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Broadcast history */}
            {initialHistory.length > 0 && (
                <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-base">
                            Previous Emails ({initialHistory.length})
                        </h2>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm">
                                <RiArrowDownSLine
                                    className={`size-4 transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`}
                                />
                                <span className="sr-only">Toggle history</span>
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                        <div className="mt-3 space-y-2">
                            {initialHistory.map((item) => (
                                <Card key={item.id} className="py-3">
                                    <CardContent className="flex items-start justify-between gap-4 px-4">
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <p className="truncate font-medium text-sm">
                                                {item.subject}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                                                <span>→ {item.groupName}</span>
                                                {item.streamId && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-xs"
                                                    >
                                                        {item.streamId}
                                                    </Badge>
                                                )}
                                                <Badge
                                                    variant={
                                                        item.status === "sent"
                                                            ? "default"
                                                            : item.status ===
                                                                "failed"
                                                              ? "destructive"
                                                              : "secondary"
                                                    }
                                                    className="text-xs"
                                                >
                                                    {item.status}
                                                </Badge>
                                                <span>
                                                    by {item.sentByName}
                                                </span>
                                                {item.sentAt && (
                                                    <span>
                                                        on{" "}
                                                        {new Date(
                                                            item.sentAt
                                                        ).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                handleSendAgain(item)
                                            }
                                            className="shrink-0"
                                        >
                                            Send Again
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    )
}
