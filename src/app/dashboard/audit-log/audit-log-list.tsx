"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getAuditLogs, type AuditLogEntry } from "./actions"

interface AuditLogListProps {
    initialEntries: AuditLogEntry[]
    initialTotal: number
}

const PAGE_SIZE = 50

const actionColors: Record<string, string> = {
    create: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    update: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    delete: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    merge: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    upsert: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
}

export function AuditLogList({
    initialEntries,
    initialTotal
}: AuditLogListProps) {
    const [entries, setEntries] = useState(initialEntries)
    const [total, setTotal] = useState(initialTotal)
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(false)

    const filteredEntries = useMemo(() => {
        if (!search) return entries
        const lower = search.toLowerCase()
        return entries.filter(
            (e) =>
                e.summary.toLowerCase().includes(lower) ||
                e.userName?.toLowerCase().includes(lower) ||
                e.action.toLowerCase().includes(lower) ||
                e.entityType?.toLowerCase().includes(lower)
        )
    }, [entries, search])

    const handleLoadMore = async () => {
        setLoading(true)
        const result = await getAuditLogs({
            offset: entries.length,
            limit: PAGE_SIZE
        })
        if (result.status) {
            setEntries((prev) => [...prev, ...result.entries])
            setTotal(result.total)
        }
        setLoading(false)
    }

    const hasMore = entries.length < total

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="rounded-md bg-muted px-3 py-1.5 font-medium text-sm">
                    {total} total entries
                </span>
                <Input
                    placeholder="Filter by summary, user, action..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-xs"
                />
            </div>

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Time
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                User
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Action
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Entity
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Summary
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEntries.map((entry) => (
                            <tr
                                key={entry.id}
                                className="border-b transition-colors last:border-0 hover:bg-accent/50"
                            >
                                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                                    {new Date(entry.createdAt).toLocaleString()}
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    {entry.userName ?? entry.userId}
                                </td>
                                <td className="px-4 py-2">
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 font-medium text-xs ${actionColors[entry.action] || "bg-muted"}`}
                                    >
                                        {entry.action}
                                    </span>
                                </td>
                                <td className="px-4 py-2">
                                    {entry.entityType || "\u2014"}
                                </td>
                                <td className="px-4 py-2">{entry.summary}</td>
                            </tr>
                        ))}
                        {filteredEntries.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No audit log entries found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {hasMore && !search && (
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Load More"}
                    </Button>
                </div>
            )}
        </div>
    )
}
