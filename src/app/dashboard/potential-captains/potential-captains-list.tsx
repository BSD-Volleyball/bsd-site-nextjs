"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
import { LexicalEmailPreview } from "@/components/email-template/lexical-email-preview"
import {
    type LexicalEmailTemplateContent,
    normalizeEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent,
    convertEmailTemplateContentToHtml
} from "@/lib/email-template-content"
import {
    resolveTemplateVariablesInContent,
    resolveSubjectVariables,
    type TemplateVariableValues
} from "@/lib/email-template-variables"
import type { SeasonConfig } from "@/lib/site-config"
import type { DivisionCommissioner } from "./actions"

interface PotentialCaptain {
    id: string
    displayName: string
    lastName: string
    email: string
    consecutiveSeasons: number
    captainInterest: "yes" | "only_if_needed" | "no"
}

interface CaptainList {
    title: string
    description: string
    players: PotentialCaptain[]
}

interface DivisionCaptains {
    id: number
    name: string
    level: number
    gender_split: string | null
    lists: CaptainList[]
}

export function PotentialCaptainsList({
    divisions,
    allSeasons,
    playerPicUrl,
    emailTemplate,
    emailTemplateContent,
    emailSubject,
    seasonConfig,
    commissionerName,
    currentUserId,
    divisionCommissioners
}: {
    divisions: DivisionCaptains[]
    allSeasons: { id: number; year: number; name: string }[]
    playerPicUrl: string
    emailTemplate: string
    emailTemplateContent?: LexicalEmailTemplateContent
    emailSubject: string
    seasonConfig?: SeasonConfig
    commissionerName?: string
    currentUserId?: string
    divisionCommissioners?: DivisionCommissioner[]
}) {
    const modal = usePlayerDetailModal()
    const [selectedPlayers, setSelectedPlayers] = useState<
        Map<number, Set<string>>
    >(new Map())
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [currentDivisionId, setCurrentDivisionId] = useState<number | null>(
        null
    )
    const [copySuccess, setCopySuccess] = useState(false)
    const [copyEmailSuccess, setCopyEmailSuccess] = useState(false)
    const [copyRichTextSuccess, setCopyRichTextSuccess] = useState(false)
    const [copySubjectSuccess, setCopySubjectSuccess] = useState(false)

    const baseEmailTemplateContent =
        emailTemplateContent || normalizeEmailTemplateContent(emailTemplate)

    const currentDivision = useMemo(
        () => divisions.find((d) => d.id === currentDivisionId) ?? null,
        [divisions, currentDivisionId]
    )

    const buildVariableValues = useCallback(
        (
            divisionId: number,
            divisionName: string,
            genderSplit: string | null,
            divisionLevel: number
        ): TemplateVariableValues => {
            const courtFocusByDivisionLevel: Record<number, string> = {
                1: "court 1",
                2: "court 1 and 2",
                3: "court 2 and 3",
                4: "court 2 and 3",
                5: "court 3 and 4",
                6: "court 4"
            }

            const otherCommissioner =
                divisionCommissioners
                    ?.filter(
                        (c) =>
                            c.divisionId === divisionId &&
                            c.userId !== currentUserId
                    )
                    .map((c) => c.name)
                    .join(", ") ?? ""

            const values: TemplateVariableValues = {
                division_name: divisionName,
                season_name: seasonConfig
                    ? `${seasonConfig.seasonName.charAt(0).toUpperCase() + seasonConfig.seasonName.slice(1)} ${seasonConfig.seasonYear}`
                    : "",
                season_year: seasonConfig
                    ? String(seasonConfig.seasonYear)
                    : "",
                gender_split: genderSplit ?? "",
                court_focus: courtFocusByDivisionLevel[divisionLevel] ?? "",
                commissioner_name: commissionerName ?? "",
                captain_names: "",
                other_commissioner: otherCommissioner
            }

            if (seasonConfig) {
                const divisionDraftDateByLevel: Record<number, string> = {
                    1: seasonConfig.draft1Date,
                    2: seasonConfig.draft2Date,
                    3: seasonConfig.draft3Date,
                    4: seasonConfig.draft4Date,
                    5: seasonConfig.draft5Date,
                    6: seasonConfig.draft6Date
                }

                values.tryout_1_date = seasonConfig.tryout1Date
                values.tryout_2_date = seasonConfig.tryout2Date
                values.tryout_3_date = seasonConfig.tryout3Date
                values.season_1_date = seasonConfig.season1Date
                values.season_2_date = seasonConfig.season2Date
                values.season_3_date = seasonConfig.season3Date
                values.season_4_date = seasonConfig.season4Date
                values.season_5_date = seasonConfig.season5Date
                values.season_6_date = seasonConfig.season6Date
                values.playoff_1_date = seasonConfig.playoff1Date
                values.playoff_2_date = seasonConfig.playoff2Date
                values.playoff_3_date = seasonConfig.playoff3Date
                values.tryout_1_s1_time = seasonConfig.tryout1Session1Time
                values.tryout_1_s2_time = seasonConfig.tryout1Session2Time
                values.tryout_2_s1_time = seasonConfig.tryout2Session1Time
                values.tryout_2_s2_time = seasonConfig.tryout2Session2Time
                values.tryout_2_s3_time = seasonConfig.tryout2Session3Time
                values.tryout_3_s1_time = seasonConfig.tryout3Session1Time
                values.tryout_3_s2_time = seasonConfig.tryout3Session2Time
                values.tryout_3_s3_time = seasonConfig.tryout3Session3Time
                values.season_s1_time = seasonConfig.seasonSession1Time
                values.season_s2_time = seasonConfig.seasonSession2Time
                values.season_s3_time = seasonConfig.seasonSession3Time
                values.division_draft_date =
                    divisionDraftDateByLevel[divisionLevel] ?? ""
            }

            return values
        },
        [seasonConfig, commissionerName, currentUserId, divisionCommissioners]
    )

    const resolvedEmailTemplateContent = useMemo(() => {
        if (!currentDivision) return baseEmailTemplateContent
        const values = buildVariableValues(
            currentDivision.id,
            currentDivision.name,
            currentDivision.gender_split,
            currentDivision.level
        )
        return resolveTemplateVariablesInContent(
            baseEmailTemplateContent,
            values
        )
    }, [currentDivision, baseEmailTemplateContent, buildVariableValues])

    const resolvedEmailSubject = useMemo(() => {
        if (!currentDivision || !emailSubject) return emailSubject
        const values = buildVariableValues(
            currentDivision.id,
            currentDivision.name,
            currentDivision.gender_split,
            currentDivision.level
        )
        return resolveSubjectVariables(emailSubject, values)
    }, [currentDivision, emailSubject, buildVariableValues])

    const togglePlayerSelection = (divisionId: number, playerId: string) => {
        setSelectedPlayers((prev) => {
            const newMap = new Map(prev)
            const currentSet = newMap.get(divisionId) || new Set()
            const newSet = new Set(currentSet)

            if (newSet.has(playerId)) {
                newSet.delete(playerId)
            } else {
                newSet.add(playerId)
            }
            newMap.set(divisionId, newSet)
            return newMap
        })
    }

    const handleGenerateMessage = (divisionId: number) => {
        setCurrentDivisionId(divisionId)
        setShowEmailModal(true)
        setCopySuccess(false)
        setCopyEmailSuccess(false)
        setCopyRichTextSuccess(false)
        setCopySubjectSuccess(false)
    }

    const getSelectedPlayersForDivision = (
        divisionId: number
    ): PotentialCaptain[] => {
        const division = divisions.find((d) => d.id === divisionId)
        if (!division) return []

        const selectedIds = selectedPlayers.get(divisionId) || new Set()
        const allPlayers: PotentialCaptain[] = []

        division.lists.forEach((list) => {
            allPlayers.push(...list.players)
        })

        return allPlayers.filter((p) => selectedIds.has(p.id))
    }

    const formatEmailList = (players: PotentialCaptain[]): string => {
        return players
            .map((p) => `${p.displayName} ${p.lastName} <${p.email}>`)
            .join(", ")
    }

    const handleCopyToClipboard = async () => {
        if (!currentDivisionId) return

        const players = getSelectedPlayersForDivision(currentDivisionId)
        const emailList = formatEmailList(players)

        try {
            await navigator.clipboard.writeText(emailList)
            setCopySuccess(true)
            setTimeout(() => setCopySuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy to clipboard:", err)
        }
    }

    const handleCopyEmailTemplate = async () => {
        try {
            const plainText = extractPlainTextFromEmailTemplateContent(
                resolvedEmailTemplateContent
            )
            await navigator.clipboard.writeText(plainText)
            setCopyEmailSuccess(true)
            setTimeout(() => setCopyEmailSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy email template to clipboard:", err)
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
            await navigator.clipboard.write([
                new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([plainText], {
                        type: "text/plain"
                    })
                })
            ])
            setCopyRichTextSuccess(true)
            setTimeout(() => setCopyRichTextSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy rich text:", err)
        }
    }

    const handleCopySubject = async () => {
        try {
            await navigator.clipboard.writeText(resolvedEmailSubject)
            setCopySubjectSuccess(true)
            setTimeout(() => setCopySubjectSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy subject to clipboard:", err)
        }
    }

    const handleCloseEmailModal = useCallback(() => {
        setShowEmailModal(false)
    }, [])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && showEmailModal) {
                handleCloseEmailModal()
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [showEmailModal, handleCloseEmailModal])

    return (
        <div className="space-y-4">
            {divisions.map((division) => (
                <Collapsible key={division.id}>
                    <div className="rounded-lg border bg-card shadow-sm">
                        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50">
                            <h2 className="font-semibold text-xl">
                                {division.name}
                            </h2>
                            <RiArrowDownSLine
                                className="transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                                size={20}
                            />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="space-y-6 border-t px-4 pt-4 pb-4">
                                {division.lists.map((list, index) => (
                                    <div key={index}>
                                        <h3 className="mb-2 font-semibold text-base">
                                            {list.title}
                                        </h3>
                                        <p className="mb-3 text-muted-foreground text-sm">
                                            {list.description}
                                        </p>
                                        {list.players.length === 0 ? (
                                            <div className="rounded-md bg-muted p-4 text-center text-muted-foreground text-sm">
                                                No players in this category.
                                            </div>
                                        ) : (
                                            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                                {list.players.map((player) => (
                                                    <div
                                                        key={player.id}
                                                        className="flex items-center gap-2 rounded-md border bg-background p-3"
                                                    >
                                                        <Checkbox
                                                            checked={
                                                                selectedPlayers
                                                                    .get(
                                                                        division.id
                                                                    )
                                                                    ?.has(
                                                                        player.id
                                                                    ) || false
                                                            }
                                                            onCheckedChange={() =>
                                                                togglePlayerSelection(
                                                                    division.id,
                                                                    player.id
                                                                )
                                                            }
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                modal.openPlayerDetail(
                                                                    player.id
                                                                )
                                                            }
                                                            className="flex flex-1 items-center justify-between transition-colors hover:text-primary focus:outline-none"
                                                        >
                                                            <span className="text-sm">
                                                                {
                                                                    player.displayName
                                                                }{" "}
                                                                {
                                                                    player.lastName
                                                                }
                                                            </span>
                                                            <Badge variant="secondary">
                                                                {player.consecutiveSeasons >=
                                                                10
                                                                    ? "9+"
                                                                    : player.consecutiveSeasons}{" "}
                                                                {player.consecutiveSeasons ===
                                                                1
                                                                    ? "season"
                                                                    : "seasons"}
                                                            </Badge>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-6 flex justify-end border-t px-4 py-4">
                                <Button
                                    onClick={() =>
                                        handleGenerateMessage(division.id)
                                    }
                                    disabled={
                                        !selectedPlayers.get(division.id) ||
                                        selectedPlayers.get(division.id)!
                                            .size === 0
                                    }
                                    variant="default"
                                >
                                    Generate Message (
                                    {selectedPlayers.get(division.id)?.size ||
                                        0}{" "}
                                    selected)
                                </Button>
                            </div>
                        </CollapsibleContent>
                    </div>
                </Collapsible>
            ))}

            <PlayerDetailPopup
                open={!!modal.selectedUserId}
                onClose={modal.closePlayerDetail}
                playerDetails={modal.playerDetails}
                draftHistory={modal.draftHistory}
                allSeasons={allSeasons}
                playerPicUrl={playerPicUrl}
                isLoading={modal.isLoading}
                pairPickName={modal.pairPickName}
                pairReason={modal.pairReason}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
            />

            {/* Email Modal */}
            {showEmailModal && currentDivisionId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={handleCloseEmailModal}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") handleCloseEmailModal()
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div
                        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="document"
                    >
                        <button
                            type="button"
                            onClick={handleCloseEmailModal}
                            className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>
                        <h3 className="mb-4 font-semibold text-lg">
                            Email Recipients
                        </h3>
                        <Card className="mb-4 p-4">
                            <p className="mb-2 text-sm">
                                {formatEmailList(
                                    getSelectedPlayersForDivision(
                                        currentDivisionId
                                    )
                                )}
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
                </div>
            )}
        </div>
    )
}
