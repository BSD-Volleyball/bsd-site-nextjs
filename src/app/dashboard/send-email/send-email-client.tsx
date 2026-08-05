"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { RiArrowDownSLine, RiEyeLine, RiSendPlaneLine } from "@remixicon/react"
import { LexicalEmailEditor } from "@/components/email-template/lexical-email-editor"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent
} from "@/lib/email-template-content"
import {
    EMAIL_SUBJECT_PREFIX,
    stripEmailSubjectPrefix
} from "@/lib/email-subject"
import { site } from "@/config/site"
import { formatShortDate } from "@/lib/season-utils"
import { createAndSendBroadcast, previewBroadcast } from "./actions"
import type {
    BroadcastPreview,
    DivisionOption,
    TeamOption,
    TemplateOption,
    TryoutOption,
    BroadcastHistoryItem,
    SendToType
} from "./actions"

interface SendEmailClientProps {
    canSendToAll: boolean
    divisions: DivisionOption[]
    teams: TeamOption[]
    templates: TemplateOption[]
    tryouts: TryoutOption[]
    history: BroadcastHistoryItem[]
}

/** Sentinel for the "every tryout night" option in the sub-picker. */
const ALL_TRYOUTS = "all"

const EMPTY_CONTENT = normalizeEmailTemplateContent("")

