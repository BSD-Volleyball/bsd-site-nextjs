"use client"

import { RiArrowDownLine, RiArrowUpLine, RiDraggable } from "@remixicon/react"
import { type DragEvent, useEffect, useState } from "react"
import type { SurveyOption } from "@/lib/surveys/types"
import { cn } from "@/lib/utils"

interface RankingInputProps {
    options: SurveyOption[]
    value: string[] | undefined
    onChange: (value: string[]) => void
    disabled?: boolean
}

/**
 * The stored order, cleaned of keys the question no longer offers and of
 * duplicates, with every option it is missing appended in option order. A
 * respondent who has not touched the question therefore sees the options as
 * the editor listed them.
 */
function normalizeOrder(
    options: SurveyOption[],
    value: string[] | undefined
): string[] {
    const keys = new Set(options.map((option) => option.key))
    const seen = new Set<string>()
    const ordered: string[] = []

    for (const key of value ?? []) {
        if (keys.has(key) && !seen.has(key)) {
            seen.add(key)
            ordered.push(key)
        }
    }
    for (const option of options) {
        if (!seen.has(option.key)) ordered.push(option.key)
    }
    return ordered
}

/** Same keys in the same positions. */
function sameOrder(a: string[] | undefined, b: string[]): boolean {
    if (a === undefined || a.length !== b.length) return false
    return a.every((key, index) => key === b[index])
}

/** Move the entry at `from` to `to`; everything in between shifts by one. */
function moveEntry(order: string[], from: number, to: number): string[] {
    if (from === to || from < 0 || to < 0) return order
    if (from >= order.length || to >= order.length) return order
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
}

/**
 * Drag-and-drop plus keyboard-reachable move buttons. The value is always a
 * complete ordering of the option keys, so the parent never has to reconcile a
 * partial list.
 *
 * The rendered order is also *emitted*, not just displayed. A required ranking
 * is satisfied by a full permutation of the option keys and by nothing else
 * (see validate-submission.test.ts), so a respondent who agrees with the
 * default order and never drags anything would otherwise be unable to submit.
 * The seeding effect below is what makes that default an actual answer — and
 * it doubles as the repair for a stored order that went stale when the editor
 * appended an option.
 */
export function RankingInput({
    options,
    value,
    onChange,
    disabled = false
}: RankingInputProps) {
    const [draggingKey, setDraggingKey] = useState<string | null>(null)
    const [dragOverKey, setDragOverKey] = useState<string | null>(null)

    const order = normalizeOrder(options, value)
    const labels = new Map(options.map((option) => [option.key, option.label]))

    // Seed (or repair) the stored answer from what is on screen. Idempotent:
    // once `value` equals the normalised order there is nothing to emit, so
    // this cannot loop even though `onChange` is usually a fresh closure.
    const needsSeed = !disabled && !sameOrder(value, order)
    useEffect(() => {
        if (needsSeed) onChange(order)
    })

    function move(from: number, to: number) {
        if (disabled) return
        const next = moveEntry(order, from, to)
        if (next !== order) onChange(next)
    }

    function handleDragStart(event: DragEvent<HTMLElement>, key: string) {
        if (disabled) return
        setDraggingKey(key)
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", key)
    }

    function handleDragEnd() {
        setDraggingKey(null)
        setDragOverKey(null)
    }

    function handleDrop(event: DragEvent<HTMLElement>, key: string) {
        event.preventDefault()
        if (draggingKey && draggingKey !== key) {
            move(order.indexOf(draggingKey), order.indexOf(key))
        }
        handleDragEnd()
    }

    return (
        <ol className="space-y-2">
            {order.map((key, index) => (
                <li
                    key={key}
                    onDragOver={(event) => {
                        if (disabled) return
                        event.preventDefault()
                        setDragOverKey(key)
                    }}
                    onDragLeave={() =>
                        setDragOverKey((current) =>
                            current === key ? null : current
                        )
                    }
                    onDrop={(event) => handleDrop(event, key)}
                    className={cn(
                        "flex items-center gap-2 rounded-md border bg-background p-2",
                        draggingKey === key && "opacity-50",
                        dragOverKey === key &&
                            draggingKey !== key &&
                            "border-primary"
                    )}
                >
                    <span
                        aria-hidden="true"
                        draggable={!disabled}
                        onDragStart={(event) => handleDragStart(event, key)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                            "text-muted-foreground",
                            disabled ? "cursor-not-allowed" : "cursor-grab"
                        )}
                    >
                        <RiDraggable className="h-4 w-4" />
                    </span>
                    <span className="w-6 text-center font-medium text-muted-foreground text-sm tabular-nums">
                        {index + 1}
                    </span>
                    <span className="grow text-sm">
                        {labels.get(key) ?? key}
                    </span>
                    <button
                        type="button"
                        disabled={disabled || index === 0}
                        onClick={() => move(index, index - 1)}
                        aria-label={`Move ${labels.get(key) ?? key} up`}
                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                        <RiArrowUpLine className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        disabled={disabled || index === order.length - 1}
                        onClick={() => move(index, index + 1)}
                        aria-label={`Move ${labels.get(key) ?? key} down`}
                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                        <RiArrowDownLine className="h-4 w-4" />
                    </button>
                </li>
            ))}
        </ol>
    )
}
