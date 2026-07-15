import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import type { LeaderboardRow } from "@/lib/player-elo-data"
import { cn } from "@/lib/utils"

interface EloLeaderboardProps {
    rows: LeaderboardRow[]
    currentUserId: string
    minMatches: number
}

export function EloLeaderboard({
    rows,
    currentUserId,
    minMatches
}: EloLeaderboardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">
                    Skill Rating Leaderboard
                    <span className="ml-2 font-normal text-muted-foreground">
                        players with {minMatches}+ rated matches
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                        No players have enough rated matches yet.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>Player</TableHead>
                                <TableHead className="text-right">
                                    Rating
                                </TableHead>
                                <TableHead className="text-right">
                                    Matches
                                </TableHead>
                                <TableHead>Last Drafted</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, index) => (
                                <TableRow
                                    key={row.userId}
                                    className={cn(
                                        row.userId === currentUserId &&
                                            "bg-muted/50 font-medium"
                                    )}
                                >
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>
                                        {row.name}
                                        {row.userId === currentUserId && (
                                            <span className="ml-1 text-muted-foreground">
                                                (you)
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {Math.round(row.rating)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.matches}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {row.divisionLabel ?? "—"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
