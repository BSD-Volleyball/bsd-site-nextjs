"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { compressImageForUpload } from "@/lib/image-compression"
import { SCORE_SHEET_COMPRESSION } from "@/lib/scoresheets/capture"
import { cn } from "@/lib/utils"

import type { MatchDateOption } from "../enter-scores/actions"
import {
    createSheetUpload,
    deleteUploadedSheet,
    finalizeSheetUpload,
    getSheetInbox,
    readUploadedSheet,
    type SheetInboxRow
} from "./actions"

const MAX_SOURCE_BYTES = 25 * 1024 * 1024

const STATUS_LABEL: Record<string, string> = {
    pending: "Not read yet",
    processing: "Reading…",
    read: "Read cleanly",
    needs_review: "Needs a look",
    unidentified: "Court unknown",
    not_located: "Could not find the page",
    failed: "Failed",
    confirmed: "Confirmed"
}

const STATUS_TONE: Record<string, string> = {
    read: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
    confirmed:
        "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
    needs_review:
        "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    unidentified:
        "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    processing: "bg-muted text-muted-foreground",
    pending: "bg-muted text-muted-foreground",
    not_located: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
    failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
}

export function ScoreSheetInboxClient({
    matchDates,
    defaultDate,
    initialRows,
    picBaseUrl
}: {
    matchDates: MatchDateOption[]
    defaultDate: string
    initialRows: SheetInboxRow[]
    picBaseUrl: string
}) {
    const [date, setDate] = useState(defaultDate)
    const [rows, setRows] = useState<SheetInboxRow[]>(initialRows)
    const [busy, setBusy] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const fileInput = useRef<HTMLInputElement | null>(null)
    const cameraInput = useRef<HTMLInputElement | null>(null)

    const refresh = async (forDate = date) => {
        const result = await getSheetInbox(forDate)
        if (result.status) setRows(result.data)
    }

    const changeDate = async (next: string) => {
        setDate(next)
        setRows([])
        await refresh(next)
    }

    /**
     * Uploaded and read one at a time rather than all at once: each read
     * decodes a multi-megapixel photo, and six of those in parallel would
     * make one slow request out of six quick ones.
     */
    const handleFiles = async (files: File[]) => {
        const images = files.filter((f) => f.type.startsWith("image/"))
        if (images.length === 0) {
            toast.error("Those do not look like photos.")
            return
        }

        for (const [index, file] of images.entries()) {
            const label = `${index + 1} of ${images.length}`
            if (file.size > MAX_SOURCE_BYTES) {
                toast.error(`Photo ${label} is over 25MB.`)
                continue
            }

            setBusy(`Uploading ${label}…`)
            try {
                const compressed = await compressImageForUpload(
                    file,
                    SCORE_SHEET_COMPRESSION
                )

                const ticket = await createSheetUpload({
                    date,
                    contentLength: compressed.blob.size
                })
                if (!ticket.status) {
                    toast.error(ticket.message)
                    continue
                }

                const put = await fetch(ticket.data.uploadUrl, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "image/jpeg",
                        "Content-Length": String(compressed.blob.size)
                    },
                    body: compressed.blob
                })
                if (!put.ok) {
                    toast.error(`Upload of photo ${label} failed.`)
                    continue
                }

                const finalized = await finalizeSheetUpload({
                    date,
                    objectKey: ticket.data.objectKey
                })
                if (!finalized.status) {
                    toast.error(finalized.message)
                    continue
                }

                setBusy(`Reading ${label}…`)
                const read = await readUploadedSheet({
                    scoreSheetId: finalized.data.scoreSheetId
                })
                if (read.status && read.data.court !== null) {
                    toast.success(`Court ${read.data.court} read.`)
                }
                await refresh()
            } catch {
                toast.error(`Photo ${label} could not be processed.`)
            }
        }
        setBusy(null)
        // Cleared so the same file can be chosen again, and so a phone user
        // can photograph the next court without the input ignoring them.
        if (fileInput.current) fileInput.current.value = ""
        if (cameraInput.current) cameraInput.current.value = ""
    }

    const retry = async (row: SheetInboxRow, court?: number) => {
        setBusy("Reading…")
        const result = await readUploadedSheet({
            scoreSheetId: row.scoreSheetId,
            court
        })
        if (!result.status) toast.error(result.message)
        await refresh()
        setBusy(null)
    }

    const remove = async (row: SheetInboxRow) => {
        const result = await deleteUploadedSheet(row.scoreSheetId)
        if (!result.status) toast.error(result.message)
        await refresh()
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="sheet-date" className="font-medium text-sm">
                    Match night:
                </label>
                <Select value={date} onValueChange={changeDate}>
                    <SelectTrigger className="w-56" id="sheet-date">
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

            {/*
             * The camera comes first because that is the phone case, and the
             * phone case is the common one: an admin walks the courts at the
             * end of the night photographing each sheet in turn. `capture`
             * opens the camera directly rather than a file browser, and the
             * input takes one photo at a time because that is what a camera
             * returns.
             */}
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    size="lg"
                    disabled={busy !== null}
                    onClick={() => cameraInput.current?.click()}
                >
                    {busy ?? "Take a photo"}
                </Button>
                <span className="text-muted-foreground text-sm">
                    One sheet at a time. It reads as soon as you take it.
                </span>
            </div>
            <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void handleFiles([...(e.target.files ?? [])])}
            />

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
                    void handleFiles([...e.dataTransfer.files])
                }}
                disabled={busy !== null}
                className={cn(
                    "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
                    dragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/30 hover:border-primary/60",
                    busy !== null && "opacity-60"
                )}
            >
                <span className="font-medium">
                    {busy ?? "Or drop tonight's photos here, all at once"}
                </span>
                <span className="text-muted-foreground text-sm">
                    One photo per court. Get all four corner marks in frame.
                </span>
            </button>
            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles([...(e.target.files ?? [])])}
            />

            {rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    No photos for this night yet.
                </p>
            ) : (
                <div className="space-y-3">
                    {rows.map((row) => (
                        <Card key={row.scoreSheetId}>
                            <CardContent className="flex flex-wrap items-start gap-4 p-4">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={`${picBaseUrl}/${row.imagePath}`}
                                    alt={
                                        row.court
                                            ? `Court ${row.court} score sheet`
                                            : "Score sheet"
                                    }
                                    className="h-24 w-20 rounded border object-cover"
                                />
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold">
                                            {row.court
                                                ? `Court ${row.court}`
                                                : "Court not yet known"}
                                        </span>
                                        <Badge
                                            className={
                                                STATUS_TONE[row.status] ?? ""
                                            }
                                        >
                                            {STATUS_LABEL[row.status] ??
                                                row.status}
                                        </Badge>
                                        {row.tag && (
                                            <span className="text-muted-foreground text-xs">
                                                {row.tag}
                                            </span>
                                        )}
                                    </div>
                                    {row.problems.length > 0 && (
                                        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground text-sm">
                                            {row.problems.map((problem) => (
                                                <li key={problem}>{problem}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={
                                            busy !== null || row.attempts >= 3
                                        }
                                        onClick={() => void retry(row)}
                                    >
                                        Read again
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy !== null}
                                        onClick={() => void remove(row)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
