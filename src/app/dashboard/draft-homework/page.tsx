import { requireSessionOrRedirect } from "@/lib/page-guards"
import { playerPicBaseUrl } from "@/config/env"
import { PageHeader } from "@/components/layout/page-header"
import { getDraftHomeworkData } from "./actions"
import { DraftHomeworkForm } from "./draft-homework-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft Homework"
}

export const dynamic = "force-dynamic"

export default async function DraftHomeworkPage() {
    await requireSessionOrRedirect()

    const result = await getDraftHomeworkData()

    if (!result.status || !result.data) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Draft Homework"
                    description="Plan your draft picks before the live draft."
                />
                <div className="rounded-md bg-amber-50 p-4 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    {result.message}
                </div>
            </div>
        )
    }

    const hasSubmitted = result.data.existingSelections.length > 0

    return (
        <div className="space-y-6">
            <div className="print:hidden">
                <PageHeader
                    title="Draft Homework"
                    description={`${result.data.divisionName} Division — plan your picks before the live draft.`}
                />
            </div>

            <div className="rounded-md border bg-muted/30 p-4 text-sm print:hidden">
                <p className="font-medium">Instructions</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                    <li>
                        Use the <strong>Males</strong> and{" "}
                        <strong>Non-Males</strong> tabs to plan your picks for
                        each round of the draft.
                    </li>
                    <li>
                        Each round has {result.data.numTeams} slots. Slots are
                        ranked top to bottom and feed your live draft board.
                        Drag the handle to reorder.
                    </li>
                    <li>
                        Use the <strong>Considering</strong> group at the bottom
                        of each tab for players you're watching.
                    </li>
                    <li>
                        If a player on your board gets drafted, use{" "}
                        <strong>Remove drafted &amp; shift up</strong>. Everyone
                        below moves up a slot and you can add a new player at
                        the bottom.
                    </li>
                    <li>
                        Saving replaces all previous selections. You can update
                        any time before the draft.
                    </li>
                </ul>
            </div>

            {hasSubmitted && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-800 text-sm dark:border-green-900 dark:bg-green-950 dark:text-green-200 print:hidden">
                    You have already saved draft homework. Your selections are
                    shown below and can be updated at any time.
                </div>
            )}

            <DraftHomeworkForm
                data={result.data}
                playerPicUrl={playerPicBaseUrl()}
            />
        </div>
    )
}
