"use client"

import { RiCameraLine, RiImageAddLine } from "@remixicon/react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { compressImageForUpload } from "@/lib/image-compression"
import { SCORE_SHEET_COMPRESSION } from "@/lib/scoresheets/capture"
import {
    type CourtMatchInput,
    type CourtSummary,
    summarizeCourts
} from "@/lib/scoresheets/court-status"
import { cn } from "@/lib/utils"

import { saveScoresForDivision } from "../enter-scores/actions"
import type { MatchDateOption } from "../enter-scores/data"
import { ScoreSheetImageViewer } from "../enter-scores/score-sheet-image-viewer"
import {
    createSheetUpload,
    finalizeSheetUpload,
    getScoringNight,
    readUploadedSheet,
    type ScoringNight,
    type SheetInboxRow
} from "./actions"
import { type CourtMatch, CourtCard, STATE_TONE } from "./court-card"
import { CourtEditor, type SaveCourt } from "./court-editor"
import {
    courtForms,
    courtMatchProblems,
    draftGames,
    EMPTY_GAMES,
    type GameScores,
    scoreInputsByDivision
} from "./court-forms"
import { type LocalUpload, ProcessingCard } from "./processing-card"
import { UnfiledSheetCard } from "./unfiled-sheet-card"

const MAX_SOURCE_BYTES = 25 * 1024 * 1024
/** A read this old that still says "processing" died with its request. */
const LIVE_READ_MS = 5 * 60 * 1000

/** PUT with progress, which fetch cannot report for an upload. */
function putWithProgress(
    url: string,
    body: Blob,
    onProgress: (percent: number) => void
): Promise<boolean> {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", url)
        xhr.setRequestHeader("Content-Type", "image/jpeg")
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100))
            }
        }
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
        xhr.onerror = () => resolve(false)
        xhr.send(body)
    })
}

