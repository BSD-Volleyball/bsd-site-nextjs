"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RiCloseLine, RiMailSendLine } from "@remixicon/react"
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
import type { CaptainWelcomeData } from "./actions"

export function WelcomeTeamCard({ data }: { data: CaptainWelcomeData }) {
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [copyEmailListSuccess, setCopyEmailListSuccess] = useState(false)
    const [copySubjectSuccess, setCopySubjectSuccess] = useState(false)
    const [copyPlainTextSuccess, setCopyPlainTextSuccess] = useState(false)
    const [copyRichTextSuccess, setCopyRichTextSuccess] = useState(false)

    const baseEmailTemplateContent = useMemo(
        () =>
            data.emailTemplateContent
                ? normalizeEmailTemplateContent(data.emailTemplateContent)
                : null,
        [data.emailTemplateContent]
    )

    const variableValues = useMemo(() => {
        const values: Record<string, string> = {
            team_name: data.teamName,
            division_name: data.divisionName,
            season_name: data.seasonLabel,
            season_year: data.seasonConfig
                ? String(data.seasonConfig.seasonYear)
                : "",
            user_preferred_name: data.currentUserPreferredName,
            user_last_name: data.currentUserLastName,
            team_members: data.members
                .map((m) => `\u2022 ${m.displayName} ${m.lastName}`)
                .join("\n")
        }

        if (data.seasonConfig) {
            const divisionDraftDateByLevel: Record<number, string> = {
                1: data.seasonConfig.draft1Date,
                2: data.seasonConfig.draft2Date,
                3: data.seasonConfig.draft3Date,
                4: data.seasonConfig.draft4Date,
                5: data.seasonConfig.draft5Date,
                6: data.seasonConfig.draft6Date
            }

            values.tryout_1_date = data.seasonConfig.tryout1Date
            values.tryout_2_date = data.seasonConfig.tryout2Date
            values.tryout_3_date = data.seasonConfig.tryout3Date
            values.season_1_date = data.seasonConfig.season1Date
            values.season_2_date = data.seasonConfig.season2Date
            values.season_3_date = data.seasonConfig.season3Date
            values.season_4_date = data.seasonConfig.season4Date
            values.season_5_date = data.seasonConfig.season5Date
            values.season_6_date = data.seasonConfig.season6Date
            values.playoff_1_date = data.seasonConfig.playoff1Date
            values.playoff_2_date = data.seasonConfig.playoff2Date
            values.playoff_3_date = data.seasonConfig.playoff3Date
            values.captain_select_date = data.seasonConfig.captainSelectDate
            values.draft_1_date = data.seasonConfig.draft1Date
            values.draft_2_date = data.seasonConfig.draft2Date
            values.draft_3_date = data.seasonConfig.draft3Date
            values.draft_4_date = data.seasonConfig.draft4Date
            values.draft_5_date = data.seasonConfig.draft5Date
            values.draft_6_date = data.seasonConfig.draft6Date
            values.tryout_1_s1_time = data.seasonConfig.tryout1Session1Time
            values.tryout_1_s2_time = data.seasonConfig.tryout1Session2Time
            values.tryout_2_s1_time = data.seasonConfig.tryout2Session1Time
            values.tryout_2_s2_time = data.seasonConfig.tryout2Session2Time
            values.tryout_2_s3_time = data.seasonConfig.tryout2Session3Time
            values.tryout_3_s1_time = data.seasonConfig.tryout3Session1Time
            values.tryout_3_s2_time = data.seasonConfig.tryout3Session2Time
            values.tryout_3_s3_time = data.seasonConfig.tryout3Session3Time
            values.season_s1_time = data.seasonConfig.seasonSession1Time
            values.season_s2_time = data.seasonConfig.seasonSession2Time
            values.season_s3_time = data.seasonConfig.seasonSession3Time
            values.division_draft_date =
                data.divisionLevel !== null
                    ? (divisionDraftDateByLevel[data.divisionLevel] ?? "")
                    : ""
        }

        return values
    }, [
        data.teamName,
        data.divisionName,
        data.divisionLevel,
        data.seasonLabel,
        data.seasonConfig,
        data.currentUserPreferredName,
        data.currentUserLastName,
        data.members
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

    const formatEmailList = (): string =>
        data.members
            .map((m) => `${m.displayName} ${m.lastName} <${m.email}>`)
            .join(", ")

    const handleGenerateEmail = () => {
        setShowEmailModal(true)
        setCopyEmailListSuccess(false)
        setCopySubjectSuccess(false)
        setCopyPlainTextSuccess(false)
        setCopyRichTextSuccess(false)
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

    const handleCopyEmailList = async () => {
        try {
            await navigator.clipboard.writeText(formatEmailList())
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
        <>
            <Card className="min-w-[280px] flex-1 border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <RiMailSendLine className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                        <CardTitle className="text-lg text-teal-700 dark:text-teal-300">
                            Send Welcome Message to Your Team
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-teal-700 dark:text-teal-300">
                        The draft is complete! Send a welcome message to your{" "}
                        {data.members.length > 0
                            ? `${data.members.length}-player `
                            : ""}
                        {data.teamName} roster in {data.divisionName} division.
                    </p>
                    <Button
                        type="button"
                        onClick={handleGenerateEmail}
                        className="bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
                    >
                        Generate Email
                    </Button>
                </CardContent>
            </Card>

            {showEmailModal && (
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
                            Welcome Email — {data.teamName}
                        </h3>
                        <Card className="mb-4 p-4">
                            <h4 className="mb-2 font-medium text-sm">
                                Recipients ({data.members.length} players)
                            </h4>
                            <p className="mb-2 break-all text-sm">
                                {formatEmailList()}
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
            )}
        </>
    )
}
