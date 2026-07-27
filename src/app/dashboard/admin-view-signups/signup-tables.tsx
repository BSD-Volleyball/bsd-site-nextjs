"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SignupEntry } from "./actions"
import { getDisplayName } from "./signup-display-name"

interface SignupTableProps {
    entries: SignupEntry[]
    signupNumberById: Map<number, number>
    onPlayerClick: (entry: SignupEntry) => void
    onDeleteClick: (entry: SignupEntry) => void
}

export function UndraftedSignupsTable({
    entries,
    signupNumberById,
    onPlayerClick,
    onDeleteClick
}: SignupTableProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base">Not Yet Drafted</h2>
                <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-xs">
                    {entries.length}
                </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                #
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Name
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Pair Pick
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Gender
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Age
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Captain
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Paid
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Date
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, idx) => (
                            <tr
                                key={entry.signupId}
                                className={cn(
                                    "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50",
                                    entry.isNew &&
                                        "bg-blue-50 dark:bg-blue-950/40"
                                )}
                                onClick={() => onPlayerClick(entry)}
                            >
                                <td className="px-4 py-2 text-muted-foreground">
                                    {signupNumberById.get(entry.signupId) ??
                                        idx + 1}
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    <div className="flex items-center gap-2">
                                        {getDisplayName(entry)}
                                        {entry.isNew && (
                                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700 text-xs dark:bg-blue-900 dark:text-blue-300">
                                                new
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-2">
                                    {entry.pairPickName || "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.male === true
                                        ? "M"
                                        : entry.male === false
                                          ? "F"
                                          : "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.age || "\u2014"}
                                </td>
                                <td className="px-4 py-2 capitalize">
                                    {entry.captain === "yes"
                                        ? "Yes"
                                        : entry.captain === "only_if_needed"
                                          ? "If needed"
                                          : entry.captain === "no"
                                            ? "No"
                                            : "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.amountPaid
                                        ? `$${entry.amountPaid}`
                                        : "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {new Date(
                                        entry.signupDate
                                    ).toLocaleDateString("en-US")}
                                </td>
                                <td className="px-4 py-2">
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onDeleteClick(entry)
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {entries.length === 0 && (
                            <tr>
                                <td
                                    colSpan={9}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No undrafted players found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export function DraftedSignupsTable({
    entries,
    signupNumberById,
    onPlayerClick,
    onDeleteClick
}: SignupTableProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <h2 className="font-semibold text-base">Drafted Players</h2>
                <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-xs">
                    {entries.length}
                </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                #
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Name
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Pair Pick
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Gender
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Age
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Captain
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Draft Status
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Paid
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Date
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, idx) => (
                            <tr
                                key={entry.signupId}
                                className={cn(
                                    "cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50",
                                    entry.isNew &&
                                        "bg-blue-50 dark:bg-blue-950/40"
                                )}
                                onClick={() => onPlayerClick(entry)}
                            >
                                <td className="px-4 py-2 text-muted-foreground">
                                    {signupNumberById.get(entry.signupId) ??
                                        idx + 1}
                                </td>
                                <td className="px-4 py-2 font-medium">
                                    <div className="flex items-center gap-2">
                                        {getDisplayName(entry)}
                                        {entry.isNew && (
                                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-blue-700 text-xs dark:bg-blue-900 dark:text-blue-300">
                                                new
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-2">
                                    {entry.pairPickName || "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.male === true
                                        ? "M"
                                        : entry.male === false
                                          ? "F"
                                          : "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {entry.age || "\u2014"}
                                </td>
                                <td className="px-4 py-2 capitalize">
                                    {entry.captain === "yes"
                                        ? "Yes"
                                        : entry.captain === "only_if_needed"
                                          ? "If needed"
                                          : entry.captain === "no"
                                            ? "No"
                                            : "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 text-xs dark:bg-amber-900 dark:text-amber-200">
                                        {entry.draftedIn}
                                    </span>
                                </td>
                                <td className="px-4 py-2">
                                    {entry.amountPaid
                                        ? `$${entry.amountPaid}`
                                        : "\u2014"}
                                </td>
                                <td className="px-4 py-2">
                                    {new Date(
                                        entry.signupDate
                                    ).toLocaleDateString("en-US")}
                                </td>
                                <td className="px-4 py-2">
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onDeleteClick(entry)
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {entries.length === 0 && (
                            <tr>
                                <td
                                    colSpan={10}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No drafted players.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
