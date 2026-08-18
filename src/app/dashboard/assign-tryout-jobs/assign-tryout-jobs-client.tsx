"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RiAlertLine, RiCloseLine, RiMailSendLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UserEmailCombobox } from "@/components/user-combobox"
import { formatEventDate } from "@/lib/season-utils"
import { roleLabel } from "@/lib/role-display"
import { TRYOUT_JOB_SCOPE_LABELS } from "@/lib/tryout-volunteer-types"
import { cn } from "@/lib/utils"

import {
    assignVolunteer,
    sendVolunteerAssignmentEmails,
    unassignVolunteer,
    type AssignJobView,
    type AssignTryoutJobsView,
    type JobSlotView
} from "./actions"

/** Key identifying one job+slot picker, since slot ids can be null. */
function slotKey(jobId: number, timeSlotId: number | null) {
    return `${jobId}:${timeSlotId ?? "all"}`
}

export function AssignTryoutJobsClient({
    view
}: {
    view: AssignTryoutJobsView
}) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [picks, setPicks] = useState<Record<string, string | null>>({})

    const totalConflicts = view.nights.reduce(
        (nightSum, night) =>
            nightSum +
            night.jobs.reduce(
                (jobSum, job) =>
                    jobSum +
                    job.slots.reduce(
                        (slotSum, slot) =>
                            slotSum +
                            slot.assigned.filter((a) => a.conflict).length,
                        0
                    ),
                0
            ),
        0
    )

    const hasJobs = view.nights.some((night) => night.jobs.length > 0)

    async function run(p: Promise<{ status: boolean; message?: string }>) {
        setBusy(true)
        const result = await p
        setBusy(false)
        if (!result.status) {
            toast.error(result.message ?? "Failed.")
            return false
        }
        if (result.message) toast.success(result.message)
        router.refresh()
        return true
    }

    // People already in this slot shouldn't be offered again.
    function pickerUsers(slot: JobSlotView) {
        const taken = new Set(slot.assigned.map((a) => a.userId))
        return view.eligible
            .filter((e) => !taken.has(e.id))
            .map((e) => ({ id: e.id, name: e.name, email: e.email }))
    }

    function renderSlot(job: AssignJobView, slot: JobSlotView) {
        const key = slotKey(job.jobId, slot.timeSlotId)
        const filled = slot.assigned.length
        const under = filled < job.needed

        return (
            <div key={key} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">
                        {slot.timeLabel}
                    </span>
                    <span
                        className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            under
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                                : "bg-muted text-muted-foreground"
                        )}
                    >
                        {filled} of {job.needed} filled
                    </span>
                </div>

                {slot.assigned.length > 0 && (
                    <ul className="space-y-1">
                        {slot.assigned.map((person) => (
                            <li
                                key={person.assignmentId}
                                className="flex flex-wrap items-center gap-2 text-sm"
                            >
                                <span>{person.name}</span>
                                {person.conflict && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-800 text-xs dark:bg-red-950 dark:text-red-200">
                                        <RiAlertLine className="h-3 w-3" />
                                        {job.scope === "whole_night"
                                            ? "playing this night"
                                            : "playing this session"}
                                    </span>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        run(
                                            unassignVolunteer(
                                                person.assignmentId
                                            )
                                        )
                                    }
                                >
                                    <RiCloseLine className="h-4 w-4" />
                                    <span className="sr-only">
                                        Remove {person.name}
                                    </span>
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[240px] flex-1">
                        <UserEmailCombobox
                            users={pickerUsers(slot)}
                            value={picks[key] ?? null}
                            onChange={(userId) =>
                                setPicks((prev) => ({ ...prev, [key]: userId }))
                            }
                            disabled={busy}
                            placeholder="Add a volunteer..."
                        />
                    </div>
                    <Button
                        size="sm"
                        type="button"
                        disabled={busy || !picks[key]}
                        onClick={async () => {
                            const userId = picks[key]
                            if (!userId) return
                            const okResult = await run(
                                assignVolunteer(
                                    job.jobId,
                                    slot.timeSlotId,
                                    userId
                                )
                            )
                            if (okResult) {
                                setPicks((prev) => ({ ...prev, [key]: null }))
                            }
                        }}
                    >
                        Assign
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !hasJobs}
                    onClick={() => run(sendVolunteerAssignmentEmails())}
                >
                    <RiMailSendLine className="mr-2 h-4 w-4" />
                    Send assignment emails
                </Button>
                <p className="text-muted-foreground text-sm">
                    Each volunteer gets one email listing all of their jobs.
                    Safe to send again after changes.
                </p>
            </div>

            {view.eligible.length === 0 && (
                <Card className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
                    <CardContent className="pt-6 text-sm">
                        Nobody is eligible to be assigned yet. Give people the
                        Tryout Volunteer role on{" "}
                        <Link
                            href="/dashboard/pick-tryout-volunteers"
                            className="underline"
                        >
                            Pick Tryout Volunteers
                        </Link>
                        .
                    </CardContent>
                </Card>
            )}

            {totalConflicts > 0 && (
                <Card className="border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950">
                    <CardContent className="flex items-center gap-2 pt-6 text-sm">
                        <RiAlertLine className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>
                            {totalConflicts} volunteer
                            {totalConflicts === 1 ? " is" : "s are"} scheduled
                            to play at the same time as the job they're assigned
                            to.
                        </span>
                    </CardContent>
                </Card>
            )}

            {view.nights.map((night) => (
                <Card key={night.eventId}>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Tryout {night.ordinal} —{" "}
                            {formatEventDate(night.eventDate)}
                            {night.label ? ` (${night.label})` : ""}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {night.jobs.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No jobs defined for this night.{" "}
                                <Link
                                    href="/dashboard/configure-tryout-jobs"
                                    className="underline"
                                >
                                    Configure Tryout Jobs
                                </Link>
                                .
                            </p>
                        ) : (
                            night.jobs.map((job) => (
                                <div key={job.jobId} className="space-y-2">
                                    <div className="flex flex-wrap items-baseline gap-2">
                                        <h3 className="font-semibold text-sm">
                                            {job.name}
                                        </h3>
                                        <span className="text-muted-foreground text-sm">
                                            {TRYOUT_JOB_SCOPE_LABELS[job.scope]}{" "}
                                            · {job.needed} needed
                                            {job.scope === "per_session"
                                                ? " per session"
                                                : ""}
                                        </span>
                                    </div>
                                    {job.notes && (
                                        <p className="text-muted-foreground text-sm">
                                            {job.notes}
                                        </p>
                                    )}
                                    <div className="space-y-2">
                                        {job.slots.map((slot) =>
                                            renderSlot(job, slot)
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            ))}

            {view.eligible.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            Who can be assigned ({view.eligible.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2 text-sm">
                        {view.eligible.map((person) => (
                            <span
                                key={person.id}
                                className="rounded-full bg-muted px-3 py-1"
                            >
                                {person.name}
                                <span className="ml-1 text-muted-foreground text-sm">
                                    {person.roles.map(roleLabel).join(", ")}
                                </span>
                            </span>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