function sendToLabel(
    groupType: string | null,
    divisionId: number | null,
    teamId: number | null,
    eventId: number | null,
    divisions: DivisionOption[],
    teams: TeamOption[],
    tryouts: TryoutOption[]
): string {
    if (groupType === "self") return "Just Me"
    if (groupType === "all_users") return "Everyone"
    if (groupType === "season_signups") return "Current Season Players"
    if (groupType === "season_captains") return "Current Season Captains"
    if (groupType === "season_commissioners")
        return "Current Season Commissioners"
    if (groupType === "all_refs") return "All Refs (All Time)"
    if (groupType === "season_refs") return "Current Season Refs"
    if (groupType === "season_ref_interest")
        return "Interested in Reffing (Current Season)"
    if (groupType === "season_tryout_help")
        return "Willing to Help with Tryouts (Current Season)"
    if (groupType === "season_tryout_volunteers")
        return "Tryout Volunteers (All Tryouts)"
    if (groupType === "season_tryout_volunteers_event") {
        const tryout = tryouts.find((t) => t.id === eventId)
        // A tryout date deleted since the send leaves no ordinal to show.
        return tryout
            ? `Tryout ${tryout.ordinal} Volunteers`
            : "Tryout Volunteers (past tryout)"
    }
    if (groupType === "leadership_group") return "Leadership Group"
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

/** Maps a stored recipient group_type back to the compose form's SendToType. */
function sendToTypeFromGroupType(groupType: string | null): SendToType | null {
    switch (groupType) {
        case "self":
            return "just_me"
        case "all_users":
            return "everyone"
        case "season_signups":
            return "season"
        case "season_captains":
            return "season_captains"
        case "season_commissioners":
            return "season_commissioners"
        case "all_refs":
            return "all_refs"
        case "season_refs":
            return "season_refs"
        case "season_ref_interest":
            return "season_ref_interest"
        case "season_tryout_help":
            return "season_tryout_help"
        case "season_tryout_volunteers":
        case "season_tryout_volunteers_event":
            return "season_tryout_volunteers"
        case "leadership_group":
            return "leadership_group"
        case "season_division":
            return "division"
        case "season_team":
            return "team"
        default:
            return null
    }
}

export function SendEmailClient({
    canSendToAll,
    divisions,
    teams,
    templates,
    tryouts,
    history: initialHistory
}: SendEmailClientProps) {
    const router = useRouter()

    // Compose form state
    const [sendToType, setSendToType] = useState<SendToType | "">("")
    const [selectedDivisionId, setSelectedDivisionId] = useState<string>("")
    const [selectedTeamId, setSelectedTeamId] = useState<string>("")
    const [selectedTryout, setSelectedTryout] = useState<string>(ALL_TRYOUTS)
    // canSendToAll is set from isAdmin server-side, so !canSendToAll means a
    // commissioner — they always CC directors and cannot turn it off. The
    // server enforces this too; the disabled checkbox is only the UI half.
    const directorsForced = !canSendToAll
    const [ccDirectors, setCcDirectors] = useState(directorsForced)
    const [subject, setSubject] = useState("")
    const [content, setContent] =
        useState<LexicalEmailTemplateContent>(EMPTY_CONTENT)
    const [editorKey, setEditorKey] = useState(0)

    const [sending, setSending] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)

    // Preview dialog state
    const [preview, setPreview] = useState<BroadcastPreview | null>(null)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [previewing, setPreviewing] = useState(false)

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
        setSelectedTryout(ALL_TRYOUTS)
    }, [])

    const handleTemplateSelect = useCallback(
        (templateId: string) => {
            const template = templates.find((t) => String(t.id) === templateId)
            if (!template) return
            // Strip any stored prefix so the field never visually doubles the
            // adornment; the send re-applies it either way.
            if (template.subject)
                setSubject(stripEmailSubjectPrefix(template.subject))
            setContent(template.content)
            setEditorKey((k) => k + 1)
        },
        [templates]
    )

    const handleLoadIntoComposer = useCallback(
        (item: BroadcastHistoryItem) => {
            setSubject(stripEmailSubjectPrefix(item.subject))
            setContent(item.lexicalContent)
            setEditorKey((k) => k + 1)

            const type = sendToTypeFromGroupType(item.groupType)
            if (type) {
                setSendToType(type)
                if (type === "division" && item.divisionId) {
                    setSelectedDivisionId(String(item.divisionId))
                } else if (type === "team" && item.teamId) {
                    setSelectedTeamId(String(item.teamId))
                    // Also set the division for context
                    const team = teams.find((t) => t.id === item.teamId)
                    if (team) setSelectedDivisionId(String(team.divisionId))
                } else if (type === "season_tryout_volunteers") {
                    setSelectedTryout(
                        item.eventId ? String(item.eventId) : ALL_TRYOUTS
                    )
                }
            } else {
                setSendToType("")
            }

            window.scrollTo({ top: 0, behavior: "smooth" })
        },
        [teams]
    )

    const validate = (): string | null => {
        if (!sendToType) return "Please select who to send this email to."
        if (sendToType === "division" && !selectedDivisionId)
            return "Please select a division."
        if (sendToType === "team" && !selectedTeamId)
            return "Please select a team."
        if (!stripEmailSubjectPrefix(subject)) return "Subject is required."
        return null
    }

    const broadcastInput = () => ({
        sendToType: sendToType as SendToType,
        divisionId: selectedDivisionId ? Number(selectedDivisionId) : undefined,
        teamId: selectedTeamId ? Number(selectedTeamId) : undefined,
        tryoutEventId:
            sendToType === "season_tryout_volunteers" &&
            selectedTryout !== ALL_TRYOUTS
                ? Number(selectedTryout)
                : undefined,
        ccDirectors: directorsForced || ccDirectors,
        subject,
        lexicalContent: content
    })

    const handlePreview = async () => {
        const error = validate()
        if (error) {
            toast.error(error)
            return
        }

        setPreviewing(true)
        try {
            const result = await previewBroadcast(broadcastInput())
            if (result.status) {
                setPreview(result.data)
                setPreviewOpen(true)
            } else {
                toast.error(result.message)
            }
        } finally {
            setPreviewing(false)
        }
    }

    const handleSend = async () => {
        setSending(true)
        try {
            const result = await createAndSendBroadcast(broadcastInput())

            if (result.status) {
                setPreviewOpen(false)
                setPreview(null)
                toast.success("Email sent successfully!")
                setSubject("")
                setContent(EMPTY_CONTENT)
                setSendToType("")
                setSelectedDivisionId("")
                setSelectedTeamId("")
                setEditorKey((k) => k + 1)
                router.refresh()
            } else {
                setPreviewOpen(false)
                toast.error(result.message)
            }
        } finally {
            setSending(false)
        }
    }

    const canSend =
        !!sendToType &&
        (sendToType !== "division" || !!selectedDivisionId) &&
        (sendToType !== "team" || !!selectedTeamId) &&
        !!stripEmailSubjectPrefix(subject)

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
                                    <SelectItem value="just_me">
                                        Just Me (test send to yourself)
                                    </SelectItem>
                                    {canSendToAll && (
                                        <>
                                            <SelectItem value="everyone">
                                                Everyone
                                            </SelectItem>
                                            <SelectItem value="season">
                                                Current Season Players
                                            </SelectItem>
                                            <SelectItem value="season_captains">
                                                Current Season Captains
                                            </SelectItem>
                                            <SelectItem value="season_commissioners">
                                                Current Season Commissioners
                                            </SelectItem>
                                            <SelectItem value="season_refs">
                                                Current Season Refs
                                            </SelectItem>
                                            <SelectItem value="all_refs">
                                                All Refs (All Time)
                                            </SelectItem>
                                            <SelectItem value="season_ref_interest">
                                                Interested in Reffing (signup
                                                answer)
                                            </SelectItem>
                                            <SelectItem value="season_tryout_help">
                                                Willing to Help with Tryouts
                                                (signup answer)
                                            </SelectItem>
                                            <SelectItem value="season_tryout_volunteers">
                                                Tryout Volunteers (assigned to a
                                                job)
                                            </SelectItem>
                                            <SelectItem value="leadership_group">
                                                Leadership Group (incl. Admins)
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

                        {/* Tryout picker — only for volunteer sends */}
                        {sendToType === "season_tryout_volunteers" && (
                            <div className="space-y-1.5 border-muted border-l-2 pl-4">
                                <Label htmlFor="tryout-select">
                                    Which tryout{" "}
                                    <span className="text-destructive">*</span>
                                </Label>
                                <Select
                                    value={selectedTryout}
                                    onValueChange={setSelectedTryout}
                                >
                                    <SelectTrigger id="tryout-select">
                                        <SelectValue placeholder="Select a tryout…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL_TRYOUTS}>
                                            All Tryouts
                                        </SelectItem>
                                        {tryouts.map((t) => (
                                            <SelectItem
                                                key={t.id}
                                                value={String(t.id)}
                                            >
                                                Tryout {t.ordinal} —{" "}
                                                {formatShortDate(t.eventDate)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-muted-foreground text-xs">
                                    Only volunteers assigned to a job
                                    {selectedTryout === ALL_TRYOUTS
                                        ? " on any tryout night"
                                        : " on that night"}{" "}
                                    are included.
                                </p>
                            </div>
                        )}

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

                        {/* CC Directors — appended to the distribution list;
                            there is no true CC on a broadcast send. */}
                        <div className="flex items-start gap-2 pt-1">
                            <Checkbox
                                id="cc-directors"
                                checked={directorsForced || ccDirectors}
                                disabled={
                                    directorsForced || sendToType === "just_me"
                                }
                                onCheckedChange={(checked) =>
                                    setCcDirectors(checked === true)
                                }
                            />
                            <div className="space-y-0.5">
                                <Label
                                    htmlFor="cc-directors"
                                    className="font-normal"
                                >
                                    CC Directors
                                </Label>
                                <p className="text-muted-foreground text-xs">
                                    {directorsForced
                                        ? `Always included on your sends: ${site.mailDirectors}`
                                        : sendToType === "just_me"
                                          ? "Not included on a test send to yourself."
                                          : `Adds ${site.mailDirectors} to the recipient list.`}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Subject — the [BSD] prefix is added on send, so it is
                        shown as a fixed adornment rather than editable text. */}
                    <div className="space-y-1.5">
                        <Label htmlFor="email-subject">
                            Subject <span className="text-destructive">*</span>
                        </Label>
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 rounded-md border bg-muted px-2.5 py-2 font-medium text-muted-foreground text-sm">
                                {EMAIL_SUBJECT_PREFIX.trim()}
                            </span>
                            <Input
                                id="email-subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Email subject line…"
                            />
                        </div>
                        <p className="text-muted-foreground text-xs">
                            Every broadcast subject starts with{" "}
                            {EMAIL_SUBJECT_PREFIX.trim()} — you don't need to
                            type it. If you do, it won't be doubled.
                        </p>
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

                    <div className="flex justify-end">
                        <Button
                            onClick={handlePreview}
                            disabled={previewing || !canSend}
                        >
                            <RiEyeLine className="mr-2 size-4" />
                            {previewing ? "Preparing preview…" : "Preview"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Preview dialog — final resolved email before anything is sent */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Preview Email</DialogTitle>
                        <DialogDescription>
                            {preview
                                ? `This is what will be sent to ${preview.groupName}${preview.ccDirectors ? " plus the directors group" : ""} (${preview.recipientCount} ${preview.recipientCount === 1 ? "recipient" : "recipients"}).`
                                : ""}
                        </DialogDescription>
                    </DialogHeader>
                    {preview && (
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                            <div className="space-y-1">
                                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                    Subject
                                </p>
                                <p className="font-medium text-sm">
                                    {preview.subject}
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                    Body
                                </p>
                                <div
                                    className="rounded-md border p-4 text-sm"
                                    // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered preview of the admin's own composed email
                                    dangerouslySetInnerHTML={{
                                        __html: preview.html
                                    }}
                                />
                                <p className="text-muted-foreground text-xs">
                                    An unsubscribe link is automatically
                                    appended below the body.
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setPreviewOpen(false)}
                            disabled={sending}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSend} disabled={sending}>
                            <RiSendPlaneLine className="mr-2 size-4" />
                            {sending ? "Sending…" : "Send Email"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                                                        item.eventId,
                                                        divisions,
                                                        teams,
                                                        tryouts
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
                                                        {item.sentCount}
                                                        {item.recipientTotal !=
                                                            null &&
                                                            ` of ${item.recipientTotal}`}{" "}
                                                        recipients
                                                    </span>
                                                )}
                                                {item.recipientTotal != null &&
                                                    item.sentCount != null &&
                                                    item.recipientTotal >
                                                        item.sentCount && (
                                                        <span className="text-amber-600 dark:text-amber-500">
                                                            {item.recipientTotal -
                                                                item.sentCount}{" "}
                                                            not sent
                                                            (suppressed)
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
                                                        ).toLocaleDateString(
                                                            "en-US"
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                handleLoadIntoComposer(item)
                                            }
                                            className="shrink-0"
                                        >
                                            Load Above
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
