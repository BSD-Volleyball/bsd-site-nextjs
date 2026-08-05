"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RiAddLine, RiDeleteBinLine, RiDownloadLine } from "@remixicon/react"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { formatEventDate, formatEventTime } from "@/lib/season-utils"
import type { TryoutJobScope } from "@/lib/tryout-volunteer-types"

import {
    importJobsFromLastSeason,
    saveTryoutJobs,
    type ConfigureTryoutJobsView,
    type TryoutNightView
} from "./actions"

interface JobState {
    /** Stable React key; unrelated to the database id. */
    key: number
    id: number | null
    name: string
    needed: string
    scope: TryoutJobScope
    notes: string
    assignmentCount: number
}

let keyCounter = 0
function nextKey() {
    keyCounter += 1
    return keyCounter
}

function toState(night: TryoutNightView): JobState[] {
    return night.jobs.map((job) => ({
        key: nextKey(),
        id: job.id,
        name: job.name,
        needed: String(job.needed),
        scope: job.scope,
        notes: job.notes ?? "",
        assignmentCount: job.assignmentCount
    }))
}

export function ConfigureTryoutJobsForm({
    view
}: {
    view: ConfigureTryoutJobsView
}) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [jobsByEvent, setJobsByEvent] = useState<Record<number, JobState[]>>(
        () =>
            Object.fromEntries(
                view.nights.map((night) => [night.eventId, toState(night)])
            )
    )
    const [pendingRemoval, setPendingRemoval] = useState<{
        eventId: number
        key: number
        name: string
        assignmentCount: number
    } | null>(null)

    function update(eventId: number, key: number, patch: Partial<JobState>) {
        setJobsByEvent((prev) => ({
            ...prev,
            [eventId]: (prev[eventId] ?? []).map((job) =>
                job.key === key ? { ...job, ...patch } : job
            )
        }))
    }

    function addJob(eventId: number) {
        setJobsByEvent((prev) => ({
            ...prev,
            [eventId]: [
                ...(prev[eventId] ?? []),
                {
                    key: nextKey(),
                    id: null,
                    name: "",
                    needed: "1",
                    scope: "whole_night",
                    notes: "",
                    assignmentCount: 0
                }
            ]
        }))
    }

    function removeJob(eventId: number, key: number) {
        setJobsByEvent((prev) => ({
            ...prev,
            [eventId]: (prev[eventId] ?? []).filter((job) => job.key !== key)
        }))
    }

    function requestRemove(eventId: number, job: JobState) {
        if (job.assignmentCount > 0) {
            setPendingRemoval({
                eventId,
                key: job.key,
                name: job.name,
                assignmentCount: job.assignmentCount
            })
            return
        }
        removeJob(eventId, job.key)
    }

    async function save(night: TryoutNightView) {
        const jobs = jobsByEvent[night.eventId] ?? []
        for (const job of jobs) {
            if (!job.name.trim()) {
                toast.error("Every job needs a name.")
                return
            }
            const needed = Number(job.needed)
            if (!Number.isInteger(needed) || needed < 1) {
                toast.error(`"${job.name}" needs a whole number of people.`)
                return
            }
        }

        setBusy(true)
        const result = await saveTryoutJobs(
            night.eventId,
            jobs.map((job) => ({
                id: job.id,
                name: job.name.trim(),
                needed: Number(job.needed),
                scope: job.scope,
                notes: job.notes.trim() || null
            }))
        )
        setBusy(false)

        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success(result.message ?? "Saved.")
        router.refresh()
    }

    async function runImport() {
        setBusy(true)
        const result = await importJobsFromLastSeason()
        setBusy(false)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success(result.message ?? "Imported.")
        router.refresh()
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    variant="outline"
                    onClick={runImport}
                    disabled={busy}
                    type="button"
                >
                    <RiDownloadLine className="mr-2 h-4 w-4" />
                    Import jobs from last season
                </Button>
                <p className="text-muted-foreground text-sm">
                    Copies last season's jobs onto the matching tryout night.
                    Jobs that already exist here are left alone.
                </p>
            </div>

            {view.nights.map((night) => {
                const jobs = jobsByEvent[night.eventId] ?? []
                const sessionCount = night.timeSlots.length

                return (
                    <Card key={night.eventId}>
                        <CardHeader>
                            <CardTitle className="text-base">
                                Tryout {night.ordinal} —{" "}
                                {formatEventDate(night.eventDate)}
                                {night.label ? ` (${night.label})` : ""}
                            </CardTitle>
                            <p className="text-muted-foreground text-sm">
                                {sessionCount === 0
                                    ? "No sessions configured for this date — per-session jobs will have nowhere to go."
                                    : `${sessionCount} session${sessionCount === 1 ? "" : "s"}: ${night.timeSlots
                                          .map((s) =>
                                              formatEventTime(s.startTime)
                                          )
                                          .join(", ")}`}
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {jobs.length === 0 && (
                                <p className="text-muted-foreground text-sm">
                                    No jobs defined for this night yet.
                                </p>
                            )}

                            {jobs.map((job) => (
                                <div
                                    key={job.key}
                                    className="space-y-3 rounded-md border p-3"
                                >
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="min-w-[200px] flex-1 space-y-1">
                                            <Label htmlFor={`name-${job.key}`}>
                                                Job
                                            </Label>
                                            <Input
                                                id={`name-${job.key}`}
                                                value={job.name}
                                                placeholder="e.g. Scorekeeper"
                                                onChange={(e) =>
                                                    update(
                                                        night.eventId,
                                                        job.key,
                                                        { name: e.target.value }
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="w-28 space-y-1">
                                            <Label
                                                htmlFor={`needed-${job.key}`}
                                            >
                                                How many
                                            </Label>
                                            <Input
                                                id={`needed-${job.key}`}
                                                type="number"
                                                min={1}
                                                value={job.needed}
                                                onChange={(e) =>
                                                    update(
                                                        night.eventId,
                                                        job.key,
                                                        {
                                                            needed: e.target
                                                                .value
                                                        }
                                                    )
                                                }
                                            />
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            type="button"
                                            onClick={() =>
                                                requestRemove(
                                                    night.eventId,
                                                    job
                                                )
                                            }
                                        >
                                            <RiDeleteBinLine className="h-4 w-4" />
                                            <span className="sr-only">
                                                Remove job
                                            </span>
                                        </Button>
                                    </div>

                                    <RadioGroup
                                        value={job.scope}
                                        onValueChange={(value) =>
                                            update(night.eventId, job.key, {
                                                scope: value as TryoutJobScope
                                            })
                                        }
                                        className="flex flex-wrap gap-4"
                                    >
                                        <div className="flex items-center gap-2">
                                            <RadioGroupItem
                                                value="whole_night"
                                                id={`whole-${job.key}`}
                                            />
                                            <Label
                                                htmlFor={`whole-${job.key}`}
                                                className="font-normal"
                                            >
                                                Whole night
                                            </Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <RadioGroupItem
                                                value="per_session"
                                                id={`session-${job.key}`}
                                            />
                                            <Label
                                                htmlFor={`session-${job.key}`}
                                                className="font-normal"
                                            >
                                                Per session
                                                {sessionCount > 0 && (
                                                    <span className="ml-1 text-muted-foreground">
                                                        (
                                                        {Number(job.needed) ||
                                                            0}{" "}
                                                        × {sessionCount} ={" "}
                                                        {(Number(job.needed) ||
                                                            0) *
                                                            sessionCount}{" "}
                                                        people)
                                                    </span>
                                                )}
                                            </Label>
                                        </div>
                                    </RadioGroup>

                                    <div className="space-y-1">
                                        <Label htmlFor={`notes-${job.key}`}>
                                            Notes (optional)
                                        </Label>
                                        <Input
                                            id={`notes-${job.key}`}
                                            value={job.notes}
                                            placeholder="Anything the volunteer should know"
                                            onChange={(e) =>
                                                update(night.eventId, job.key, {
                                                    notes: e.target.value
                                                })
                                            }
                                        />
                                    </div>

                                    {job.assignmentCount > 0 && (
                                        <p className="text-muted-foreground text-xs">
                                            {job.assignmentCount} volunteer
                                            {job.assignmentCount === 1
                                                ? ""
                                                : "s"}{" "}
                                            currently assigned.
                                        </p>
                                    )}
                                </div>
                            ))}

                            <div className="flex flex-wrap gap-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() => addJob(night.eventId)}
                                >
                                    <RiAddLine className="mr-2 h-4 w-4" />
                                    Add job
                                </Button>
                                <Button
                                    size="sm"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => save(night)}
                                >
                                    Save Tryout {night.ordinal} jobs
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}

            <AlertDialog
                open={pendingRemoval !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingRemoval(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Remove "{pendingRemoval?.name}"?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingRemoval?.assignmentCount} volunteer
                            assignment
                            {pendingRemoval?.assignmentCount === 1 ? "" : "s"}{" "}
                            will be deleted along with this job when you save.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingRemoval) {
                                    removeJob(
                                        pendingRemoval.eventId,
                                        pendingRemoval.key
                                    )
                                }
                                setPendingRemoval(null)
                            }}
                        >
                            Remove job
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
