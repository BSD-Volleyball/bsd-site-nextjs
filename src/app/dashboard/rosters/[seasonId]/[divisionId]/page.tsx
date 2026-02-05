import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { RiStarFill } from "@remixicon/react"
import { PageHeader } from "@/components/layout/page-header"
import { getRosterData } from "./actions"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Rosters"
}

export const dynamic = "force-dynamic"

export default async function RosterPage({
    params
}: {
    params: Promise<{ seasonId: string; divisionId: string }>
}) {
    const session = await auth.api.getSession({ headers: await headers() })

    if (!session) {
        redirect("/auth/sign-in")
    }

    const { seasonId, divisionId } = await params
    const result = await getRosterData(
        parseInt(seasonId, 10),
        parseInt(divisionId, 10)
    )

    if (!result.status) {
        return (
            <div className="space-y-6">
                <PageHeader
                    title="Rosters"
                    description="View team rosters."
                />
                <div className="rounded-md bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {result.message || "Failed to load roster data."}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${result.seasonLabel} — ${result.divisionName} Rosters`}
                description={`Team rosters for ${result.divisionName}.`}
            />
            {result.teams.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No teams found for this division.
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {result.teams.map((team) => (
                        <div
                            key={team.id}
                            className="rounded-lg border bg-card p-4 shadow-sm"
                        >
                            <h3 className="mb-3 border-b pb-2 font-semibold text-lg">
                                {team.name}
                            </h3>
                            {team.players.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    No players drafted yet.
                                </p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {team.players.map((player) => (
                                        <li
                                            key={player.id}
                                            className="flex items-center gap-2 text-sm"
                                        >
                                            <span
                                                className={
                                                    player.isCaptain
                                                        ? "font-semibold"
                                                        : ""
                                                }
                                            >
                                                {player.displayName}{" "}
                                                {player.lastName}
                                            </span>
                                            {player.isCaptain && (
                                                <RiStarFill
                                                    className="h-4 w-4 shrink-0 text-yellow-500"
                                                    aria-label="Captain"
                                                />
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
