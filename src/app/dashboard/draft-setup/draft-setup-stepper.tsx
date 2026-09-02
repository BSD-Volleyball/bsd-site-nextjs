"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { RiCheckLine, RiLockLine, RiLockUnlockLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import type { DraftSetupStatus, DraftSetupStepState } from "@/lib/draft-setup"

export type DraftSetupStep = "rounds" | "order"

export const DRAFT_SETUP_STEP_PATHS: Record<DraftSetupStep, string> = {
    rounds: "/dashboard/draft-setup/rounds",
    order: "/dashboard/draft-setup/order"
}

export function draftSetupStepHref(
    step: DraftSetupStep,
    divisionId: number
): string {
    return `${DRAFT_SETUP_STEP_PATHS[step]}?divisionId=${divisionId}`
}

function formatLockedAt(date: Date | null): string {
    if (!date) return ""
    return new Date(date).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })
}

function StateBadge({
    state,
    lockedAt
}: {
    state: DraftSetupStepState
    lockedAt: Date | null
}) {
    if (state === "locked") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800 text-xs dark:bg-green-950 dark:text-green-200">
                <RiCheckLine className="size-3.5" />
                Locked {formatLockedAt(lockedAt)}
            </span>
        )
    }
    if (state === "stale") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 text-xs dark:bg-amber-950 dark:text-amber-200">
                <RiLockUnlockLine className="size-3.5" />
                Needs re-lock
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
            <RiLockLine className="size-3.5" />
            Not locked
        </span>
    )
}

interface StepDef {
    key: DraftSetupStep
    number: number
    title: string
    detail: string
}

const STEPS: StepDef[] = [
    {
        key: "rounds",
        number: 1,
        title: "Seat the captains",
        detail: "Review homework and lock each captain's draft round"
    },
    {
        key: "order",
        number: 2,
        title: "Set the draft order",
        detail: "Randomize or arrange team order, then lock it"
    }
]

export function DraftSetupStepper({
    active,
    divisionId,
    status
}: {
    active: DraftSetupStep
    divisionId: number
    status: DraftSetupStatus
}) {
    return (
        <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map((step) => {
                const stepStatus = status[step.key]
                const isActive = step.key === active
                const blocked =
                    step.key === "order" && status.rounds.state !== "locked"
                return (
                    <li key={step.key}>
                        <Link
                            href={draftSetupStepHref(step.key, divisionId)}
                            aria-current={isActive ? "step" : undefined}
                            className={cn(
                                "flex h-full items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50",
                                isActive
                                    ? "border-primary bg-primary/5"
                                    : "border-border"
                            )}
                        >
                            <span
                                className={cn(
                                    "flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-sm",
                                    stepStatus.state === "locked"
                                        ? "bg-green-600 text-white"
                                        : isActive
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted text-muted-foreground"
                                )}
                            >
                                {stepStatus.state === "locked" ? (
                                    <RiCheckLine className="size-4" />
                                ) : (
                                    step.number
                                )}
                            </span>
                            <span className="min-w-0 flex-1 space-y-1">
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold">
                                        Step {step.number}: {step.title}
                                    </span>
                                    <StateBadge
                                        state={stepStatus.state}
                                        lockedAt={stepStatus.lockedAt}
                                    />
                                </span>
                                <span className="block text-muted-foreground text-sm">
                                    {blocked
                                        ? "Blocked until Step 1 is locked"
                                        : step.detail}
                                </span>
                                {step.key === "rounds" &&
                                    status.rounds.state === "stale" && (
                                        <span className="block text-amber-800 text-sm dark:text-amber-200">
                                            No round saved for:{" "}
                                            {status.rounds.missingCaptains.join(
                                                ", "
                                            )}
                                        </span>
                                    )}
                            </span>
                        </Link>
                    </li>
                )
            })}
        </ol>
    )
}

export function DraftSetupDivisionPicker({
    step,
    divisionId,
    divisions
}: {
    step: DraftSetupStep
    divisionId: number
    divisions: { id: number; name: string }[]
}) {
    const router = useRouter()
    if (divisions.length <= 1) return null
    return (
        <div className="flex items-center gap-2">
            <label
                htmlFor="draft-setup-division"
                className="font-medium text-sm"
            >
                Division
            </label>
            <select
                id="draft-setup-division"
                value={divisionId}
                onChange={(e) =>
                    router.push(
                        draftSetupStepHref(step, Number(e.target.value))
                    )
                }
                className="rounded border bg-background px-2 py-1 text-sm"
            >
                {divisions.map((div) => (
                    <option key={div.id} value={div.id}>
                        {div.name}
                    </option>
                ))}
            </select>
        </div>
    )
}
