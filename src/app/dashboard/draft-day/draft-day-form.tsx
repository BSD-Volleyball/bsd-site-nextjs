"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CaptainRow, DivisionData } from "./actions"
import { saveDraftOrder } from "./actions"

interface DraftDayFormProps {
    divisions: DivisionData[]
    commissionerDivisionId: number | null
    seasonLabel: string
}

function reorder<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    if (fromIndex === toIndex) {
        return items
    }
    const updated = [...items]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    return updated
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
    divisions,
    commissionerDivisionId,
    seasonLabel
}: DraftDayFormProps) {
    const router = useRouter()

    const defaultDivisionId =
        commissionerDivisionId ?? divisions[0]?.divisionId ?? null

    const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(
        defaultDivisionId
    )
    const [captains, setCaptains] = useState<CaptainRow[]>(() => {
        const div = divisions.find((d) => d.divisionId === defaultDivisionId)
        return div?.captains ?? []
    })
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [isAnimating, setIsAnimating] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [isError, setIsError] = useState(false)

    const handleDivisionChange = (divId: number) => {
        setSelectedDivisionId(divId)
        const div = divisions.find((d) => d.divisionId === divId)
        setCaptains(div?.captains ?? [])
        setMessage(null)
    }

    const handleDrop = (dropIndex: number) => {
        if (draggedIndex === null) return
        setCaptains((prev) => reorder(prev, draggedIndex, dropIndex))
        setDraggedIndex(null)
    }

    const handleRandomize = () => {
        if (isAnimating) return
        setIsAnimating(true)
        setMessage(null)

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
        setMessage(null)
        setIsError(false)

        const assignments = captains.map((c, i) => ({
            teamId: c.teamId,
            number: i + 1
        }))

        const result = await saveDraftOrder(assignments)

        setMessage(result.message)
        setIsError(!result.status)
        setIsSaving(false)

        if (result.status) {
            router.refresh()
        }
    }

    return (
        <div className="space-y-6">
            {commissionerDivisionId === null && divisions.length > 1 && (
                <div className="flex items-center gap-3">
                    <label
                        htmlFor="division-select"
                        className="font-medium text-sm"
                    >
                        Division:
                    </label>
                    <select
                        id="division-select"
                        className="rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm"
                        value={selectedDivisionId ?? ""}
                        onChange={(e) =>
                            handleDivisionChange(Number(e.target.value))
                        }
                    >
                        {divisions.map((div) => (
                            <option key={div.divisionId} value={div.divisionId}>
                                {div.divisionName}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle>Draft Order — {seasonLabel}</CardTitle>
                            <CardDescription className="mt-1">
                                Drag and drop rows to set the pick order, then
                                click Save Order.
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
                                {isSaving ? "Saving…" : "Save Order"}
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

                    {message && (
                        <div
                            className={cn(
                                "mt-4 rounded-md p-3 text-sm",
                                isError
                                    ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                                    : "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                            )}
                        >
                            {message}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
