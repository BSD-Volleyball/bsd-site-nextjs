"use client"

import { RiCheckLine, RiLoader4Line } from "@remixicon/react"
import { useEffect, useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type UploadStage = "waiting" | "preparing" | "uploading" | "reading"

export interface LocalUpload {
    key: string
    /** An object URL for the photo as taken, shown before it is uploaded. */
    previewUrl: string
    stage: UploadStage
    /** 0-100 while uploading. */
    progress: number
    /** When reading began, for the elapsed counter. */
    readingSince: number | null
}

const STEPS: { stage: UploadStage; label: string }[] = [
    { stage: "preparing", label: "Preparing photo" },
    { stage: "uploading", label: "Uploading" },
    { stage: "reading", label: "Reading the scores" }
]

const ORDER: Record<UploadStage, number> = {
    waiting: -1,
    preparing: 0,
    uploading: 1,
    reading: 2
}

function useSecondsSince(since: number | null): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (since === null) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [since])
    return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000))
}

/** The photo with a line sweeping it, used while a sheet is being read. */
export function ScanningPhoto({
    src,
    alt,
    className
}: {
    src: string
    alt: string
    className?: string
}) {
    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-md border bg-muted",
                className
            )}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-primary/10" />
            <div
                aria-hidden
                className="absolute inset-x-0 h-1 animate-sheet-scan bg-primary shadow-[0_0_14px_5px] shadow-primary/60"
            />
        </div>
    )
}

export function ProcessingCard({ upload }: { upload: LocalUpload }) {
    const seconds = useSecondsSince(upload.readingSince)
    const current = ORDER[upload.stage]

    return (
        <Card
            aria-live="polite"
            className="gap-0 overflow-hidden border-primary/40 py-0 ring-1 ring-primary/20"
        >
            <CardContent className="flex gap-4 p-4">
                <ScanningPhoto
                    src={upload.previewUrl}
                    alt="Score sheet being read"
                    className="h-32 w-24 shrink-0"
                />
                <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                        {upload.stage === "waiting"
                            ? "Waiting its turn…"
                            : "Working on this sheet"}
                    </p>
                    <ol className="mt-2 space-y-1.5 text-sm">
                        {STEPS.map((step, index) => {
                            const done = current > index
                            const active = current === index
                            return (
                                <li
                                    key={step.stage}
                                    className={cn(
                                        "flex items-center gap-2",
                                        !done &&
                                            !active &&
                                            "text-muted-foreground"
                                    )}
                                >
                                    {done ? (
                                        <RiCheckLine className="h-4 w-4 shrink-0 text-green-600" />
                                    ) : active ? (
                                        <RiLoader4Line className="h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
                                    ) : (
                                        <span className="h-4 w-4 shrink-0 rounded-full border" />
                                    )}
                                    <span
                                        className={cn(active && "font-medium")}
                                    >
                                        {step.label}
                                        {active &&
                                            step.stage === "uploading" &&
                                            ` ${upload.progress}%`}
                                        {active &&
                                            step.stage === "reading" &&
                                            ` · ${seconds}s`}
                                    </span>
                                </li>
                            )
                        })}
                    </ol>
                    {upload.stage === "uploading" && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full bg-primary transition-[width]"
                                style={{ width: `${upload.progress}%` }}
                            />
                        </div>
                    )}
                    {upload.stage === "reading" && (
                        <p className="mt-2 text-muted-foreground text-xs">
                            Two readers check each other's work. This usually
                            takes 10-30 seconds; you can take the next photo
                            meanwhile.
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
