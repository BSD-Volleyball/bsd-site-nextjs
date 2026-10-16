"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { formatEnteredTime } from "@/lib/scores/entered-by"

import { deleteUploadedSheet, type SheetInboxRow } from "./actions"
import { ScanningPhoto } from "./processing-card"

/**
 * A photo that could not be matched to a court tonight: its code did not
 * decode or did not name a court with matches. Saying which court it is
 * reads it again against that court's printed match list.
 */
export function UnfiledSheetCard({
    row,
    courts,
    picBaseUrl,
    onRetry,
    onRemoved,
    onViewPhoto
}: {
    row: SheetInboxRow
    courts: number[]
    picBaseUrl: string
    onRetry: (court?: number) => Promise<void>
    onRemoved: () => void
    onViewPhoto: (url: string) => void
}) {
    const [court, setCourt] = useState<string>("")
    const [busy, setBusy] = useState(false)
    const photoUrl = `${picBaseUrl}/${row.imagePath}`
    const reading = row.status === "processing" || busy
    const outOfTries = row.attempts >= 3

    const run = async (task: () => Promise<void>) => {
        setBusy(true)
        try {
            await task()
        } finally {
            setBusy(false)
        }
    }

    const remove = () =>
        run(async () => {
            const result = await deleteUploadedSheet(row.scoreSheetId)
            if (!result.status) toast.error(result.message)
            onRemoved()
        })

    return (
        <Card className="gap-0 border-amber-300 py-0 dark:border-amber-800">
            <CardContent className="flex gap-3 p-4">
                {reading ? (
                    <ScanningPhoto
                        src={photoUrl}
                        alt="Score sheet"
                        className="h-28 w-20 shrink-0"
                    />
                ) : (
                    <button
                        type="button"
                        className="shrink-0"
                        onClick={() => onViewPhoto(photoUrl)}
                        aria-label="View photo"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={photoUrl}
                            alt="Score sheet"
                            className="h-28 w-20 rounded-md border object-cover"
                        />
                    </button>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-semibold">
                        {reading
                            ? "Reading…"
                            : row.status === "pending"
                              ? "Not read yet"
                              : "Which court is this?"}
                    </p>
                    {!reading && row.problems[0] && (
                        <p className="text-muted-foreground text-xs">
                            {row.problems[0]}
                        </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                        Photo by {row.uploadedBy} ·{" "}
                        {formatEnteredTime(row.uploadedAt)}
                    </p>
                    {!reading && (
                        <div className="flex flex-wrap gap-2">
                            {!outOfTries && (
                                <>
                                    <Select
                                        value={court}
                                        onValueChange={setCourt}
                                    >
                                        <SelectTrigger
                                            className="h-11 w-32"
                                            aria-label="Court"
                                        >
                                            <SelectValue placeholder="Court…" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {courts.map((c) => (
                                                <SelectItem
                                                    key={c}
                                                    value={String(c)}
                                                >
                                                    Court {c}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        className="h-11"
                                        disabled={
                                            !court && row.status !== "pending"
                                        }
                                        onClick={() =>
                                            void run(() =>
                                                onRetry(
                                                    court
                                                        ? Number(court)
                                                        : undefined
                                                )
                                            )
                                        }
                                    >
                                        Read it
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="ghost"
                                className="h-11"
                                onClick={() => void remove()}
                            >
                                Remove
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
