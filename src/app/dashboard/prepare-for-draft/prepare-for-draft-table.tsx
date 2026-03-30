"use client"

import {
    useState,
    useEffect,
    useRef,
    useMemo,
    useCallback,
    useTransition
} from "react"
import { useRouter } from "next/navigation"
import type {
    PrepareForDraftData,
    PlayerRow,
    PairDifferential,
    CaptainInfo,
    ConsideredButUndraftedPlayer
} from "./actions"
import { setCaptainRound, setPairDiff } from "./actions"
import type { DraftHomeworkDetailResult } from "@/app/dashboard/homework-status/actions"
import { getDraftHomeworkDetail } from "@/app/dashboard/homework-status/actions"
import { CaptainHomeworkPopup } from "@/components/captain-homework-popup"
import {
    usePlayerDetailModal,
    PlayerDetailPopup
} from "@/components/player-detail"
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

function getRoundClass(round: number): string {
    if (round <= 2) return "bg-green-50 text-green-700"
    if (round <= 4) return "bg-lime-50 text-lime-700"
    if (round <= 6) return "bg-yellow-50 text-yellow-700"
    if (round <= 8) return "bg-orange-50 text-orange-700"
    return "text-muted-foreground"
}

function PlayerTableRow({
    player,
    isCaptain,
    setRound,
    onSetRound,
    onOpenDetail
}: {
    player: PlayerRow
    isCaptain: boolean
    setRound?: number
    onSetRound?: (v: number) => void
    onOpenDetail: (userId: string) => void
}) {
    const rowClass = isCaptain
        ? "border-t bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60"
        : player.isPairPick
          ? "border-t bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-950/60"
          : "border-t hover:bg-muted/30"
    const stickyBg = isCaptain
        ? "bg-blue-50 dark:bg-blue-950/40"
        : player.isPairPick
          ? "bg-violet-50 dark:bg-violet-950/40"
          : "bg-background"

    return (
        <tr className={rowClass}>
            <td
                className={`sticky left-0 z-10 whitespace-nowrap border-r px-3 py-2 font-medium ${stickyBg}`}
            >
                <button
                    type="button"
                    onClick={() => onOpenDetail(player.userId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {player.displayName} {player.lastName}
                </button>
                {player.isPairPick && (
                    <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 font-semibold text-violet-700 text-xs dark:bg-violet-900/40 dark:text-violet-300">
                        PP
                    </span>
                )}
                {isCaptain && (
                    <span className="ml-1.5 rounded bg-blue-100 px-1 py-0.5 font-semibold text-blue-700 text-xs dark:bg-blue-900/40 dark:text-blue-300">
                        CAP
                    </span>
                )}
            </td>
            {player.teamRounds.map((tr) => (
                <td
                    key={tr.teamId}
                    className={`px-3 py-2 text-center ${getRoundClass(tr.mappedRound)}`}
                >
                    {tr.mappedRound >= 9 ? (
                        <span className="text-muted-foreground">
                            {tr.teamCompletedHomework ? "— (9)" : "—"}
                        </span>
                    ) : (
                        tr.mappedRound.toFixed(1)
                    )}
                </td>
            ))}
            <td className="px-3 py-2 text-center tabular-nums">
                {player.captainAverage.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">
                {player.draftHistoryAverage !== null
                    ? player.draftHistoryAverage.toFixed(1)
                    : "—"}
            </td>
            <td className="px-3 py-2 text-center font-semibold tabular-nums">
                {player.recommendedRound.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center">
                {isCaptain && onSetRound !== undefined ? (
                    <select
                        value={setRound ?? ""}
                        onChange={(e) => onSetRound(Number(e.target.value))}
                        className="rounded border bg-background px-2 py-1 text-sm"
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                ) : null}
            </td>
        </tr>
    )
}

function clampRound(v: number): number {
    return Math.min(8, Math.max(1, Math.round(v)))
}

interface SeasonInfo {
    id: number
    year: number
    name: string
}

export function PrepareForDraftTable({
    data,
    allSeasons,
    playerPicUrl
}: {
    data: PrepareForDraftData
    allSeasons: SeasonInfo[]
    playerPicUrl: string
}) {
    const router = useRouter()
    const modal = usePlayerDetailModal()
    const [captainRoundOverrides, setCaptainRoundOverrides] = useState<
        Record<string, number>
    >({})
    const [pairDiffOverrides, setPairDiffOverrides] = useState<
        Record<string, number>
    >({})
    const [saving, setSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
        "idle"
    )
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [homeworkPopupOpen, setHomeworkPopupOpen] = useState(false)
    const [homeworkData, setHomeworkData] =
        useState<DraftHomeworkDetailResult | null>(null)
    const [, startHomeworkTransition] = useTransition()

    const handleCaptainNameClick = (captainUserId: string) => {
        setHomeworkPopupOpen(true)
        setHomeworkData(null)
        startHomeworkTransition(async () => {
            const result = await getDraftHomeworkDetail(
                captainUserId,
                data.seasonId
            )
            setHomeworkData(result)
        })
    }
    const [copyEmailListSuccess, setCopyEmailListSuccess] = useState(false)
    const [copySubjectSuccess, setCopySubjectSuccess] = useState(false)
    const [copyPlainTextSuccess, setCopyPlainTextSuccess] = useState(false)
    const [copyRichTextSuccess, setCopyRichTextSuccess] = useState(false)

    const tableWrapperRef = useRef<HTMLDivElement>(null)
    const theadRef = useRef<HTMLTableSectionElement>(null)

    useEffect(() => {
        const wrapper = tableWrapperRef.current
        const thead = theadRef.current
        if (!wrapper || !thead) return

        const update = () => {
            const top = wrapper.getBoundingClientRect().top
            const maxShift = wrapper.offsetHeight - thead.offsetHeight
            if (top < 0 && -top < maxShift) {
                thead.style.transform = `translateY(${-top}px)`
            } else {
                thead.style.transform = ""
            }
        }

        window.addEventListener("scroll", update, { passive: true })
        return () => window.removeEventListener("scroll", update)
    }, [])

    const hasHomework = data.players.length > 0
    const captainIds = new Set(data.captains.map((c) => c.userId))

    async function handleSave() {
        setSaving(true)
        setSaveStatus("idle")
        try {
            const captainSaves = data.players
                .filter((p) => captainIds.has(p.userId))
                .map((p) => {
                    const round =
                        captainRoundOverrides[p.userId] ??
                        data.savedCaptainRounds[p.userId] ??
                        clampRound(p.recommendedRound)
                    return setCaptainRound({
                        captainId: p.userId,
                        round,
                        divisionId: data.divisionId
                    })
                })

            const pairSaves = data.pairDifferentials.map((pair) => {
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
                return setPairDiff({
                    player1Id: pair.player1UserId,
                    player2Id: pair.player2UserId,
                    diff,
                    divisionId: data.divisionId
                })
            })

            await Promise.all([...captainSaves, ...pairSaves])
            setSaveStatus("saved")
            router.refresh()
        } catch {
            setSaveStatus("error")
        } finally {
            setSaving(false)
        }
    }

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

    const formatEmailList = (captains: CaptainInfo[]): string =>
        captains
            .map((c) => `${c.displayName} ${c.lastName} <${c.email}>`)
            .join(", ")

    const handleGenerateMessage = () => {
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
        <div className="space-y-4">
            {data.isLeagueWide && data.availableDivisions.length > 1 && (
                <div className="flex items-center gap-2">
                    <label
                        htmlFor="division-select"
                        className="font-medium text-sm"
                    >
                        Division
                    </label>
                    <select
                        id="division-select"
                        value={data.divisionId}
                        onChange={(e) =>
                            router.push(
                                `/dashboard/prepare-for-draft?divisionId=${e.target.value}`
                            )
                        }
                        className="rounded border bg-background px-2 py-1 text-sm"
                    >
                        {data.availableDivisions.map((div) => (
                            <option key={div.id} value={div.id}>
                                {div.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {!hasHomework && (
                <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                    No draft homework has been submitted yet for this division.
                    Players will appear here once at least one captain ranks
                    them.
                </div>
            )}

            {data.teams.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No captains have been assigned to this division yet.
                </div>
            ) : (
                <div
                    ref={tableWrapperRef}
                    className="overflow-x-auto rounded-md border"
                >
                    <table className="min-w-full border-collapse text-sm">
                        <thead ref={theadRef} className="relative z-20">
                            <tr className="bg-muted">
                                <th className="sticky left-0 z-30 whitespace-nowrap border-r bg-muted px-3 py-2 text-left font-medium">
                                    Player
                                </th>
                                {data.teams.map((team) => (
                                    <th
                                        key={team.teamId}
                                        className="whitespace-nowrap px-3 py-2 text-center font-medium"
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleCaptainNameClick(
                                                    team.captain1.userId
                                                )
                                            }
                                            className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                                            title={
                                                team.captain2
                                                    ? `${team.captain1.displayName} ${team.captain1.lastName} & ${team.captain2.displayName} ${team.captain2.lastName} — view homework`
                                                    : `${team.captain1.displayName} ${team.captain1.lastName} — view homework`
                                            }
                                        >
                                            {team.captain1.displayName}
                                        </button>
                                    </th>
                                ))}
                                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                                    Cap Avg
                                </th>
                                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                                    Draft History
                                </th>
                                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                                    Rec&apos;d Round
                                </th>
                                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                                    Set Round
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.players.map((player) => {
                                const isCap = captainIds.has(player.userId)
                                const roundValue =
                                    captainRoundOverrides[player.userId] ??
                                    data.savedCaptainRounds[player.userId] ??
                                    clampRound(player.recommendedRound)
                                return (
                                    <PlayerTableRow
                                        key={player.userId}
                                        player={player}
                                        isCaptain={isCap}
                                        setRound={
                                            isCap ? roundValue : undefined
                                        }
                                        onSetRound={
                                            isCap
                                                ? (v) => {
                                                      setCaptainRoundOverrides(
                                                          (prev) => ({
                                                              ...prev,
                                                              [player.userId]: v
                                                          })
                                                      )
                                                      setSaveStatus("idle")
                                                  }
                                                : undefined
                                        }
                                        onOpenDetail={modal.openPlayerDetail}
                                    />
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {(data.teams.length > 0 || data.pairDifferentials.length > 0) && (
                <div className="flex items-center gap-4 pt-2">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-lg bg-primary px-8 py-3 font-semibold text-base text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Lock In Picks"}
                    </button>
                    {saveStatus === "saved" && (
                        <span className="font-medium text-green-700 text-sm">
                            Saved successfully
                        </span>
                    )}
                    {saveStatus === "error" && (
                        <span className="font-medium text-red-700 text-sm">
                            Save failed — please try again
                        </span>
                    )}
                </div>
            )}

            {data.pairDifferentials.length > 0 && (
                <div className="space-y-2">
                    <h2 className="font-semibold text-lg">Set Pair Rounds</h2>
                    <div className="rounded-md border">
                        <table className="min-w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-muted/50">
                                    <th className="px-3 py-2 text-left font-medium">
                                        Player 1 (higher)
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Rec&apos;d Round
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Player 2 (lower)
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Rec&apos;d Round
                                    </th>
                                    <th className="px-3 py-2 text-center font-medium">
                                        Pair Round
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.pairDifferentials.map((pair) => {
                                    const pairKey = `${pair.player1UserId}:${pair.player2UserId}`
                                    const pinnedUnrated = pair.captainIsLower
                                        ? pair.player1Round === 9
                                        : pair.player2Round === 9
                                    const pinnedRound = pair.captainIsLower
                                        ? pair.player1Round
                                        : pair.player2Round
                                    const defaultDiff = pinnedUnrated
                                        ? 8
                                        : clampRound(pinnedRound)
                                    const diffValue =
                                        pairDiffOverrides[pairKey] ??
                                        data.savedPairDiffs[pairKey] ??
                                        defaultDiff
                                    return (
                                        <PairDifferentialRow
                                            key={pairKey}
                                            pair={pair}
                                            setValue={diffValue}
                                            onSetValue={(v) => {
                                                setPairDiffOverrides(
                                                    (prev) => ({
                                                        ...prev,
                                                        [pairKey]: v
                                                    })
                                                )
                                                setSaveStatus("idle")
                                            }}
                                            onOpenDetail={
                                                modal.openPlayerDetail
                                            }
                                        />
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {(data.teams.length > 0 || data.pairDifferentials.length > 0) && (
                <div className="flex items-center gap-4 pt-2">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-lg bg-primary px-8 py-3 font-semibold text-base text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Lock In Picks"}
                    </button>
                    {saveStatus === "saved" && (
                        <span className="font-medium text-green-700 text-sm">
                            Saved successfully
                        </span>
                    )}
                    {saveStatus === "error" && (
                        <span className="font-medium text-red-700 text-sm">
                            Save failed — please try again
                        </span>
                    )}
                </div>
            )}

            {data.captains.length > 0 && data.emailTemplate && (
                <div className="flex items-center gap-4 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleGenerateMessage}
                    >
                        Generate Message ({data.captains.length} captains)
                    </Button>
                </div>
            )}

            <div className="space-y-2 pt-4">
                <h2 className="font-semibold text-lg">
                    Players Considered but not Drafted
                </h2>
                {!data.consideredButUndrafted.isRelevant ? (
                    <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                        {data.consideredButUndrafted.message}
                    </div>
                ) : data.consideredButUndrafted.players.length === 0 ? (
                    <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                        {data.consideredButUndrafted.message}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-muted-foreground text-sm">
                            {data.consideredButUndrafted.message}
                        </p>
                        <div className="rounded-md border">
                            <table className="min-w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-muted/50">
                                        <th className="px-3 py-2 text-left font-medium">
                                            Player
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium">
                                            Considered In
                                        </th>
                                        <th className="px-3 py-2 text-center font-medium">
                                            Score
                                        </th>
                                        <th className="px-3 py-2 text-center font-medium">
                                            Homework Entries
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.consideredButUndrafted.players.map(
                                        (player) => (
                                            <ConsideredButUndraftedRow
                                                key={player.userId}
                                                player={player}
                                                onOpenDetail={
                                                    modal.openPlayerDetail
                                                }
                                            />
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

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
                            Email Captains
                        </h3>
                        <Card className="mb-4 p-4">
                            <h4 className="mb-2 font-medium text-sm">
                                Recipients
                            </h4>
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
                datesMissing={modal.unavailableDates}
                playoffDates={modal.playoffDates}
                ratingAverages={modal.ratingAverages}
                sharedRatingNotes={modal.sharedRatingNotes}
                privateRatingNotes={modal.privateRatingNotes}
                viewerRating={modal.viewerRating}
            />

            <CaptainHomeworkPopup
                open={homeworkPopupOpen}
                onClose={() => setHomeworkPopupOpen(false)}
                data={homeworkData}
                isLoading={!homeworkData && homeworkPopupOpen}
                playerPicUrl={playerPicUrl}
            />
        </div>
    )
}

function PairDifferentialRow({
    pair,
    setValue,
    onSetValue,
    onOpenDetail
}: {
    pair: PairDifferential
    setValue?: number
    onSetValue?: (v: number) => void
    onOpenDetail: (userId: string) => void
}) {
    const p2Unrated = pair.player2Round === 9
    // The pinned player is player2 normally, or player1 when captainIsLower
    const pinnedUnrated = pair.captainIsLower
        ? pair.player1Round === 9
        : p2Unrated

    return (
        <tr className="border-t hover:bg-muted/30">
            <td className="px-3 py-2 font-medium">
                <button
                    type="button"
                    onClick={() => onOpenDetail(pair.player1UserId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {pair.player1DisplayName} {pair.player1LastName}
                </button>
                {pair.captainIsLower && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-300">
                        pinned
                    </span>
                )}
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
                {pair.player1Round.toFixed(1)}
            </td>
            <td className="px-3 py-2 font-medium">
                <button
                    type="button"
                    onClick={() => onOpenDetail(pair.player2UserId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {pair.player2DisplayName} {pair.player2LastName}
                </button>
                {p2Unrated && (
                    <span className="ml-1.5 text-muted-foreground text-xs">
                        (unrated)
                    </span>
                )}
                {!pair.captainIsLower && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-300">
                        pinned
                    </span>
                )}
            </td>
            <td className="px-3 py-2 text-center text-muted-foreground tabular-nums">
                {p2Unrated ? "—" : pair.player2Round.toFixed(1)}
            </td>
            <td className="px-3 py-2 text-center">
                <select
                    value={setValue ?? ""}
                    onChange={(e) => onSetValue?.(Number(e.target.value))}
                    className="rounded border bg-background px-2 py-1 text-sm"
                    title={
                        pinnedUnrated
                            ? "Pinned player is unrated — defaulting to round 8"
                            : undefined
                    }
                >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>
            </td>
        </tr>
    )
}

function ConsideredButUndraftedRow({
    player,
    onOpenDetail
}: {
    player: ConsideredButUndraftedPlayer
    onOpenDetail: (userId: string) => void
}) {
    return (
        <tr className="border-t hover:bg-muted/30">
            <td className="px-3 py-2 font-medium">
                <button
                    type="button"
                    onClick={() => onOpenDetail(player.userId)}
                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                    {player.displayName} {player.lastName}
                </button>
                {player.pairDisplayName && (
                    <span className="text-muted-foreground">
                        {" "}
                        (pair: {player.pairDisplayName})
                    </span>
                )}
            </td>
            <td className="px-3 py-2 text-sm">
                {player.consideredInDivisions.join(", ")}
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
                {Math.round(player.score)}
            </td>
            <td className="px-3 py-2 text-center tabular-nums">
                {player.considerationCount}
            </td>
        </tr>
    )
}
