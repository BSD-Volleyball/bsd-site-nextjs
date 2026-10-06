"use client"

import { formatSeasonLabel } from "@/lib/season-utils"
import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { toast } from "sonner"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { useAction } from "@/components/hooks/use-action"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { createTeams } from "./actions"
import type {
    DivisionOption,
    UserOption,
    DivisionCommissioner,
    ExistingTeam
} from "./data"
import { LexicalEmailPreview } from "@/components/email-template/lexical-email-preview"
import { PlayerOptionCombobox } from "@/components/user-combobox"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent,
    convertEmailTemplateContentToHtml
} from "@/lib/email-template-content"
import {
    resolveTemplateVariablesInContent,
    resolveSubjectVariables,
    buildEventVariableValues
} from "@/lib/email-template-variables"
import type { SeasonConfig } from "@/lib/season-types"
import { copyRichHtmlToClipboard } from "@/lib/clipboard"
import { isGhostCaptain } from "@/lib/ghost-captain"

interface SelectCaptainsFormProps {
    seasonLabel: string
    divisions: DivisionOption[]
    users: UserOption[]
    allUsers: UserOption[]
    emailTemplate: string
    emailTemplateContent: LexicalEmailTemplateContent | null
    emailSubject: string
    seasonConfig?: SeasonConfig | null
    commissionerName?: string
    currentUserId?: string
    divisionCommissioners?: DivisionCommissioner[]
    existingTeamsByDivision?: Record<number, ExistingTeam[]>
}

interface CaptainSelection {
    captainId: string | null
    coach2Id: string | null
    teamName: string
}

