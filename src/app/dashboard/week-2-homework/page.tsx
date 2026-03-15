import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { PageHeader } from "@/components/layout/page-header"
import {
    getWeek2HomeworkData,
    type Week2HomeworkData,
    type CoachWeek2HomeworkData
} from "./actions"
import { Week2HomeworkForm } from "./week-2-homework-form"
import { CoachWeek2HomeworkForm } from "./coach-week-2-homework-form"
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

    if (result.mode === "coach") {
        const data = result.data as CoachWeek2HomeworkData
        const hasSubmitted = data.existingSubmissions.length > 0

        return (
            <div className="space-y-6">
                <PageHeader
                    title="Week 2 Homework"
                    description={`${data.divisionName} Division — Coach View`}
                />

                <div className="rounded-md border bg-muted/30 p-4 text-sm">
                    <p className="font-medium">Instructions</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                        {!data.isTopDivision && (
                            <li>
                                Select{" "}
                                <strong>one player from each team</strong> in
                                the division to move up to a stronger division.
                                These are required.
                            </li>
                        )}
                        {data.isTopDivision && (
                            <li>
                                You are in the top division ({data.divisionName}
                                ). No players can move up from this division.
                            </li>
                        )}
                        <li>
                            You may also recommend any players from the entire
                            Week 2 tryout to move up or down. These are optional
                            suggestions.
                        </li>
                        <li>
                            Click any player&apos;s name to view their profile.
                        </li>
                    </ul>
                </div>

                {hasSubmitted && (
                    <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-800 text-sm dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                        You have already submitted this homework. Your current
                        selections are shown below. You can update them at any
                        time.
                    </div>
                )}

                <CoachWeek2HomeworkForm
                    seasonId={data.seasonId}
                    divisionName={data.divisionName}
                    coachUserId={data.coachUserId}
                    divisionTeams={data.divisionTeams}
                    allTryoutPlayers={data.allTryoutPlayers}
                    isTopDivision={data.isTopDivision}
                    isBottomDivision={data.isBottomDivision}
                    existingSubmissions={data.existingSubmissions}
                    allSeasons={data.allSeasons}
                    playerPicUrl={process.env.PLAYER_PIC_URL || ""}
                />
            </div>
        )
    }

    // Captain view
    const data = result.data as Week2HomeworkData
    const hasSubmitted = data.existingSubmissions.length > 0

    return (
        <div className="space-y-6">
            <PageHeader
                title="Week 2 Homework"
                description={`${data.divisionName} Division — Team ${data.divisionName}-${data.teamNumber}`}
            />

            <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Instructions</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                    {!data.isTopDivision && (
                        <li>
                            Select <strong>1 male</strong> and{" "}
                            <strong>1 non-male</strong> player from your team to
                            move up a division. These are required.
                        </li>
                    )}
                    {!data.isBottomDivision && (
                        <li>
                            Select <strong>1 male</strong> and{" "}
                            <strong>1 non-male</strong> player from your team to
                            move down a division. These are required.
                        </li>
                    )}
                    {data.isTopDivision && (
                        <li>
                            You are in the top division ({data.divisionName}).
                            No players can move up from your team.
                        </li>
                    )}
                    {data.isBottomDivision && (
                        <li>
                            You are in the bottom division ({data.divisionName}
                            ). No players can move down from your team.
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
                seasonId={data.seasonId}
                divisionName={data.divisionName}
                teamNumber={data.teamNumber}
                captainUserId={data.captainUserId}
                teamRoster={data.teamRoster}
                allTryoutPlayers={data.allTryoutPlayers}
                isTopDivision={data.isTopDivision}
                isBottomDivision={data.isBottomDivision}
                existingSubmissions={data.existingSubmissions}
                allSeasons={data.allSeasons}
                playerPicUrl={process.env.PLAYER_PIC_URL || ""}
            />
        </div>
    )
}
