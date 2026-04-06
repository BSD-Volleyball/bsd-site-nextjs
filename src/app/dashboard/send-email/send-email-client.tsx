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
import {
    RiArrowDownSLine,
    RiRefreshLine,
    RiSendPlaneLine
} from "@remixicon/react"
import { LexicalEmailEditor } from "@/components/email-template/lexical-email-editor"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent
} from "@/lib/email-template-content"
import { createAndSendBroadcast, triggerFullResync } from "./actions"
import type {
    SegmentOption,
    TopicOption,
    TemplateOption,
    BroadcastHistoryItem
} from "./actions"

interface SendEmailClientProps {
    segments: SegmentOption[]
    topics: TopicOption[]
    templates: TemplateOption[]
    history: BroadcastHistoryItem[]
    isAdmin: boolean
}

const EMPTY_CONTENT = normalizeEmailTemplateContent("")

export function SendEmailClient({
    segments,
    topics,
    templates,
    history: initialHistory,
    isAdmin
}: SendEmailClientProps) {
    const router = useRouter()

    // Compose form state
    const [selectedSegmentId, setSelectedSegmentId] = useState<string>("")
    const [selectedTopicId, setSelectedTopicId] = useState<string>("")
    const [subject, setSubject] = useState("")
    const [content, setContent] =
        useState<LexicalEmailTemplateContent>(EMPTY_CONTENT)
    const [editorKey, setEditorKey] = useState(0)

    // Status messages
    const [sendMessage, setSendMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)
    const [resyncMessage, setResyncMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    // Loading states
    const [sending, setSending] = useState(false)
    const [resyncing, setResyncing] = useState(false)

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
        setSelectedSegmentId(String(item.segmentId))
        setSelectedTopicId(item.topicId ? String(item.topicId) : "")
        setContent(item.lexicalContent)
        setEditorKey((k) => k + 1)
        setSendMessage(null)
        window.scrollTo({ top: 0, behavior: "smooth" })
    }, [])

    const handleSend = async () => {
        setSendMessage(null)

        if (!selectedSegmentId) {
            setSendMessage({ type: "error", text: "Please select a segment." })
            return
        }
        if (!subject.trim()) {
            setSendMessage({ type: "error", text: "Subject is required." })
            return
        }

        setSending(true)
        try {
            const result = await createAndSendBroadcast({
                segmentDbId: Number(selectedSegmentId),
                topicDbId: selectedTopicId ? Number(selectedTopicId) : null,
                subject,
                lexicalContent: content
            })

            if (result.status) {
                setSendMessage({
                    type: "success",
                    text: "Email sent successfully via Resend."
                })
                // Reset compose form
                setSubject("")
                setContent(EMPTY_CONTENT)
                setSelectedSegmentId("")
                setSelectedTopicId("")
                setEditorKey((k) => k + 1)
                router.refresh()
            } else {
                setSendMessage({ type: "error", text: result.message })
            }
        } finally {
            setSending(false)
        }
    }

    const handleResync = async () => {
        setResyncMessage(null)
        setResyncing(true)
        try {
            const result = await triggerFullResync()
            if (result.status) {
                setResyncMessage({
                    type: "success",
                    text: `Resync complete — ${result.data.synced} synced, ${result.data.failed} failed.`
                })
            } else {
                setResyncMessage({ type: "error", text: result.message })
            }
        } finally {
            setResyncing(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header actions */}
            <div className="flex items-center justify-end gap-3">
                {resyncMessage && (
                    <p
                        className={`text-sm ${resyncMessage.type === "success" ? "text-green-600" : "text-red-600"}`}
                    >
                        {resyncMessage.text}
                    </p>
                )}
                {isAdmin && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResync}
                        disabled={resyncing}
                    >
                        <RiRefreshLine
                            className={`mr-2 size-4 ${resyncing ? "animate-spin" : ""}`}
                        />
                        {resyncing ? "Resyncing..." : "Resync with Resend"}
                    </Button>
                )}
            </div>

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
                        {/* Segment picker */}
                        <div className="space-y-1.5">
                            <Label htmlFor="segment-select">
                                Send to segment{" "}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={selectedSegmentId}
                                onValueChange={setSelectedSegmentId}
                            >
                                <SelectTrigger id="segment-select">
                                    <SelectValue placeholder="Select a segment…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {segments.map((s) => (
                                        <SelectItem
                                            key={s.id}
                                            value={String(s.id)}
                                        >
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Topic picker (optional) */}
                        {topics.length > 0 && (
                            <div className="space-y-1.5">
                                <Label htmlFor="topic-select">
                                    Topic{" "}
                                    <span className="text-muted-foreground text-xs">
                                        (optional)
                                    </span>
                                </Label>
                                <Select
                                    value={selectedTopicId}
                                    onValueChange={setSelectedTopicId}
                                >
                                    <SelectTrigger id="topic-select">
                                        <SelectValue placeholder="All topics" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">
                                            All topics
                                        </SelectItem>
                                        {topics.map((t) => (
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
                                sending || !selectedSegmentId || !subject.trim()
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
                                                <span>
                                                    → {item.segmentName}
                                                </span>
                                                {item.topicName && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-xs"
                                                    >
                                                        {item.topicName}
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