export function SelectCaptainsForm({
    seasonLabel = "",
    divisions,
    users,
    allUsers,
    emailTemplate,
    emailTemplateContent,
    emailSubject,
    seasonConfig,
    commissionerName = "",
    currentUserId,
    divisionCommissioners,
    existingTeamsByDivision
}: SelectCaptainsFormProps) {
    const uid = useId()
    const { run: runCreateTeams, pending: isLoading } = useAction(createTeams, {
        refresh: false
    })
    const [copyReminder, setCopyReminder] = useState(false)
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [copySuccess, setCopySuccess] = useState(false)
    const [copyEmailSuccess, setCopyEmailSuccess] = useState(false)
    const [copyRichTextSuccess, setCopyRichTextSuccess] = useState(false)
    const [copySubjectSuccess, setCopySubjectSuccess] = useState(false)

    const baseEmailTemplateContent =
        emailTemplateContent || normalizeEmailTemplateContent(emailTemplate)

    const [divisionId, setDivisionId] = useState<string>(
        divisions.length === 1 ? divisions[0].id.toString() : ""
    )
    const [captains, setCaptains] = useState<CaptainSelection[]>(
        Array(6)
            .fill(null)
            .map(() => ({ captainId: null, coach2Id: null, teamName: "" }))
    )

    const selectedDivision = useMemo(
        () => divisions.find((d) => d.id.toString() === divisionId) || null,
        [divisions, divisionId]
    )

    const numTeams = useMemo(() => {
        if (!selectedDivision) {
            return 6
        }

        return selectedDivision.name.trim().toUpperCase() === "BB" ? 4 : 6
    }, [selectedDivision])

    const isCoachesMode = useMemo(
        () => selectedDivision?.coaches ?? false,
        [selectedDivision]
    )

    useEffect(() => {
        const parsedId = parseInt(divisionId, 10)
        const existing =
            divisionId && !Number.isNaN(parsedId)
                ? (existingTeamsByDivision?.[parsedId] ?? [])
                : []

        const byNumber = new Map(existing.map((t) => [t.number, t]))

        setCopyReminder(false)

        setCaptains(() => {
            const next: CaptainSelection[] = Array(6)
                .fill(null)
                .map(() => ({ captainId: null, coach2Id: null, teamName: "" }))
            for (let i = 0; i < 6; i++) {
                const team = byNumber.get(i + 1)
                if (team) {
                    const primaryCaptainId = team.captainId ?? null
                    const captain2Id = team.captain2Id ?? null
                    next[i] = {
                        captainId: isGhostCaptain(primaryCaptainId)
                            ? null
                            : primaryCaptainId,
                        coach2Id: isGhostCaptain(captain2Id)
                            ? null
                            : captain2Id,
                        teamName: team.teamName ?? ""
                    }
                }
            }
            return next
        })
    }, [divisionId, existingTeamsByDivision])

    const selectedCaptainIds = useMemo(
        () =>
            captains.slice(0, numTeams).flatMap((c) => {
                const ids: string[] = []
                if (c.captainId) ids.push(c.captainId)
                if (c.coach2Id) ids.push(c.coach2Id)
                return ids
            }),
        [captains, numTeams]
    )

    const selectedCaptains = useMemo(() => {
        return selectedCaptainIds
            .map((captainId) => allUsers.find((user) => user.id === captainId))
            .filter((user): user is UserOption => user !== undefined)
    }, [selectedCaptainIds, allUsers])

    // For coaches mode: pairs of (coach1, coach2) per team slot, used for the
    // captain_names template variable and the email modal list.
    const selectedCoachPairs = useMemo(() => {
        if (!isCoachesMode) return null
        return captains
            .slice(0, numTeams)
            .map((c) => ({
                coach1: c.captainId
                    ? (allUsers.find((u) => u.id === c.captainId) ?? null)
                    : null,
                coach2: c.coach2Id
                    ? (allUsers.find((u) => u.id === c.coach2Id) ?? null)
                    : null
            }))
            .filter((p) => p.coach1 || p.coach2)
    }, [captains, numTeams, isCoachesMode, allUsers])

    const variableValues = useMemo(() => {
        const captainNames = isCoachesMode
            ? (selectedCoachPairs ?? [])
                  .map(({ coach1, coach2 }) => {
                      const names = [coach1, coach2]
                          .filter(Boolean)
                          .map((u) => `${u!.first_name} ${u!.last_name}`)
                          .join(" & ")
                      return `• ${names}`
                  })
                  .join("\n")
            : selectedCaptains.length > 0
              ? selectedCaptains
                    .map((u) => `• ${u.first_name} ${u.last_name}`)
                    .join("\n")
              : ""

        const otherCommissioner =
            selectedDivision && divisionCommissioners
                ? divisionCommissioners
                      .filter(
                          (c) =>
                              c.divisionId === selectedDivision.id &&
                              c.userId !== currentUserId
                      )
                      .map((c) => c.name)
                      .join(", ")
                : ""

        const courtFocusByDivisionLevel: Record<number, string> = {
            1: "court 1",
            2: "court 1 and 2",
            3: "court 2 and 3",
            4: "court 2 and 3",
            5: "court 3 and 4",
            6: "court 4"
        }

        const values: Record<string, string> = {
            division_name: selectedDivision?.name ?? "",
            season_name: seasonConfig ? formatSeasonLabel(seasonConfig) : "",
            season_year: seasonConfig ? String(seasonConfig.seasonYear) : "",
            gender_split: selectedDivision?.gender_split ?? "",
            court_focus: selectedDivision
                ? (courtFocusByDivisionLevel[selectedDivision.level] ?? "")
                : "",
            commissioner_name: commissionerName,
            captain_names: captainNames,
            other_commissioner: otherCommissioner
        }

        if (seasonConfig) {
            Object.assign(
                values,
                buildEventVariableValues(
                    seasonConfig,
                    selectedDivision?.level ?? null
                )
            )
        }

        return values
    }, [
        selectedDivision,
        selectedCaptains,
        selectedCoachPairs,
        isCoachesMode,
        seasonConfig,
        commissionerName,
        currentUserId,
        divisionCommissioners
    ])

    const resolvedEmailTemplateContent = useMemo(
        () =>
            resolveTemplateVariablesInContent(
                baseEmailTemplateContent,
                variableValues
            ),
        [baseEmailTemplateContent, variableValues]
    )

    const resolvedEmailSubject = useMemo(() => {
        if (!emailSubject) return ""
        return resolveSubjectVariables(emailSubject, variableValues)
    }, [emailSubject, variableValues])

    const formatEmailList = (captainUsers: UserOption[]): string => {
        return captainUsers
            .map(
                (user) => `${user.first_name} ${user.last_name} <${user.email}>`
            )
            .join(", ")
    }

    const handleGenerateMessage = () => {
        setShowEmailModal(true)
        setCopySuccess(false)
        setCopyEmailSuccess(false)
        setCopyRichTextSuccess(false)
        setCopySubjectSuccess(false)
    }

    const handleCloseEmailModal = useCallback(() => {
        setShowEmailModal(false)
    }, [])

    const handleCopyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(
                formatEmailList(selectedCaptains)
            )
            setCopySuccess(true)
            setCopyReminder(true)
            setTimeout(() => setCopySuccess(false), 2000)
        } catch (copyError) {
            console.error("Failed to copy selected captain emails:", copyError)
        }
    }

    const handleCopyEmailTemplate = async () => {
        try {
            const plainText = extractPlainTextFromEmailTemplateContent(
                resolvedEmailTemplateContent
            )
            await navigator.clipboard.writeText(plainText)
            setCopyEmailSuccess(true)
            setCopyReminder(true)
            setTimeout(() => setCopyEmailSuccess(false), 2000)
        } catch (copyError) {
            console.error("Failed to copy email template:", copyError)
        }
    }

    const handleCopyRichText = async () => {
        try {
            const html = convertEmailTemplateContentToHtml(
                resolvedEmailTemplateContent
            )
            const plainText = extractPlainTextFromEmailTemplateContent(
                resolvedEmailTemplateContent
            )
            const copied = await copyRichHtmlToClipboard(html, plainText)
            if (!copied) {
                throw new Error("Rich text clipboard copy is not supported")
            }
            setCopyRichTextSuccess(true)
            setCopyReminder(true)
            setTimeout(() => setCopyRichTextSuccess(false), 2000)
        } catch (copyError) {
            console.error("Failed to copy rich text:", copyError)
        }
    }

    const handleCopySubject = async () => {
        try {
            await navigator.clipboard.writeText(resolvedEmailSubject)
            setCopySubjectSuccess(true)
            setCopyReminder(true)
            setTimeout(() => setCopySubjectSuccess(false), 2000)
        } catch (copyError) {
            console.error("Failed to copy email subject:", copyError)
        }
    }

    const handleCaptainChange = (
        index: number,
        field: "captainId" | "coach2Id",
        userId: string | null,
        user: UserOption | null
    ) => {
        setCaptains((prev) => {
            const newCaptains = [...prev]
            if (field === "captainId") {
                const currentName = newCaptains[index].teamName
                const prevCaptain = newCaptains[index].captainId
                    ? users.find((u) => u.id === newCaptains[index].captainId)
                    : null
                const wasAutoGenerated = prevCaptain
                    ? currentName === `Team ${prevCaptain.last_name}`
                    : false
                let nextName: string
                if (user) {
                    nextName = `Team ${user.last_name}`
                } else if (!currentName || wasAutoGenerated) {
                    nextName = "Team Ghost"
                } else {
                    nextName = currentName
                }
                newCaptains[index] = {
                    ...newCaptains[index],
                    captainId: userId,
                    teamName: nextName
                }
            } else {
                newCaptains[index] = {
                    ...newCaptains[index],
                    coach2Id: userId
                }
            }
            return newCaptains
        })
    }

    const handleTeamNameChange = (index: number, name: string) => {
        setCaptains((prev) => {
            const newCaptains = [...prev]
            newCaptains[index] = {
                ...newCaptains[index],
                teamName: name
            }
            return newCaptains
        })
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setCopyReminder(false)

        if (!divisionId) {
            toast.error("Please select a division.")
            return
        }

        const teamsToCreate = captains.slice(0, numTeams).map((c) => ({
            captainId: c.captainId || "",
            coach2Id: c.coach2Id || "",
            teamName: c.teamName
        }))

        if (isCoachesMode) {
            // In coaches mode, only require a name if at least one coach is set
            for (let i = 0; i < numTeams; i++) {
                const hasAnyCoach =
                    teamsToCreate[i].captainId || teamsToCreate[i].coach2Id
                if (hasAnyCoach && !teamsToCreate[i].teamName.trim()) {
                    toast.error(`Please enter a name for Team ${i + 1}.`)
                    return
                }
            }
        } else {
            // Captain is optional (ghost captain fills empty slots server-side)
            for (let i = 0; i < numTeams; i++) {
                if (!teamsToCreate[i].teamName.trim()) {
                    toast.error(`Please enter a name for Team ${i + 1}.`)
                    return
                }
            }
        }

        await runCreateTeams(parseInt(divisionId, 10), teamsToCreate)
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Team Configuration</CardTitle>
                    <CardDescription>
                        {isCoachesMode
                            ? "Select up to two coaches per team for the current season. All fields are optional — save at any time."
                            : "Select captains for the current season by choosing a division and players."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor={`${uid}-current-season`}>
                            Current Season
                        </Label>
                        <Input
                            id={`${uid}-current-season`}
                            value={seasonLabel ?? ""}
                            readOnly
                            className="bg-muted"
                        />
                    </div>

                    {divisions.length > 1 ? (
                        <div className="space-y-2">
                            <Label htmlFor={`${uid}-division`}>
                                Division{" "}
                                <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={divisionId}
                                onValueChange={setDivisionId}
                            >
                                <SelectTrigger id={`${uid}-division`}>
                                    <SelectValue placeholder="Select a division" />
                                </SelectTrigger>
                                <SelectContent>
                                    {divisions.map((division) => (
                                        <SelectItem
                                            key={division.id}
                                            value={division.id.toString()}
                                        >
                                            {division.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label>Division</Label>
                            <Input
                                value={
                                    divisions.length === 1
                                        ? divisions[0].name
                                        : ""
                                }
                                readOnly
                                className="bg-muted"
                            />
                        </div>
                    )}

                    <div className="border-t pt-6">
                        <h3 className="mb-4 font-semibold">
                            {isCoachesMode ? "Coaches" : "Captains"}
                        </h3>
                        <div className="space-y-4">
                            {Array.from({ length: numTeams }).map((_, index) =>
                                isCoachesMode ? (
                                    <div
                                        key={index}
                                        className="space-y-3 rounded-md border p-3"
                                    >
                                        <div className="space-y-2">
                                            <Label
                                                htmlFor={`${uid}-team-name-${index}`}
                                            >
                                                Team {index + 1} Name
                                            </Label>
                                            <Input
                                                id={`${uid}-team-name-${index}`}
                                                value={captains[index].teamName}
                                                onChange={(e) =>
                                                    handleTeamNameChange(
                                                        index,
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="Team name"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <Label>Coach 1</Label>
                                                <PlayerOptionCombobox
                                                    users={allUsers}
                                                    value={
                                                        captains[index]
                                                            .captainId
                                                    }
                                                    onChange={(userId, user) =>
                                                        handleCaptainChange(
                                                            index,
                                                            "captainId",
                                                            userId,
                                                            user
                                                        )
                                                    }
                                                    placeholder="Select a coach..."
                                                    excludeIds={
                                                        selectedCaptainIds
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>
                                                    Coach 2{" "}
                                                    <span className="text-muted-foreground text-sm">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <PlayerOptionCombobox
                                                    users={allUsers}
                                                    value={
                                                        captains[index].coach2Id
                                                    }
                                                    onChange={(userId, user) =>
                                                        handleCaptainChange(
                                                            index,
                                                            "coach2Id",
                                                            userId,
                                                            user
                                                        )
                                                    }
                                                    placeholder="Select a coach..."
                                                    excludeIds={
                                                        selectedCaptainIds
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        key={index}
                                        className="space-y-3 rounded-md border p-3"
                                    >
                                        <div className="grid grid-cols-2 items-end gap-4">
                                            <div className="space-y-2">
                                                <Label
                                                    htmlFor={`${uid}-captain-${index}`}
                                                >
                                                    Captain {index + 1}{" "}
                                                    <span className="text-muted-foreground text-sm">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <PlayerOptionCombobox
                                                    id={`${uid}-captain-${index}`}
                                                    users={users}
                                                    value={
                                                        captains[index]
                                                            .captainId
                                                    }
                                                    onChange={(userId, user) =>
                                                        handleCaptainChange(
                                                            index,
                                                            "captainId",
                                                            userId,
                                                            user
                                                        )
                                                    }
                                                    placeholder="Select a captain..."
                                                    excludeIds={
                                                        selectedCaptainIds
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label
                                                    htmlFor={`${uid}-team-name-${index}`}
                                                >
                                                    Team Name{" "}
                                                    <span className="text-destructive">
                                                        *
                                                    </span>
                                                </Label>
                                                <Input
                                                    id={`${uid}-team-name-${index}`}
                                                    value={
                                                        captains[index].teamName
                                                    }
                                                    onChange={(e) =>
                                                        handleTeamNameChange(
                                                            index,
                                                            e.target.value
                                                        )
                                                    }
                                                    placeholder="Team name"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>
                                                Co-Captain{" "}
                                                <span className="text-muted-foreground text-sm">
                                                    (optional — assists with
                                                    rating &amp; drafting)
                                                </span>
                                            </Label>
                                            <PlayerOptionCombobox
                                                users={allUsers}
                                                value={captains[index].coach2Id}
                                                onChange={(userId, user) =>
                                                    handleCaptainChange(
                                                        index,
                                                        "coach2Id",
                                                        userId,
                                                        user
                                                    )
                                                }
                                                placeholder="Select a co-captain..."
                                                excludeIds={selectedCaptainIds}
                                            />
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {copyReminder && (
                        <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                            Remember to click Create to save your teams
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex items-center justify-between border-t pt-6">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleGenerateMessage}
                        disabled={
                            !selectedDivision || selectedCaptains.length === 0
                        }
                    >
                        Generate Message ({selectedCaptains.length} selected)
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? "Creating..." : "Create"}
                    </Button>
                </CardFooter>
            </Card>

            <Dialog
                open={showEmailModal}
                onOpenChange={(open) => {
                    if (!open) handleCloseEmailModal()
                }}
            >
                <DialogContent
                    className="max-h-[85vh] overflow-y-auto"
                    aria-describedby={undefined}
                >
                    <DialogHeader>
                        <DialogTitle>Email Recipients</DialogTitle>
                    </DialogHeader>
                    <div>
                        <Card className="mb-4 p-4">
                            <p className="mb-2 text-sm">
                                {formatEmailList(selectedCaptains)}
                            </p>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleCopyToClipboard}
                                variant="outline"
                            >
                                {copySuccess
                                    ? "Copied!"
                                    : "Copy Email Addresses"}
                            </Button>
                        </Card>
                        {resolvedEmailSubject && (
                            <Card className="mb-4 p-4">
                                <h4 className="mb-2 font-medium text-sm">
                                    Subject
                                </h4>
                                <p className="mb-2 text-sm">
                                    {resolvedEmailSubject}
                                </p>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleCopySubject}
                                    variant="outline"
                                >
                                    {copySubjectSuccess
                                        ? "Copied!"
                                        : "Copy Subject"}
                                </Button>
                            </Card>
                        )}
                        {emailTemplate && (
                            <Card className="p-4">
                                <h4 className="mb-2 font-medium text-sm">
                                    Email Template
                                </h4>
                                <div className="mb-2">
                                    <LexicalEmailPreview
                                        content={resolvedEmailTemplateContent}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleCopyEmailTemplate}
                                        variant="outline"
                                    >
                                        {copyEmailSuccess
                                            ? "Copied!"
                                            : "Copy Plain Text"}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleCopyRichText}
                                        variant="outline"
                                    >
                                        {copyRichTextSuccess
                                            ? "Copied!"
                                            : "Copy Rich Text"}
                                    </Button>
                                </div>
                            </Card>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </form>
    )
}
