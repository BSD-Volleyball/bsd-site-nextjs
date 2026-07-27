"use client"

import { useState, useEffect, useMemo } from "react"
import type { PrepareForDraftData, CaptainInfo } from "./actions"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RiCloseLine } from "@remixicon/react"
import { LexicalEmailPreview } from "@/components/email-template/lexical-email-preview"
import {
    normalizeEmailTemplateContent,
    extractPlainTextFromEmailTemplateContent,
    convertEmailTemplateContentToHtml
} from "@/lib/email-template-content"
import {
    resolveTemplateVariablesInContent,
    resolveSubjectVariables
} from "@/lib/email-template-variables"
import { copyRichHtmlToClipboard } from "@/lib/clipboard"
import { clampRound } from "./draft-round-utils"

function formatEmailList(captains: CaptainInfo[]): string {
    return captains
        .map((c) => `${c.displayName} ${c.lastName} <${c.email}>`)
        .join(", ")
}

export function CaptainEmailModal({
    data,
    captainRoundOverrides,
    pairDiffOverrides,
    onClose
}: {
    data: PrepareForDraftData
    captainRoundOverrides: Record<string, number>
    pairDiffOverrides: Record<string, number>
    onClose: () => void
}) {
    const [copyEmailListSuccess, setCopyEmailListSuccess] = useState(false)
    const [copySubjectSuccess, setCopySubjectSuccess] = useState(false)
    const [copyPlainTextSuccess, setCopyPlainTextSuccess] = useState(false)
    const [copyRichTextSuccess, setCopyRichTextSuccess] = useState(false)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose()
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [onClose])

    const baseEmailTemplateContent = useMemo(
        () =>
            data.emailTemplateContent
                ? normalizeEmailTemplateContent(data.emailTemplateContent)
                : null,
        [data.emailTemplateContent]
    )

    const variableValues = useMemo(() => {
        const captainRoundsLines = data.captains
            .map((cap) => {
                const player = data.players.find((p) => p.userId === cap.userId)
                const round =
                    captainRoundOverrides[cap.userId] ??
                    data.savedCaptainRounds[cap.userId] ??
                    (player ? clampRound(player.recommendedRound) : 1)
                return `\u2022 ${cap.displayName} ${cap.lastName} \u2014 Round ${round}`
            })
            .join("\n")

        const pairDiffsLines = data.pairDifferentials
            .map((pair) => {
                const pairKey = `${pair.player1UserId}:${pair.player2UserId}`
                const pinnedUnrated = pair.captainIsLower
                    ? pair.player1Round === 9
                    : pair.player2Round === 9
                const pinnedRound = pair.captainIsLower
                    ? pair.player1Round
                    : pair.player2Round
                const defaultDiff = pinnedUnrated ? 8 : clampRound(pinnedRound)
                const diff =
                    pairDiffOverrides[pairKey] ??
                    data.savedPairDiffs[pairKey] ??
                    defaultDiff
                return `\u2022 ${pair.player1DisplayName} ${pair.player1LastName} & ${pair.player2DisplayName} ${pair.player2LastName} \u2014 Round ${diff}`
            })
            .join("\n")

        return {
            division_name: data.divisionName,
            season_name: data.seasonLabel,
            captain_rounds: captainRoundsLines,
            pair_diffs: pairDiffsLines
        }
    }, [
        data.captains,
        data.players,
        data.pairDifferentials,
        data.divisionName,
        data.seasonLabel,
        data.savedCaptainRounds,
        data.savedPairDiffs,
        captainRoundOverrides,
        pairDiffOverrides
    ])

    const resolvedEmailTemplateContent = useMemo(
        () =>
            baseEmailTemplateContent
                ? resolveTemplateVariablesInContent(
                      baseEmailTemplateContent,
                      variableValues
                  )
                : null,
        [baseEmailTemplateContent, variableValues]
    )

    const resolvedEmailSubject = useMemo(() => {
        if (!data.emailSubject) return ""
        return resolveSubjectVariables(data.emailSubject, variableValues)
    }, [data.emailSubject, variableValues])

    const handleCopyEmailList = async () => {
        try {
            await navigator.clipboard.writeText(formatEmailList(data.captains))
            setCopyEmailListSuccess(true)
            setTimeout(() => setCopyEmailListSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy email list:", err)
        }
    }

    const handleCopySubject = async () => {
        try {
            await navigator.clipboard.writeText(resolvedEmailSubject)
            setCopySubjectSuccess(true)
            setTimeout(() => setCopySubjectSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy subject:", err)
        }
    }

    const handleCopyPlainText = async () => {
        if (!resolvedEmailTemplateContent) return
        try {
            const plainText = extractPlainTextFromEmailTemplateContent(
                resolvedEmailTemplateContent
            )
            await navigator.clipboard.writeText(plainText)
            setCopyPlainTextSuccess(true)
            setTimeout(() => setCopyPlainTextSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy plain text:", err)
        }
    }

    const handleCopyRichText = async () => {
        if (!resolvedEmailTemplateContent) return
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
            setTimeout(() => setCopyRichTextSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy rich text:", err)
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
            onKeyDown={(e) => {
                if (e.key === "Escape") onClose()
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
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <RiCloseLine className="h-5 w-5" />
                </button>
                <h3 className="mb-4 font-semibold text-lg">Email Captains</h3>
                <Card className="mb-4 p-4">
                    <h4 className="mb-2 font-medium text-sm">Recipients</h4>
                    <p className="mb-2 break-all text-sm">
                        {formatEmailList(data.captains)}
                    </p>
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleCopyEmailList}
                        variant="outline"
                    >
                        {copyEmailListSuccess
                            ? "Copied!"
                            : "Copy Email Addresses"}
                    </Button>
                </Card>
                {resolvedEmailSubject && (
                    <Card className="mb-4 p-4">
                        <h4 className="mb-2 font-medium text-sm">Subject</h4>
                        <p className="mb-2 text-sm">{resolvedEmailSubject}</p>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleCopySubject}
                            variant="outline"
                        >
                            {copySubjectSuccess ? "Copied!" : "Copy Subject"}
                        </Button>
                    </Card>
                )}
                {resolvedEmailTemplateContent && (
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
                                onClick={handleCopyPlainText}
                                variant="outline"
                            >
                                {copyPlainTextSuccess
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
    )
}
