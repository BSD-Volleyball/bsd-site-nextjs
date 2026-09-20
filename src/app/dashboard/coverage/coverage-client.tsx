"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    STATUS_LABELS,
    coverageDateTitle,
    formatCoverageDate,
    formatSlotLabel
} from "@/lib/coverage/format"
import type {
    CoverageDate,
    CoveragePerson,
    CoverageSlot,
    CoverageStatus
} from "@/lib/coverage/types"
import { cn } from "@/lib/utils"

import {
    type CoverageView,
    addPresence,
    removePresence,
    sendCoverageDigest
} from "./actions"

const STATUS_BORDER: Record<CoverageStatus, string> = {
    green: "border-l-green-500",
    yellow: "border-l-amber-500",
    red: "border-l-red-500"
}

const STATUS_BADGE: Record<CoverageStatus, string> = {
    green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    yellow: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
}

const SOURCE_LABEL = {
    play: "playing",
    work: "working",
    ref: "reffing",
    present: "present"
} as const

function isEndSlot(date: CoverageDate, slot: CoverageSlot): boolean {
    const timed = date.slots.filter((s) => s.startTime !== null)
    return timed[0] === slot || timed[timed.length - 1] === slot
}

function PersonChip({
    person,
    onRemove,
    busy
}: {
    person: CoveragePerson
    onRemove: (id: number) => void
    busy: boolean
}) {
    const tags: string[] = person.sources.map((s) => SOURCE_LABEL[s])
    if (person.unavailable) tags.push("unavailable")
    if (person.isLeadership) tags.push("leadership")
    if (!person.counts && !person.isLeadership && !person.unavailable) {
        tags.push("not an admin")
    }
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm",
                !person.counts && "text-muted-foreground"
            )}
        >
            <span
                className={cn(
                    "font-medium",
                    person.unavailable && "line-through"
                )}
            >
                {person.name}
            </span>
            <span className="text-xs text-muted-foreground">
                ({tags.join(", ")}
                {person.note ? `: ${person.note}` : ""})
            </span>
            {person.presenceId !== null && (
                <button
                    type="button"
                    aria-label={`Remove ${person.name}`}
                    className="ml-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    disabled={busy}
                    onClick={() => onRemove(person.presenceId as number)}
                >
                    ×
                </button>
            )}
        </span>
    )
}

