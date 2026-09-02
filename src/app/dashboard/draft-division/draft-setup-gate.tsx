"use client"

import Link from "next/link"
import { RiCheckLine, RiLockLine, RiLockUnlockLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { StatusBanner } from "@/components/ui/status-banner"
import type { DraftSetupStatus, DraftSetupStepState } from "@/lib/draft-setup"
import { draftSetupStepHref } from "@/app/dashboard/draft-setup/draft-setup-stepper"

function StepIcon({ state }: { state: DraftSetupStepState }) {
    if (state === "locked") {
        return <RiCheckLine className="size-4 text-green-700" />
    }
    if (state === "stale") {
        return <RiLockUnlockLine className="size-4 text-amber-700" />
    }
    return <RiLockLine className="size-4 text-muted-foreground" />
}

/**
 * Shown in place of the live board while Draft Setup is incomplete.
 * Commissioners get the checklist with links; captains just get told to wait.
 */
export function DraftSetupGate({
    status,
    divisionId,
    role
}: {
    status: DraftSetupStatus
    divisionId: number
    role: "commissioner" | "captain"
}) {
    if (role === "captain") {
        return (
            <StatusBanner variant="info" className="mt-6">
                Your commissioner is still setting up the draft for this
                division. The board will appear here once it&apos;s ready.
            </StatusBanner>
        )
    }

    const roundsLabel =
        status.rounds.state === "locked"
            ? "Locked"
            : status.rounds.state === "stale"
              ? `Needs re-lock — no round saved for ${status.rounds.missingCaptains.join(", ")}`
              : "Not locked"
    const orderLabel = status.order.state === "locked" ? "Locked" : "Not locked"

    return (
        <StatusBanner variant="warning" className="mt-6">
            <div className="space-y-3">
                <p className="font-medium">
                    Draft Setup isn&apos;t finished for this division, so the
                    board can&apos;t open yet.
                </p>
                <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                        <StepIcon state={status.rounds.state} />
                        <span>Step 1: Seat the captains — {roundsLabel}</span>
                        {status.rounds.state !== "locked" && (
                            <Link
                                href={draftSetupStepHref("rounds", divisionId)}
                                className="underline underline-offset-2"
                            >
                                Fix
                            </Link>
                        )}
                    </li>
                    <li className="flex items-center gap-2">
                        <StepIcon state={status.order.state} />
                        <span>Step 2: Set the draft order — {orderLabel}</span>
                        {status.rounds.state === "locked" &&
                            status.order.state !== "locked" && (
                                <Link
                                    href={draftSetupStepHref(
                                        "order",
                                        divisionId
                                    )}
                                    className="underline underline-offset-2"
                                >
                                    Fix
                                </Link>
                            )}
                    </li>
                </ul>
                <Button asChild variant="outline" size="sm">
                    <Link
                        href={draftSetupStepHref(
                            status.rounds.state === "locked"
                                ? "order"
                                : "rounds",
                            divisionId
                        )}
                    >
                        Open Draft Setup
                    </Link>
                </Button>
            </div>
        </StatusBanner>
    )
}
