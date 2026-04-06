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
    SelectGroup,
    SelectItem,
    SelectLabel,
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
import { createAndSendBroadcast } from "./actions"
import type {
    DivisionOption,
    TeamOption,
    TemplateOption,
    BroadcastHistoryItem,
    SendToType
} from "./actions"

interface SendEmailClientProps {
    canSendToAll: boolean
    divisions: DivisionOption[]
    teams: TeamOption[]
    templates: TemplateOption[]
    history: BroadcastHistoryItem[]
}

const EMPTY_CONTENT = normalizeEmailTemplateContent("")

function sendToLabel(
    groupType: string | null,
    divisionId: number | null,
    teamId: number | null,
    divisions: DivisionOption[],
    teams: TeamOption[]
): string {
    if (groupType === "all_users") return "Everyone"
    if (groupType === "season_signups") return "Current Season Players"
    if (groupType === "season_division") {
        const div = divisions.find((d) => d.id === divisionId)
        return div ? `Division: ${div.name}` : "Division"
    }
    if (groupType === "season_team") {
        const team = teams.find((t) => t.id === teamId)
        return team ? `Team: ${team.name}` : "Team"
    }
    return "Unknown"
}

export function SendEmailClient({
    canSendToAll,
    divisions,
    teams,
    templates,
    history: initialHistory
}: SendEmailClientProps) {
    const router = useRouter()

    // Compose form state
    const [sendToType, setSendToType] = useState<SendToType | "">("")
    const [selectedDivisionId, setSelectedDivisionId] = useState<string>("")
    const [selectedTeamId, setSelectedTeamId] = useState<string>("")
    const [subject, setSubject] = useState("")
    const [content, setContent] =
        useState<LexicalEmailTemplateContent>(EMPTY_CONTENT)
    const [editorKey, setEditorKey] = useState(0)

    // Status messages
    const [sendMessage, setSendMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const [sending, setSending] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)

    // Group teams by division for the team dropdown
    const teamsByDivision = divisions
        .map((div) => ({
            division: div,
            teams: teams.filter((t) => t.divisionId === div.id)
        }))
        .filter((g) => g.teams.length > 0)

    const handleSendToTypeChange = useCallback((value: string) => {
        setSendToType(value as SendToType)
        setSelectedDivisionId("")
        setSelectedTeamId("")
        setSendMessage(null)
    }, [])

    const handleTemplateSelect = useCallback(
        (templateId: string) => {
            const template = templates.find((t) => String(t.id) === templateId)
            if (!template) return
            if (template.subject) setSubject(template.subject)
            setContent(template.content)
            setEditorKey((k) => k + 1)
        },
        [templates]
    )

    const handleSendAgain = useCallback(
        (item: BroadcastHistoryItem) => {
            setSubject(item.subject)
            setContent(item.lexicalContent)
            setEditorKey((k) => k + 1)
            setSendMessage(null)

            const type = item.groupType as SendToType | null
            if (type) {
                setSendToType(type)
                if (type === "division" && item.divisionId) {
                    setSelectedDivisionId(String(item.divisionId))
                } else if (type === "team" && item.teamId) {
                    setSelectedTeamId(String(item.teamId))
                    // Also set the division for context
                    const team = teams.find((t) => t.id === item.teamId)
                    if (team) setSelectedDivisionId(String(team.divisionId))
                }
            } else {
                setSendToType("")
            }

            window.scrollTo({ top: 0, behavior: "smooth" })
        },
        [teams]
    )

    const handleSend = async () => {
        setSendMessage(null)

        if (!sendToType) {
            setSendMessage({
                type: "error",
                text: "Please select who to send this email to."
            })
            return
        }
        if (sendToType === "division" && !selectedDivisionId) {
            setSendMessage({
                type: "error",
                text: "Please select a division."
            })
            return
        }
        if (sendToType === "team" && !selectedTeamId) {
            setSendMessage({ type: "error", text: "Please select a team." })
            return
        }
        if (!subject.trim()) {
            setSendMessage({ type: "error", text: "Subject is required." })
            return
        }

        setSending(true)
        try {
            const result = await createAndSendBroadcast({
                sendToType,
                divisionId: selectedDivisionId
                    ? Number(selectedDivisionId)
                    : undefined,
                teamId: selectedTeamId ? Number(selectedTeamId) : undefined,
                subject,
                lexicalContent: content
            })

            if (result.status) {
                setSendMessage({
                    type: "success",
                    text: "Email sent successfully!"
                })
                setSubject("")
                setContent(EMPTY_CONTENT)
                setSendToType("")
                setSelectedDivisionId("")
                setSelectedTeamId("")
                setEditorKey((k) => k + 1)
                router.refresh()
            } else {
                setSendMessage({ type: "error", text: result.message })
            }
        } finally {
            setSending(false)
        }
    }

    const canSend =
        !!sendToType &&
        (sendToType !== "division" || !!selectedDivisionId) &&
        (sendToType !== "team" || !!selectedTeamId) &&
        !!subject.trim()

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

                    {/* Send To */}
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="send-to-select">
                                Send to{" "}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={sendToType}
                                onValueChange={handleSendToTypeChange}
                            >
                                <SelectTrigger id="send-to-select">
                                    <SelectValue placeholder="Select recipients…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {canSendToAll && (
                                        <>
                                            <SelectItem value="everyone">
                                                Everyone
                                            </SelectItem>
                                            <SelectItem value="season">
                                                Current Season Players
                                            </SelectItem>
                                        </>
                                    )}
                                    <SelectItem value="division">
                                        Division
                                    </SelectItem>
                                    <SelectItem value="team">Team</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Division picker */}
                        {sendToType === "division" && (
                            <div className="space-y-1.5 border-muted border-l-2 pl-4">
                                <Label htmlFor="division-select">
                                    Division{" "}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                    value={selectedDivisionId}
                                    onValueChange={setSelectedDivisionId}
                                >
                                    <SelectTrigger id="division-select">
                                        <SelectValue placeholder="Select a division…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {divisions.map((d) => (
                                            <SelectItem
                                                key={d.id}
                                                value={String(d.id)}
                                            >
                                                {d.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Team picker */}
                        {sendToType === "team" && (
                            <div className="space-y-1.5 border-muted border-l-2 pl-4">
                                <Label htmlFor="team-select">
                                    Team{" "}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                    value={selectedTeamId}
                                    onValueChange={setSelectedTeamId}
                                >
                                    <SelectTrigger id="team-select">
                                        <SelectValue placeholder="Select a team…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teamsByDivision.map(
                                            ({ division, teams: divTeams }) => (
                                                <SelectGroup key={division.id}>
                                                    <SelectLabel>
                                                        {division.name}
                                                    </SelectLabel>
                                                    {divTeams.map((t) => (
                                                        <SelectItem
                                                            key={t.id}
                                                            value={String(t.id)}
                                                        >
                                                            {t.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            )
                                        )}
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
                            disabled={sending || !canSend}
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
                                                    →{" "}
                                                    {sendToLabel(
                                                        item.groupType,
                                                        item.divisionId,
                                                        item.teamId,
                                                        divisions,
                                                        teams
                                                    )}
                                                </span>
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
                                                {item.sentCount != null && (
                                                    <span>
                                                        {item.sentCount}{" "}
                                                        recipients
                                                    </span>
                                                )}
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
