import Link from "next/link"
import type { Metadata } from "next"
import { StatusBanner } from "@/components/ui/status-banner"
import { Button } from "@/components/ui/button"
import { getSeasonConfig } from "@/lib/site-config"
import { getDraftSetupStatus } from "@/lib/draft-setup"
import { parseDivisionIdParam } from "../division-param"
import {
    DraftSetupDivisionPicker,
    DraftSetupStepper,
    draftSetupStepHref
} from "../draft-setup-stepper"
import { DraftDayForm } from "./draft-day-form"
import { getDraftDayData } from "./actions"

export const metadata: Metadata = { title: "Draft Setup — Draft Order" }

export const dynamic = "force-dynamic"

export default async function DraftSetupOrderPage({
    searchParams
}: {
    searchParams: Promise<{ divisionId?: string }>
}) {
    const requested = parseDivisionIdParam((await searchParams).divisionId)

    // Load every division the commissioner can see so the picker is
    // populated, then narrow to the requested (or first) one.
    const [result, config] = await Promise.all([
        getDraftDayData(),
        getSeasonConfig()
    ])

    if (!result.status || !config.seasonId) {
        return (
            <StatusBanner variant="error">
                {result.message || "Failed to load draft order data."}
            </StatusBanner>
        )
    }

    const division =
        result.divisions.find((d) => d.divisionId === requested) ??
        result.divisions[0]

    if (!division) {
        return (
            <StatusBanner variant="info">
                No teams have been created for this season yet.
            </StatusBanner>
        )
    }

    const status = await getDraftSetupStatus(
        config.seasonId,
        division.divisionId
    )
    const pickerDivisions = result.divisions.map((d) => ({
        id: d.divisionId,
        name: d.divisionName
    }))

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="font-semibold text-xl">
                    {result.seasonLabel} — {division.divisionName}
                </h2>
                <DraftSetupDivisionPicker
                    step="order"
                    divisionId={division.divisionId}
                    divisions={pickerDivisions}
                />
            </div>

            <DraftSetupStepper
                active="order"
                divisionId={division.divisionId}
                status={status}
            />

            {status.rounds.state !== "locked" ? (
                <StatusBanner variant="warning">
                    <div className="space-y-3">
                        <p className="font-medium">
                            Step 1 must be locked in before the draft order.
                        </p>
                        <p className="text-sm">
                            {status.rounds.state === "stale"
                                ? `Captains changed since Step 1 was locked (no round saved for ${status.rounds.missingCaptains.join(", ")}). Re-lock Step 1 to continue.`
                                : "Seat every captain in a draft round and press Lock In Picks, then come back here."}
                        </p>
                        <Button asChild variant="outline" size="sm">
                            <Link
                                href={draftSetupStepHref(
                                    "rounds",
                                    division.divisionId
                                )}
                            >
                                Go to Step 1
                            </Link>
                        </Button>
                    </div>
                </StatusBanner>
            ) : (
                <DraftDayForm
                    key={division.divisionId}
                    division={division}
                    seasonLabel={result.seasonLabel}
                    orderLocked={status.order.state === "locked"}
                />
            )}
        </div>
    )
}
