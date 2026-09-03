"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { toast } from "sonner"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn, reorder } from "@/lib/utils"
import type { CaptainRow, DivisionData } from "./actions"
import { saveDraftOrder, getDraftSheetData } from "./actions"
import {
    generateBlankDraftSheet,
    generatePrefilledDraftSheet
} from "./pdf-sheets"

interface DraftDayFormProps {
    division: DivisionData
    seasonLabel: string
    orderLocked: boolean
}

function shuffle<T>(items: T[]): T[] {
    const arr = [...items]
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

export function DraftDayForm({
    division,
    seasonLabel,
    orderLocked
}: DraftDayFormProps) {
    const router = useRouter()

    const [captains, setCaptains] = useState<CaptainRow[]>(division.captains)
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [isAnimating, setIsAnimating] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isGenerating, setIsGenerating] = useState<
        "blank" | "prefilled" | null
    >(null)

    const handleDrop = (dropIndex: number) => {
        if (draggedIndex === null) return
        setCaptains((prev) => reorder(prev, draggedIndex, dropIndex))
        setDraggedIndex(null)
    }

    const handleRandomize = () => {
        if (isAnimating) return
        setIsAnimating(true)

        const SCRAMBLES = 5
        const INTERVAL = 120

        let count = 0
        const tick = () => {
            count++
            if (count < SCRAMBLES) {
                setCaptains((prev) => shuffle(prev))
                setTimeout(tick, INTERVAL)
            } else {
                setCaptains((prev) => shuffle(prev))
                setIsAnimating(false)
            }
        }

        setTimeout(tick, INTERVAL)
    }

    const handleSave = async () => {
        setIsSaving(true)

        const assignments = captains.map((c, i) => ({
            teamId: c.teamId,
            number: i + 1
        }))

        const result = await saveDraftOrder(division.divisionId, assignments)

        setIsSaving(false)

        if (result.status) {
            toast.success(result.message ?? "Draft order locked.")
            router.refresh()
        } else {
            toast.error(result.message ?? "Failed to save draft order.")
        }
    }

    const downloadPdf = (bytes: Uint8Array, filename: string) => {
        const blob = new Blob([new Uint8Array(bytes)], {
            type: "application/pdf"
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleBlankSheet = async () => {
        setIsGenerating("blank")
        const result = await getDraftSheetData(division.divisionId)
        if (!result.status) {
            toast.error(result.message ?? "Failed to load sheet data.")
            setIsGenerating(null)
            return
        }
        const bytes = await generateBlankDraftSheet(result)
        downloadPdf(bytes, "blank-draft-sheet.pdf")
        setIsGenerating(null)
    }

    const handlePrefilledSheet = async () => {
        setIsGenerating("prefilled")
        const result = await getDraftSheetData(division.divisionId)
        if (!result.status) {
            toast.error(result.message ?? "Failed to load sheet data.")
            setIsGenerating(null)
            return
        }
        const bytes = await generatePrefilledDraftSheet(result)
        downloadPdf(bytes, "prefilled-draft-sheet.pdf")
        setIsGenerating(null)
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle>
                                Draft Order — {seasonLabel} —{" "}
                                {division.divisionName}
                            </CardTitle>
                            <CardDescription className="mt-1">
                                Drag and drop rows to set the pick order, then
                                click Lock In Order.
                                {orderLocked &&
                                    " Locking again replaces the saved order."}
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleRandomize}
                                disabled={isAnimating || isSaving}
                            >
                                🎲 Randomize
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving || isAnimating}
                            >
                                {isSaving
                                    ? "Saving…"
                                    : orderLocked
                                      ? "Re-lock Order"
                                      : "Lock In Order"}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {captains.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No captains found for this division.
                        </p>
                    ) : (
                        <div role="list" className="space-y-1">
                            {captains.map((captain, index) => (
                                <motion.div
                                    key={captain.teamId}
                                    layout
                                    layoutId={String(captain.teamId)}
                                    transition={{ duration: 0.15 }}
                                >
                                    <div
                                        role="listitem"
                                        draggable={!isAnimating}
                                        onDragStart={(e) => {
                                            setDraggedIndex(index)
                                            const el =
                                                e.currentTarget.cloneNode(
                                                    true
                                                ) as HTMLElement
                                            el.style.borderRadius = "6px"
                                            el.style.width = `${e.currentTarget.offsetWidth}px`
                                            el.style.position = "fixed"
                                            el.style.top = "-1000px"
                                            document.body.appendChild(el)
                                            e.dataTransfer.setDragImage(
                                                el,
                                                e.nativeEvent.offsetX,
                                                e.nativeEvent.offsetY
                                            )
                                            setTimeout(
                                                () =>
                                                    document.body.removeChild(
                                                        el
                                                    ),
                                                0
                                            )
                                        }}
                                        onDragEnd={() => setDraggedIndex(null)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={() => handleDrop(index)}
                                        className={cn(
                                            "flex cursor-grab items-center gap-3 rounded-md border px-3 py-2 active:cursor-grabbing",
                                            draggedIndex === index
                                                ? "border-primary/60 border-dashed bg-primary/10"
                                                : ""
                                        )}
                                    >
                                        <span className="w-6 text-center font-semibold text-muted-foreground text-sm">
                                            {index + 1}
                                        </span>
                                        <span className="text-muted-foreground">
                                            ⣿
                                        </span>
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <span className="font-medium">
                                                {captain.captainName}
                                            </span>
                                            <span className="text-muted-foreground text-sm">
                                                ({captain.teamName})
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Draft Sheets</CardTitle>
                    <CardDescription>
                        Download printable draft tracking sheets (landscape
                        8.5×11).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleBlankSheet}
                            disabled={isGenerating !== null}
                        >
                            {isGenerating === "blank"
                                ? "Generating…"
                                : "Blank Draft Sheet"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handlePrefilledSheet}
                            disabled={isGenerating !== null}
                        >
                            {isGenerating === "prefilled"
                                ? "Generating…"
                                : "Pre-filled Draft Sheets"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
