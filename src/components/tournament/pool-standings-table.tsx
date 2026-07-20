import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import type { PoolStandingRow } from "@/lib/tournament-standings"

function formatPct(value: number): string {
    return `${(value * 100).toFixed(1)}%`
}

/**
 * Read-only pool standings table (USAV tie-break order — rows arrive pre-sorted
 * from getPoolStandings). Shows record, sets, and the set/point percentages that
 * drive the tie-break.
 */
export function PoolStandingsTable({ rows }: { rows: PoolStandingRow[] }) {
    if (rows.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                No teams in this pool.
            </p>
        )
    }

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead className="text-right">W-L</TableHead>
                        <TableHead className="text-right">Sets</TableHead>
                        <TableHead className="text-right">Set %</TableHead>
                        <TableHead className="text-right">Point %</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row, index) => (
                        <TableRow key={row.teamId}>
                            <TableCell className="text-muted-foreground">
                                {index + 1}
                            </TableCell>
                            <TableCell className="font-medium">
                                {row.teamName}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.wins}-{row.losses}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.setsWon}-{row.setsLost}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {formatPct(row.setPct)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {formatPct(row.pointPct)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
