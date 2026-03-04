import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import { getDraftHomeworkData } from "./actions"
import { DraftHomeworkForm } from "./draft-homework-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Draft Homework"
}

export const dynamic = "force-dynamic"

export default async function DraftHomeworkPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

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
            <PageHeader
                title="Draft Homework"
                description={`${result.data.divisionName} Division — plan your picks before the live draft.`}
            />

            <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Instructions</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                    <li>
                        Use the <strong>Males</strong> and{" "}
                        <strong>Non-Males</strong> tabs to plan your picks for
                        each round of th edraft.
                    </li>
                    <li>
                        Each round has {result.data.numTeams} slots.
                    </li>
                    <li>
                        Use the <strong>Considering</strong> group at the bottom
                        of each tab for players you&apos;re watching.
                    </li>
                    <li>
                        Saving replaces all previous selections. You can update
                        any time before the draft.
                    </li>
                </ul>
            </div>

            {hasSubmitted && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-800 text-sm dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                    You have already saved draft homework. Your selections are
                    shown below and can be updated at any time.
                </div>
            )}

            <DraftHomeworkForm
                data={result.data}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