function AddPresencePopover({
    date,
    slot,
    admins,
    currentUserId,
    onDone
}: {
    date: CoverageDate
    slot: CoverageSlot
    admins: CoverageView["admins"]
    currentUserId: string
    onDone: (message: string | null) => void
}) {
    const [open, setOpen] = useState(false)
    const [userId, setUserId] = useState(currentUserId)
    const [note, setNote] = useState("")
    const [pending, startTransition] = useTransition()

    const submit = (wholeNight: boolean) => {
        const slotTimes = wholeNight
            ? date.slots
                  .map((s) => s.startTime)
                  .filter((t): t is string => t !== null)
            : slot.startTime
              ? [slot.startTime]
              : []
        startTransition(async () => {
            const result = await addPresence({
                userId,
                date: date.date,
                slotTimes,
                note: note || null
            })
            onDone(result.status ? null : result.message)
            if (result.status) {
                setOpen(false)
                setNote("")
                setUserId(currentUserId)
            }
        })
    }

    if (slot.startTime === null) return null

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                    + Add
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
                <div className="space-y-1">
                    <p className="text-sm font-medium">Who will be there?</p>
                    <Select value={userId} onValueChange={setUserId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Pick an admin" />
                        </SelectTrigger>
                        <SelectContent>
                            {admins.map((a) => (
                                <SelectItem key={a.userId} value={a.userId}>
                                    {a.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Input
                        placeholder="Note (optional), e.g. setup only"
                        value={note}
                        maxLength={200}
                        onChange={(e) => setNote(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        To change a note, remove the entry and add it again.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        disabled={pending || !userId}
                        onClick={() => submit(false)}
                    >
                        This slot ({slot.label})
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending || !userId}
                        onClick={() => submit(true)}
                    >
                        Whole night
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function CoverageClient({
    view,
    currentUserId
}: {
    view: CoverageView
    currentUserId: string
}) {
    const router = useRouter()
    const [message, setMessage] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    const afterMutation = (error: string | null) => {
        setMessage(error)
        router.refresh()
    }

    const remove = (id: number) => {
        startTransition(async () => {
            const result = await removePresence({ id })
            afterMutation(result.status ? null : result.message)
        })
    }

    if (view.dates.length === 0) {
        return (
            <p className="text-muted-foreground">
                No upcoming match nights. Add regular-season or playoff dates in
                Season Configuration and generate the schedule first.
            </p>
        )
    }

    return (
        <div className="space-y-4">
            {message && (
                <p className="text-sm text-muted-foreground">{message}</p>
            )}
            {view.dates.map((d) => (
                <Card
                    key={d.date}
                    className={cn("border-l-4", STATUS_BORDER[d.status])}
                >
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                        <div>
                            <CardTitle className="text-lg">
                                {formatCoverageDate(d.date)} ·{" "}
                                {coverageDateTitle(d)}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {d.matchCount} match
                                {d.matchCount === 1 ? "" : "es"} · {d.reason}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge className={STATUS_BADGE[d.status]}>
                                {STATUS_LABELS[d.status]}
                            </Badge>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() =>
                                    startTransition(async () => {
                                        const r = await sendCoverageDigest({
                                            date: d.date
                                        })
                                        setMessage(
                                            r.status
                                                ? (r.message ?? "Sent.")
                                                : r.message
                                        )
                                    })
                                }
                            >
                                Send digest now
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {d.slots.map((slot) => {
                            const uncoveredEnd =
                                slot.startTime !== null &&
                                isEndSlot(d, slot) &&
                                !slot.people.some((p) => p.counts)
                            return (
                                <div
                                    key={slot.startTime ?? "tbd"}
                                    className={cn(
                                        "flex flex-wrap items-start gap-3 rounded-md p-2",
                                        uncoveredEnd &&
                                            "bg-red-50 dark:bg-red-950/40"
                                    )}
                                >
                                    <div className="w-24 shrink-0">
                                        <div className="font-medium">
                                            {formatSlotLabel(slot.startTime)}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {slot.matchCount} match
                                            {slot.matchCount === 1 ? "" : "es"}
                                        </div>
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                        {slot.people.length === 0 ? (
                                            <span className="text-sm text-muted-foreground">
                                                — nobody —
                                            </span>
                                        ) : (
                                            slot.people.map((p) => (
                                                <PersonChip
                                                    key={p.userId}
                                                    person={p}
                                                    onRemove={remove}
                                                    busy={pending}
                                                />
                                            ))
                                        )}
                                    </div>
                                    <AddPresencePopover
                                        date={d}
                                        slot={slot}
                                        admins={view.admins}
                                        currentUserId={currentUserId}
                                        onDone={afterMutation}
                                    />
                                </div>
                            )
                        })}
                        {d.orphanedPresence.length > 0 && (
                            <div className="rounded-md border border-dashed p-2 text-sm text-muted-foreground">
                                <p className="mb-1 font-medium">
                                    No longer matches a slot
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {d.orphanedPresence.map((o) => (
                                        <span
                                            key={o.presenceId}
                                            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5"
                                        >
                                            {o.name} at{" "}
                                            {formatSlotLabel(o.slotTime)}
                                            {o.note ? ` (${o.note})` : ""}
                                            <button
                                                type="button"
                                                aria-label={`Remove ${o.name}`}
                                                className="ml-1 hover:text-foreground"
                                                disabled={pending}
                                                onClick={() =>
                                                    remove(o.presenceId)
                                                }
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
