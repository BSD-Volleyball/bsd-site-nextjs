"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPlayerName } from "@/lib/utils"
import type { DeletedSignupEntry } from "./actions"

interface DeletedSignupsCardProps {
    deletedSignups: DeletedSignupEntry[]
}

export function DeletedSignupsCard({
    deletedSignups
}: DeletedSignupsCardProps) {
    if (deletedSignups.length === 0) {
        return null
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base text-muted-foreground">
                    Deleted Players ({deletedSignups.length})
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
                                <th className="px-4 py-2 font-medium">
                                    Player
                                </th>
                                <th className="px-4 py-2 font-medium">Email</th>
                                <th className="px-4 py-2 font-medium">
                                    Signup ID
                                </th>
                                <th className="px-4 py-2 font-medium">
                                    Deleted At
                                </th>
                                <th className="px-4 py-2 font-medium">
                                    Deleted By
                                </th>
                                <th className="px-4 py-2 font-medium">
                                    Reason
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {deletedSignups.map((entry) => {
                                const displayName = formatPlayerName(
                                    entry.firstName,
                                    entry.lastName,
                                    entry.preferredName
                                )
                                return (
                                    <tr
                                        key={entry.signupId}
                                        className="border-b last:border-0"
                                    >
                                        <td className="px-4 py-2 font-medium">
                                            {displayName}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {entry.email}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {entry.signupId}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {new Date(
                                                entry.deletedAt
                                            ).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {entry.deletedByName}
                                        </td>
                                        <td className="px-4 py-2 text-muted-foreground">
                                            {entry.reason ?? "—"}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    )
}
