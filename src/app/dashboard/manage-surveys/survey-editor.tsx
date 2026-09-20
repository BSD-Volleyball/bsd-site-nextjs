"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { StatusBanner } from "@/components/ui/status-banner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { LEAGUE_TIME_ZONE } from "@/lib/date-utils"
import { EMPTY_AUDIENCE, SURVEY_LIMITS } from "@/lib/surveys/types"
import type { SurveyEditorData } from "@/lib/surveys/surveys"
import {
    closeSurvey,
    deleteSurvey,
    previewSurveyAudience,
    publishSurvey,
    sendSurveyReminderNow,
    updateSurveySettings,
    type AudiencePreview,
    type SurveyEditorOptionsPayload
} from "./actions"
import { AudienceBuilder } from "./audience-builder"
import {
    formatLeagueDateTime,
    isoToLeagueLocal,
    leagueLocalToIso
} from "./league-datetime"
import { RecipientsTable } from "./recipients-table"

interface SurveyEditorProps {
    surveyId: number
    data: SurveyEditorData
    options: SurveyEditorOptionsPayload
}

const NO_SEASON = "none"

/** The survey editor: settings, audience, and (once published) the recipients panel. */
export function SurveyEditor({ surveyId, data, options }: SurveyEditorProps) {
    const router = useRouter()
    const { survey, templateName, recipients } = data

    const [title, setTitle] = useState(survey.title)
    const [intro, setIntro] = useState(survey.intro ?? "")
    const [seasonId, setSeasonId] = useState<string>(
        survey.season_id ? String(survey.season_id) : NO_SEASON
    )
    const [isAnonymous, setIsAnonymous] = useState(survey.is_anonymous)
    const [opensAt, setOpensAt] = useState(
        survey.opens_at ? isoToLeagueLocal(new Date(survey.opens_at)) : ""
    )
    const [closesAt, setClosesAt] = useState(
        survey.closes_at ? isoToLeagueLocal(new Date(survey.closes_at)) : ""
    )
    const [reminderIntervalDays, setReminderIntervalDays] = useState(
        String(survey.reminder_interval_days)
    )
    const [reminderMaxCount, setReminderMaxCount] = useState(
        String(survey.reminder_max_count)
    )
    const [savingSettings, setSavingSettings] = useState(false)
    const [busy, setBusy] = useState(false)

    const [publishOpen, setPublishOpen] = useState(false)
    const [publishPreview, setPublishPreview] =
        useState<AudiencePreview | null>(null)
    const [publishPreviewBusy, setPublishPreviewBusy] = useState(false)
    const [closeOpen, setCloseOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [reminderOpen, setReminderOpen] = useState(false)

    // Resync the form whenever the server re-sends the survey (after a
    // router.refresh() following any mutation).
    useEffect(() => {
        setTitle(survey.title)
        setIntro(survey.intro ?? "")
        setSeasonId(survey.season_id ? String(survey.season_id) : NO_SEASON)
        setIsAnonymous(survey.is_anonymous)
        setOpensAt(
            survey.opens_at ? isoToLeagueLocal(new Date(survey.opens_at)) : ""
        )
        setClosesAt(
            survey.closes_at ? isoToLeagueLocal(new Date(survey.closes_at)) : ""
        )
        setReminderIntervalDays(String(survey.reminder_interval_days))
        setReminderMaxCount(String(survey.reminder_max_count))
    }, [survey])

    const isDraft = survey.status === "draft"
    const isOpen = survey.status === "open"
    const isClosed = survey.status === "closed"
    const isPublished = !isDraft
    const pendingRecipientCount = recipients.filter(
        (recipient) => !recipient.removedAt && !recipient.submittedAt
    ).length

    function refresh() {
        router.refresh()
    }

    async function handleSaveSettings() {
        setSavingSettings(true)
        const result = await updateSurveySettings(surveyId, {
            title: title.trim(),
            intro: intro.trim() === "" ? null : intro.trim(),
            seasonId: seasonId === NO_SEASON ? null : Number(seasonId),
            isAnonymous,
            opensAt: leagueLocalToIso(opensAt),
            closesAt: leagueLocalToIso(closesAt),
            reminderIntervalDays: Number(reminderIntervalDays),
            reminderMaxCount: Number(reminderMaxCount)
        })
        setSavingSettings(false)
        if (result.status) {
            toast.success(result.message ?? "Survey saved.")
            refresh()
        } else {
            toast.error(result.message)
        }
    }

    async function openPublishDialog() {
        setPublishPreviewBusy(true)
        const result = await previewSurveyAudience(surveyId)
        setPublishPreviewBusy(false)
        if (result.status) {
            setPublishPreview(result.data)
            setPublishOpen(true)
        } else {
            toast.error(result.message)
        }
    }

    async function handlePublish() {
        setBusy(true)
        const result = await publishSurvey(surveyId)
        setBusy(false)
        setPublishOpen(false)
        if (result.status) {
            toast.success(result.message ?? "Survey published.")
            refresh()
        } else {
            toast.error(result.message)
        }
    }

    async function handleClose() {
        setBusy(true)
        const result = await closeSurvey(surveyId)
        setBusy(false)
        setCloseOpen(false)
        if (result.status) {
            toast.success(result.message ?? "Survey closed.")
            refresh()
        } else {
            toast.error(result.message)
        }
    }

    async function handleSendReminder() {
        setBusy(true)
        const result = await sendSurveyReminderNow(surveyId)
        setBusy(false)
        setReminderOpen(false)
        if (result.status) {
            toast.success(result.message ?? "Reminder sent.")
            refresh()
        } else {
            toast.error(result.message)
        }
    }

    async function handleDelete() {
        setBusy(true)
        const result = await deleteSurvey(surveyId)
        setBusy(false)
        setDeleteOpen(false)
        if (result.status) {
            toast.success(result.message ?? "Draft deleted.")
            router.push("/dashboard/manage-surveys")
        } else {
            toast.error(result.message)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
                <Link
                    href="/dashboard/manage-surveys"
                    className="text-muted-foreground text-sm hover:underline"
                >
                    ← All surveys
                </Link>
                <Badge variant={isOpen ? "default" : "outline"}>
                    {survey.status}
                </Badge>
                <span className="text-muted-foreground text-sm">
                    Template: {templateName}
                </span>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Settings</CardTitle>
                    <CardDescription>
                        Times are entered and shown in the league's time zone (
                        {LEAGUE_TIME_ZONE}).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="survey-title">Title</Label>
                        <Input
                            id="survey-title"
                            value={title}
                            disabled={isClosed}
                            maxLength={SURVEY_LIMITS.maxTitleLength}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="survey-intro">
                            Intro text (optional)
                        </Label>
                        <Textarea
                            id="survey-intro"
                            rows={3}
                            value={intro}
                            disabled={isClosed}
                            onChange={(event) => setIntro(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="survey-season">Season</Label>
                        <Select
                            value={seasonId}
                            onValueChange={setSeasonId}
                            disabled={isPublished}
                        >
                            <SelectTrigger id="survey-season">
                                <SelectValue placeholder="No season" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_SEASON}>
                                    No season
                                </SelectItem>
                                {options.seasons.map((season) => (
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
                    <div className="flex items-center gap-3">
                        <Switch
                            id="survey-anonymous"
                            checked={isAnonymous}
                            disabled={isPublished}
                            onCheckedChange={setIsAnonymous}
                        />
                        <Label htmlFor="survey-anonymous">Anonymous</Label>
                    </div>
                    <p className="text-muted-foreground text-sm">
                        Anonymous surveys can't be edited after submitting;
                        identified surveys can be edited until they close.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="survey-opens">
                                Opens (optional)
                            </Label>
                            <Input
                                id="survey-opens"
                                type="datetime-local"
                                value={opensAt}
                                disabled={isClosed}
                                onChange={(event) =>
                                    setOpensAt(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="survey-closes">
                                Closes (optional)
                            </Label>
                            <Input
                                id="survey-closes"
                                type="datetime-local"
                                value={closesAt}
                                disabled={isClosed}
                                onChange={(event) =>
                                    setClosesAt(event.target.value)
                                }
                            />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="survey-reminder-interval">
                                Reminder interval (days)
                            </Label>
                            <Input
                                id="survey-reminder-interval"
                                type="number"
                                min={0}
                                max={90}
                                value={reminderIntervalDays}
                                disabled={isClosed}
                                onChange={(event) =>
                                    setReminderIntervalDays(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="survey-reminder-max">
                                Max reminders
                            </Label>
                            <Input
                                id="survey-reminder-max"
                                type="number"
                                min={0}
                                max={20}
                                value={reminderMaxCount}
                                disabled={isClosed}
                                onChange={(event) =>
                                    setReminderMaxCount(event.target.value)
                                }
                            />
                        </div>
                    </div>
                    {isPublished && (
                        <p className="text-muted-foreground text-sm">
                            Sent {survey.reminder_count}/
                            {survey.reminder_max_count} reminders. Last
                            reminder:{" "}
                            {formatLeagueDateTime(survey.last_reminder_at)}.
                        </p>
                    )}
                    {isOpen && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setReminderOpen(true)}
                        >
                            Send reminder now
                        </Button>
                    )}
                    <Button
                        type="button"
                        disabled={savingSettings || isClosed}
                        onClick={handleSaveSettings}
                    >
                        Save settings
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Audience</CardTitle>
                    <CardDescription>
                        Who receives an invitation when this survey is
                        published.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <AudienceBuilder
                        surveyId={surveyId}
                        audience={survey.audience ?? EMPTY_AUDIENCE}
                        options={options}
                        editable={isDraft}
                        onSaved={refresh}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{isDraft ? "Publish" : "Recipients"}</CardTitle>
                    <CardDescription>
                        {isDraft
                            ? "Publishing locks the audience, freezes the question set, and sends invitations."
                            : "Everyone who was invited, and who has responded."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isDraft ? (
                        <Button
                            type="button"
                            disabled={publishPreviewBusy || busy}
                            onClick={openPublishDialog}
                        >
                            Publish survey
                        </Button>
                    ) : (
                        <RecipientsTable
                            surveyId={surveyId}
                            recipients={recipients}
                            canManage={isOpen}
                            canResend={isOpen}
                            users={options.users}
                            onChanged={refresh}
                        />
                    )}
                    <div className="flex flex-wrap gap-2">
                        {isOpen && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setCloseOpen(true)}
                            >
                                Close now
                            </Button>
                        )}
                        {isDraft && (
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={busy}
                                onClick={() => setDeleteOpen(true)}
                            >
                                Delete draft
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Publish this survey?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {publishPreview
                                ? `Invitations go out to ${publishPreview.total} recipient(s). Responses will be ${
                                      isAnonymous
                                          ? "anonymous — no name is stored on an answer."
                                          : "identified — each response is tied to who submitted it."
                                  } The audience and question set lock once published.`
                                : "Loading the audience count…"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy || !publishPreview}
                            onClick={(event) => {
                                event.preventDefault()
                                void handlePublish()
                            }}
                        >
                            Publish
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={reminderOpen} onOpenChange={setReminderOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Send a reminder now?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingRecipientCount} recipient(s) haven't
                            submitted yet and will get a reminder email.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(event) => {
                                event.preventDefault()
                                void handleSendReminder()
                            }}
                        >
                            Send reminder
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Close this survey?</AlertDialogTitle>
                        <AlertDialogDescription>
                            No further responses will be accepted. This can't be
                            undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(event) => {
                                event.preventDefault()
                                void handleClose()
                            }}
                        >
                            Close survey
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the draft survey entirely. It hasn't
                            been published, so nothing has been sent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(event) => {
                                event.preventDefault()
                                void handleDelete()
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {survey.status === "closed" && (
                <StatusBanner variant="info">
                    This survey is closed. Settings and the recipient list are
                    read-only.
                </StatusBanner>
            )}
        </div>
    )
}
