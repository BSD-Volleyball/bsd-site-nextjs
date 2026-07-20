import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import type { DivisionPlacements } from "./actions"

function ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function TournamentPlacementsCard({
    divisions
}: {
    divisions: DivisionPlacements[]
}) {
    if (divisions.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Final Placements
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">
                        No placements were recorded (no completed results were
                        available when the tournament finished).
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Final Placements</CardTitle>
                <CardDescription>
                    Recorded when the tournament completed. First and second
                    place are highlighted.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {divisions.map((division) => (
                    <div key={division.divisionId} className="space-y-2">
                        <p className="font-medium text-sm">
                            {division.divisionName}
                        </p>
                        <ol className="space-y-1">
                            {division.teams.map((team) => (
                                <li
                                    key={team.teamId}
                                    className={`flex items-center gap-3 rounded-lg px-3 py-1.5 ${
                                        team.place <= 2
                                            ? "bg-primary/10 font-medium"
                                            : ""
                                    }`}
                                >
                                    <span className="w-10 shrink-0 text-muted-foreground text-sm">
                                        {ordinal(team.place)}
                                    </span>
                                    <span>{team.teamName}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
