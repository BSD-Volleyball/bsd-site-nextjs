import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import { getWeek2HomeworkData } from "./actions"
import { Week2HomeworkForm } from "./week-2-homework-form"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Week 2 Homework"
}

export const dynamic = "force-dynamic"

export default async function Week2HomeworkPage() {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const result = await getWeek2HomeworkData()

    if (!result.status || !result.data) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Week 2 Homework"
                    description="Select players to move up and down divisions after Week 2 tryouts."
                />
                <div className="rounded-md bg-amber-50 p-4 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    {result.message}
                </div>
            </div>
        )
    }

    const {
        seasonId,
        divisionName,
        teamNumber,
        captainUserId,
        teamRoster,
        allTryoutPlayers,
        isTopDivision,
        isBottomDivision,
        existingSubmissions,
        allSeasons
    } = result.data

    const hasSubmitted = existingSubmissions.length > 0

    return (
        <div className="space-y-6">
            <PageHeader
                title="Week 2 Homework"
                description={`${divisionName} Division — Team ${divisionName}-${teamNumber}`}
            />

            <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Instructions</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                    {!isTopDivision && (
                        <li>
                            Select <strong>1 male</strong> and{" "}
                            <strong>1 non-male</strong> player from your team to
                            move up a division. These are required.
                        </li>
                    )}
                    {!isBottomDivision && (
                        <li>
                            Select <strong>1 male</strong> and{" "}
                            <strong>1 non-male</strong> player from your team to
                            move down a division. These are required.
                        </li>
                    )}
                    {isTopDivision && (
                        <li>
                            You are in the top division ({divisionName}). No
                            players can move up from your team.
                        </li>
                    )}
                    {isBottomDivision && (
                        <li>
                            You are in the bottom division ({divisionName}). No
                            players can move down from your team.
                        </li>
                    )}
                    <li>
                        You may also recommend any players from the entire Week
                        2 tryout to move up or down. These are optional
                        suggestions.
                    </li>
                    <li>Click any player&apos;s name to view their profile.</li>
                </ul>
            </div>

            {hasSubmitted && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-800 text-sm dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                    You have already submitted this homework. Your current
                    selections are shown below. You can update them at any time.
                </div>
            )}

            <Week2HomeworkForm
                seasonId={seasonId}
                divisionName={divisionName}
                teamNumber={teamNumber}
                captainUserId={captainUserId}
                teamRoster={teamRoster}
                allTryoutPlayers={allTryoutPlayers}
                isTopDivision={isTopDivision}
                isBottomDivision={isBottomDivision}
                existingSubmissions={existingSubmissions}
                allSeasons={allSeasons}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
