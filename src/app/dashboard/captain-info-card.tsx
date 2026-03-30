"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    RiCloseLine,
    RiMailSendLine,
    RiUserStarLine,
    RiPhoneLine,
    RiAlertLine,
    RiCalendarCheckLine,
    RiCheckboxCircleLine,
    RiCloseCircleFill
} from "@remixicon/react"
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
import { logContactDetailsViewed } from "./actions"
import { buildEventVariableValues } from "@/lib/email-template-variables"
import Link from "next/link"

export function WelcomeTeamCard({ data }: { data: CaptainWelcomeData }) {
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [showContactWarning, setShowContactWarning] = useState(false)
    const [showContactDetails, setShowContactDetails] = useState(false)
    const [copyEmailListSuccess, setCopyEmailListSuccess] = useState(false)
    const [copySubjectSuccess, setCopySubjectSuccess] = useState(false)
    const [copyPlainTextSuccess, setCopyPlainTextSuccess] = useState(false)
    const [copyRichTextSuccess, setCopyRichTextSuccess] = useState(false)
    const [copyContactEmailsSuccess, setCopyContactEmailsSuccess] =
        useState(false)
    const [copyContactPhonesSuccess, setCopyContactPhonesSuccess] =
        useState(false)

    const isDraftPhase = data.seasonConfig?.phase === "draft"

    // Show welcome section only if within 7 days of this division's draft date.
    // Fall back to isDraftPhase only when no draft date is available.
    const showWelcomeSection = data.divisionDraftDate
        ? Date.now() -
              new Date(`${data.divisionDraftDate}T00:00:00`).getTime() <
          7 * 24 * 60 * 60 * 1000
        : isDraftPhase
    const showAvailabilitySection =
        !showWelcomeSection && !!data.nextMatchAvailability

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
            Object.assign(
                values,
                buildEventVariableValues(data.seasonConfig, data.divisionLevel)
            )
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

    const handleViewContactDetails = () => {
        setShowContactWarning(true)
    }

    const handleCloseContactWarning = useCallback(() => {
        setShowContactWarning(false)
    }, [])

    const handleAcknowledgeWarning = async () => {
        try {
            await logContactDetailsViewed()
        } catch (err) {
            console.error("Failed to log contact details view:", err)
        }
        setShowContactWarning(false)
        setShowContactDetails(true)
        setCopyContactEmailsSuccess(false)
        setCopyContactPhonesSuccess(false)
    }

    const handleCloseContactDetails = useCallback(() => {
        setShowContactDetails(false)
    }, [])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (showContactDetails) handleCloseContactDetails()
                else if (showContactWarning) handleCloseContactWarning()
                else if (showEmailModal) handleCloseEmailModal()
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [
        showEmailModal,
        showContactWarning,
        showContactDetails,
        handleCloseEmailModal,
        handleCloseContactWarning,
        handleCloseContactDetails
    ])

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

    const handleCopyContactEmails = async () => {
        const emails = data.members
            .map((m) => `${m.displayName} ${m.lastName} <${m.email}>`)
            .join(", ")
        try {
            await navigator.clipboard.writeText(emails)
            setCopyContactEmailsSuccess(true)
            setTimeout(() => setCopyContactEmailsSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy contact emails:", err)
        }
    }

    const handleCopyContactPhones = async () => {
        const phones = data.members
            .filter((m) => m.phone)
            .map((m) => (m.phone as string).replace(/\D/g, ""))
            .join(", ")
        try {
            await navigator.clipboard.writeText(phones)
            setCopyContactPhonesSuccess(true)
            setTimeout(() => setCopyContactPhonesSuccess(false), 2000)
        } catch (err) {
            console.error("Failed to copy contact phone numbers:", err)
        }
    }

    return (
        <>
            <Card className="min-w-[280px] flex-1 border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <RiUserStarLine className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                        <CardTitle className="text-lg text-teal-700 dark:text-teal-300">
                            Captain Info
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {showWelcomeSection && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <RiMailSendLine className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                                <h3 className="font-medium text-sm text-teal-700 dark:text-teal-300">
                                    Send Welcome Message to Your Team
                                </h3>
                            </div>
                            <p className="text-sm text-teal-700 dark:text-teal-300">
                                The draft is complete! Send a welcome message to
                                your{" "}
                                {data.members.length > 0
                                    ? `${data.members.length}-player `
                                    : ""}
                                {data.teamName} roster in {data.divisionName}{" "}
                                division.
                            </p>
                            <Button
                                type="button"
                                onClick={handleGenerateEmail}
                                className="bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
                            >
                                Generate Email
                            </Button>
                        </div>
                    )}
                    {showAvailabilitySection && data.nextMatchAvailability && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <RiCalendarCheckLine className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                                <h3 className="font-medium text-sm text-teal-700 dark:text-teal-300">
                                    Team Availability for Next Match
                                </h3>
                            </div>
                            <p className="text-xs text-teal-600 dark:text-teal-400">
                                {new Date(
                                    `${data.nextMatchAvailability.eventDate}T00:00:00`
                                ).toLocaleDateString("en-US", {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric"
                                })}
                            </p>
                            <ul className="space-y-1">
                                {data.members.map((m) => {
                                    const isUnavailable =
                                        data.nextMatchAvailability!.unavailableUserIds.includes(
                                            m.userId
                                        )
                                    const name = m.displayName
                                    return (
                                        <li
                                            key={m.email}
                                            className="flex items-center gap-2 text-sm"
                                        >
                                            {isUnavailable ? (
                                                <RiCloseCircleFill className="h-4 w-4 shrink-0 text-destructive" />
                                            ) : (
                                                <RiCheckboxCircleLine className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            )}
                                            <span
                                                className={
                                                    isUnavailable
                                                        ? "text-destructive"
                                                        : "text-teal-700 dark:text-teal-300"
                                                }
                                            >
                                                {name} {m.lastName}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                            <Link
                                href="/dashboard/team-availability"
                                className="inline-flex items-center gap-1 text-teal-700 text-xs underline underline-offset-2 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-200"
                            >
                                View full season availability →
                            </Link>
                        </div>
                    )}
                    {(showWelcomeSection || showAvailabilitySection) && (
                        <hr className="border-teal-200 dark:border-teal-800" />
                    )}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <RiPhoneLine className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            <h3 className="font-medium text-sm text-teal-700 dark:text-teal-300">
                                Team Contact Information
                            </h3>
                        </div>
                        <Button
                            type="button"
                            onClick={handleViewContactDetails}
                            variant="outline"
                            className="border-teal-300 text-teal-700 hover:bg-teal-100 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-900"
                        >
                            View Contact Details
                        </Button>
                    </div>
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

            {showContactWarning && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={handleCloseContactWarning}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") handleCloseContactWarning()
                    }}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <div
                        className="relative w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="document"
                    >
                        <button
                            type="button"
                            onClick={handleCloseContactWarning}
                            className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>
                        <div className="mb-5 flex items-start gap-3">
                            <RiAlertLine className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
                            <div>
                                <h3 className="mb-2 font-semibold text-lg">
                                    Contact Information Notice
                                </h3>
                                <p className="text-muted-foreground text-sm">
                                    This contact information should only be used
                                    exclusively for BSD Volleyball League
                                    purposes. If you would like to contact
                                    someone for any other purpose, please ask
                                    them for their contact details directly in
                                    person.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCloseContactWarning}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleAcknowledgeWarning}
                            >
                                Acknowledge &amp; View Details
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {showContactDetails && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={handleCloseContactDetails}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") handleCloseContactDetails()
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
                            onClick={handleCloseContactDetails}
                            className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <RiCloseLine className="h-5 w-5" />
                        </button>
                        <h3 className="mb-4 font-semibold text-lg">
                            Team Contacts — {data.teamName}
                        </h3>
                        <div className="mb-4 space-y-2">
                            {data.members.map((m) => (
                                <div
                                    key={m.email}
                                    className="rounded border p-3 text-sm"
                                >
                                    <p className="font-medium">
                                        {m.displayName} {m.lastName}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {m.email}
                                    </p>
                                    {m.phone && (
                                        <p className="text-muted-foreground">
                                            {m.phone}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleCopyContactEmails}
                                variant="outline"
                            >
                                {copyContactEmailsSuccess
                                    ? "Copied!"
                                    : "Copy Email Addresses"}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleCopyContactPhones}
                                variant="outline"
                            >
                                {copyContactPhonesSuccess
                                    ? "Copied!"
                                    : "Copy Phone Numbers"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
