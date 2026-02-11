"use client"

import type { MatchedPair, UnmatchedPair } from "./actions"

interface PairsListProps {
    matched: MatchedPair[]
    unmatched: UnmatchedPair[]
}

export function PairsList({ matched, unmatched }: PairsListProps) {
    return (
        <div className="space-y-8">
            {/* Matched Pairs */}
            <div>
                <div className="mb-3 flex items-center gap-2">
                    <h2 className="font-semibold text-lg">Matched Pairs</h2>
                    <span className="rounded-md bg-green-100 px-2.5 py-1 font-medium text-green-700 text-sm dark:bg-green-900 dark:text-green-300">
                        {matched.length}
                    </span>
                </div>

                {matched.length === 0 ? (
                    <div className="rounded-lg border px-4 py-6 text-center text-muted-foreground">
                        No matched pairs found.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Player A
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Reason
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Player B
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Reason
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {matched.map((pair, idx) => (
                                    <tr
                                        key={`matched-${idx}`}
                                        className="border-b last:border-0"
                                    >
                                        <td className="px-4 py-2 font-medium">
                                            {pair.userA.name}
                                        </td>
                                        <td className="px-4 py-2">
                                            {pair.userA.pairReason || "—"}
                                        </td>
                                        <td className="px-4 py-2 font-medium">
                                            {pair.userB.name}
                                        </td>
                                        <td className="px-4 py-2">
                                            {pair.userB.pairReason || "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Unmatched Pairs */}
            <div>
                <div className="mb-3 flex items-center gap-2">
                    <h2 className="font-semibold text-lg">Unmatched Pairs</h2>
                    <span className="rounded-md bg-red-100 px-2.5 py-1 font-medium text-red-700 text-sm dark:bg-red-900 dark:text-red-300">
                        {unmatched.length}
                    </span>
                </div>

                {unmatched.length === 0 ? (
                    <div className="rounded-lg border px-4 py-6 text-center text-muted-foreground">
                        No unmatched pairs found.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Requester
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Reason
                                    </th>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                        Requested
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {unmatched.map((pair, idx) => (
                                    <tr
                                        key={`unmatched-${idx}`}
                                        className="border-b last:border-0"
                                    >
                                        <td className="px-4 py-2 font-medium">
                                            {pair.requester.name}
                                        </td>
                                        <td className="px-4 py-2">
                                            {pair.requester.pairReason || "—"}
                                        </td>
                                        <td className="px-4 py-2 font-medium">
                                            <span className="rounded bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900 dark:text-red-300">
                                                {pair.requested.name}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