export function UploadScoreSheetsClient({
    matchDates,
    defaultDate,
    initialNight,
    picBaseUrl
}: {
    matchDates: MatchDateOption[]
    defaultDate: string
    initialNight: ScoringNight
    picBaseUrl: string
}) {
    const id = useId()
    const [date, setDate] = useState(defaultDate)
    const [night, setNight] = useState<ScoringNight>(initialNight)
    const [uploads, setUploads] = useState<LocalUpload[]>([])
    const [editingCourt, setEditingCourt] = useState<number | null>(null)
    const [savingCourt, setSavingCourt] = useState<number | null>(null)
    const [viewing, setViewing] = useState<string | null>(null)
    const [highlight, setHighlight] = useState<number | null>(null)
    const [dragging, setDragging] = useState(false)
    const fileInput = useRef<HTMLInputElement | null>(null)
    const cameraInput = useRef<HTMLInputElement | null>(null)
    // Photos are read one after another: React runs one server action at a
    // time per page anyway, and a queue keeps the cards in the right order.
    const queue = useRef<Promise<void>>(Promise.resolve())

    const refresh = useCallback(
        async (forDate = date) => {
            const result = await getScoringNight(forDate)
            if (result.status) setNight(result.data)
        },
        [date]
    )

    const changeDate = async (next: string) => {
        setDate(next)
        setNight({ divisions: [], rows: [] })
        await refresh(next)
    }

    const matchesById = useMemo(() => {
        const map = new Map<number, CourtMatch>()
        for (const division of night.divisions) {
            for (const match of division.matches) {
                map.set(match.matchId, {
                    match,
                    divisionName:
                        night.divisions.length > 1 ? division.divisionName : ""
                })
            }
        }
        return map
    }, [night.divisions])

    const courts = useMemo(() => {
        const matches: CourtMatchInput[] = night.divisions.flatMap((d) =>
            d.matches.map((m) => ({ ...m, divisionId: d.divisionId }))
        )
        return summarizeCourts(matches, night.rows)
    }, [night])

    const rowsById = useMemo(
        () => new Map(night.rows.map((r) => [r.scoreSheetId, r])),
        [night.rows]
    )
    const scheduledCourts = new Set(courts.map((c) => c.court))
    const unfiled = night.rows.filter(
        (r) => r.court === null || !scheduledCourts.has(r.court)
    )

    // A read started from another tab or device, or one this page was
    // reloaded in the middle of, finishes on the server; check back for it.
    const liveElsewhere = night.rows.some(
        (r) =>
            r.status === "processing" &&
            r.readStartedAt !== null &&
            Date.now() - Date.parse(r.readStartedAt) < LIVE_READ_MS
    )
    useEffect(() => {
        if (!liveElsewhere || uploads.length > 0) return
        const timer = setInterval(() => void refresh(), 5000)
        return () => clearInterval(timer)
    }, [liveElsewhere, uploads.length, refresh])

    const courtMatchesFor = (summary: CourtSummary): CourtMatch[] =>
        summary.matchIds
            .map((matchId) => matchesById.get(matchId))
            .filter((m): m is CourtMatch => m !== undefined)

    const showCourt = (court: number) => {
        setHighlight(court)
        document
            .getElementById(`court-${court}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        setTimeout(
            () =>
                setHighlight((current) => (current === court ? null : current)),
            2500
        )
    }

    const patchUpload = (key: string, patch: Partial<LocalUpload>) =>
        setUploads((list) =>
            list.map((u) => (u.key === key ? { ...u, ...patch } : u))
        )

    const processOne = async (
        upload: LocalUpload,
        file: File,
        forDate: string
    ) => {
        try {
            patchUpload(upload.key, { stage: "preparing" })
            const compressed = await compressImageForUpload(
                file,
                SCORE_SHEET_COMPRESSION
            )
            const ticket = await createSheetUpload({
                date: forDate,
                contentLength: compressed.blob.size
            })
            if (!ticket.status) {
                toast.error(ticket.message)
                return
            }

            patchUpload(upload.key, { stage: "uploading", progress: 0 })
            const uploaded = await putWithProgress(
                ticket.data.uploadUrl,
                compressed.blob,
                (progress) => patchUpload(upload.key, { progress })
            )
            if (!uploaded) {
                toast.error(
                    "The photo didn't upload. Check your signal and try again."
                )
                return
            }

            const finalized = await finalizeSheetUpload({
                date: forDate,
                objectKey: ticket.data.objectKey
            })
            if (!finalized.status) {
                toast.error(finalized.message)
                return
            }

            patchUpload(upload.key, {
                stage: "reading",
                readingSince: Date.now()
            })
            const read = await readUploadedSheet({
                scoreSheetId: finalized.data.scoreSheetId
            })
            await refresh(forDate)
            if (!read.status) toast.error(read.message)
            else if (read.data.court === null) {
                toast.warning(
                    "Couldn't tell which court that is. Pick it below."
                )
            } else {
                const court = read.data.court
                toast.success(`Court ${court} read. Check it and save.`)
                setTimeout(() => showCourt(court), 100)
            }
        } catch {
            toast.error("That photo could not be processed. Try again.")
        } finally {
            URL.revokeObjectURL(upload.previewUrl)
            setUploads((list) => list.filter((u) => u.key !== upload.key))
        }
    }

    const handleFiles = (files: File[]) => {
        // Cleared so the same file can be chosen again, and so a phone user
        // can photograph the next court without the input ignoring them.
        if (fileInput.current) fileInput.current.value = ""
        if (cameraInput.current) cameraInput.current.value = ""

        const images = files.filter((f) => f.type.startsWith("image/"))
        if (images.length === 0) {
            if (files.length > 0) toast.error("Those do not look like photos.")
            return
        }
        const forDate = date
        for (const file of images) {
            if (file.size > MAX_SOURCE_BYTES) {
                toast.error("That photo is over 25MB.")
                continue
            }
            const upload: LocalUpload = {
                key: crypto.randomUUID(),
                previewUrl: URL.createObjectURL(file),
                stage: "waiting",
                progress: 0,
                readingSince: null
            }
            setUploads((list) => [...list, upload])
            queue.current = queue.current.then(() =>
                processOne(upload, file, forDate)
            )
        }
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    const retry = async (row: SheetInboxRow, court?: number) => {
        const result = await readUploadedSheet({
            scoreSheetId: row.scoreSheetId,
            court
        })
        if (!result.status) toast.error(result.message)
        await refresh()
    }

    const saveCourt =
        (summary: CourtSummary): SaveCourt =>
        async (games) => {
            const { forms, resolved } = courtForms(night.divisions, games)
            const problems: Record<number, string[]> = {}
            for (const matchId of Object.keys(games).map(Number)) {
                const found = courtMatchProblems(
                    forms[matchId],
                    resolved.get(matchId),
                    games[matchId] ?? EMPTY_GAMES
                )
                if (found.length > 0) problems[matchId] = found
            }
            if (Object.keys(problems).length > 0) {
                return { ok: false, problems }
            }

            setSavingCourt(summary.court)
            try {
                const groups = scoreInputsByDivision(
                    night.divisions,
                    Object.keys(games).map(Number),
                    forms
                )
                for (const group of groups) {
                    const result = await saveScoresForDivision(
                        group.divisionId,
                        date,
                        group.inputs
                    )
                    if (!result.status) {
                        toast.error(result.message)
                        await refresh()
                        return { ok: false }
                    }
                }
                toast.success(`Court ${summary.court} saved.`)
                await refresh()
                return { ok: true }
            } catch {
                toast.error("Saving failed. Please try again.")
                return { ok: false }
            } finally {
                setSavingCourt(null)
            }
        }

    /** "Looks right": save what the photo says, for the matches it read. */
    const quickSave = async (summary: CourtSummary) => {
        const games: Record<number, GameScores> = {}
        for (const matchId of summary.matchIds) {
            const draft = summary.drafts[matchId]
            if (draft && !draft.empty) games[matchId] = draftGames(draft)
        }
        const result = await saveCourt(summary)(games)
        // Anything the form would refuse is easier to fix with it in front.
        if (!result.ok && result.problems) setEditingCourt(summary.court)
    }

    const editing = courts.find((c) => c.court === editingCourt) ?? null
    const editingRow = editing?.sheet
        ? (rowsById.get(editing.sheet.scoreSheetId) ?? null)
        : null
    const remaining = courts.filter((c) => c.state !== "saved").length

    return (
        <div className="space-y-5 pb-28 md:pb-0">
            <div className="flex flex-wrap items-center gap-3">
                <label htmlFor={`${id}-night`} className="font-medium text-sm">
                    Match night
                </label>
                <Select
                    value={date}
                    onValueChange={(v) => void changeDate(v)}
                    disabled={uploads.length > 0}
                >
                    <SelectTrigger
                        className="w-full sm:w-56"
                        id={`${id}-night`}
                    >
                        <SelectValue placeholder="Select a date" />
                    </SelectTrigger>
                    <SelectContent>
                        {matchDates.map((d) => (
                            <SelectItem key={d.date} value={d.date}>
                                {d.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {courts.length > 0 && (
                <div>
                    <p className="mb-2 text-muted-foreground text-sm">
                        {remaining === 0
                            ? "Every court is saved for this night."
                            : `${courts.length - remaining} of ${courts.length} courts saved`}
                    </p>
                    <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
                        {courts.map((c) => (
                            <button
                                key={c.court}
                                type="button"
                                onClick={() => showCourt(c.court)}
                                className={cn(
                                    "shrink-0 rounded-full px-3 py-1.5 font-medium text-sm",
                                    STATE_TONE[c.state]
                                )}
                            >
                                Court {c.court}
                                {c.state === "saved" && " ✓"}
                                {c.state === "needs_review" && " !"}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Desktop: inline buttons and a drop zone. Phones get the bar at the bottom. */}
            <div className="hidden gap-3 md:flex">
                <Button size="lg" onClick={() => cameraInput.current?.click()}>
                    <RiCameraLine className="mr-2 h-5 w-5" />
                    Take a photo
                </Button>
                <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => {
                        e.preventDefault()
                        setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault()
                        setDragging(false)
                        handleFiles([...e.dataTransfer.files])
                    }}
                    className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-sm transition-colors",
                        dragging
                            ? "border-primary bg-primary/5"
                            : "border-muted-foreground/30 hover:border-primary/60"
                    )}
                >
                    <RiImageAddLine className="h-5 w-5" />
                    Drop tonight's photos here, or click to choose
                </button>
            </div>

            {uploads.length > 0 && (
                <div className="space-y-3">
                    {uploads.map((upload) => (
                        <ProcessingCard key={upload.key} upload={upload} />
                    ))}
                </div>
            )}

            {unfiled.map((row) => (
                <UnfiledSheetCard
                    key={row.scoreSheetId}
                    row={row}
                    courts={courts.map((c) => c.court)}
                    picBaseUrl={picBaseUrl}
                    onRetry={(court) => retry(row, court)}
                    onRemoved={() => refresh()}
                    onViewPhoto={setViewing}
                />
            ))}

            {courts.length === 0 && night.divisions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    No matches on this night.
                </p>
            ) : (
                <div className="grid items-start gap-4 lg:grid-cols-2">
                    {courts.map((summary) => (
                        <CourtCard
                            key={summary.court}
                            summary={summary}
                            courtMatches={courtMatchesFor(summary)}
                            divisions={night.divisions}
                            row={
                                summary.sheet
                                    ? (rowsById.get(
                                          summary.sheet.scoreSheetId
                                      ) ?? null)
                                    : null
                            }
                            picBaseUrl={picBaseUrl}
                            busy={savingCourt === summary.court}
                            highlight={highlight === summary.court}
                            onQuickSave={() => void quickSave(summary)}
                            onEdit={() => setEditingCourt(summary.court)}
                            onViewPhoto={setViewing}
                            onRetry={() => {
                                const row = summary.sheet
                                    ? rowsById.get(summary.sheet.scoreSheetId)
                                    : undefined
                                if (row) void retry(row, summary.court)
                            }}
                        />
                    ))}
                </div>
            )}

            {/*
             * The phone case is the common one: an admin walks the courts at
             * the end of the night photographing each sheet in turn, so the
             * camera sits where a thumb reaches. `capture` opens the camera
             * directly rather than a file browser.
             */}
            <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
                <Button
                    className="h-14 flex-1 text-base"
                    onClick={() => cameraInput.current?.click()}
                >
                    <RiCameraLine className="mr-2 h-6 w-6" />
                    Take a photo
                </Button>
                <Button
                    variant="outline"
                    className="h-14 px-4"
                    onClick={() => fileInput.current?.click()}
                    aria-label="Choose photos"
                >
                    <RiImageAddLine className="h-6 w-6" />
                </Button>
            </div>

            <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFiles([...(e.target.files ?? [])])}
            />
            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles([...(e.target.files ?? [])])}
            />

            {editing && (
                <CourtEditor
                    key={editing.court}
                    summary={editing}
                    courtMatches={courtMatchesFor(editing)}
                    divisions={night.divisions}
                    read={editing.sheet?.read ?? null}
                    photoUrl={
                        editingRow
                            ? `${picBaseUrl}/${editingRow.imagePath}`
                            : null
                    }
                    onClose={() => setEditingCourt(null)}
                    onSave={saveCourt(editing)}
                />
            )}
            {viewing && (
                <ScoreSheetImageViewer
                    imageUrl={viewing}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    )
}
