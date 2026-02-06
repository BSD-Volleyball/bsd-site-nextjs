"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    saveEvaluations,
    type NewPlayerEntry,
    type DivisionOption
} from "./actions"

interface EvaluatePlayersListProps {
    players: NewPlayerEntry[]
    divisions: DivisionOption[]
}

function getDisplayName(entry: NewPlayerEntry): string {
    const preferred = entry.preferredName ? ` (${entry.preferredName})` : ""
    return `${entry.firstName}${preferred} ${entry.lastName}`
}

export function EvaluatePlayersList({
    players,
    divisions
}: EvaluatePlayersListProps) {
    const router = useRouter()
    const [search, setSearch] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    // Track division selections per player (string IDs for Select compatibility)
    const [selections, setSelections] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {}
        for (const player of players) {
            if (player.division !== null) {
                initial[player.userId] = String(player.division)
            }
        }
        return initial
    })

    const filteredPlayers = useMemo(() => {
        if (!search) return players
        const lower = search.toLowerCase()
        return players.filter((p) => {
            const name =
                `${p.firstName} ${p.lastName}`.toLowerCase()
            const preferred = p.preferredName?.toLowerCase() || ""
            return name.includes(lower) || preferred.includes(lower)
        })
    }, [players, search])

    const evaluatedCount = Object.keys(selections).length

    const handleSelectionChange = (userId: string, division: string) => {
        setSelections((prev) => ({ ...prev, [userId]: division }))
    }

    const handleClearSelection = (userId: string) => {
        setSelections((prev) => {
            const next = { ...prev }
            delete next[userId]
            return next
        })
    }

    const handleSubmit = async () => {
        const data = Object.entries(selections).map(
            ([playerId, divisionId]) => ({
                playerId,
                division: parseInt(divisionId, 10)
            })
        )

        if (data.length === 0) {
            setMessage({
                type: "error",
                text: "No evaluations to save."
            })
            return
        }

        setIsLoading(true)
        setMessage(null)

        const result = await saveEvaluations(data)

        setIsLoading(false)

        if (result.status) {
            setMessage({ type: "success", text: result.message })
            router.refresh()
        } else {
            setMessage({ type: "error", text: result.message })
        }
    }

    return (
        <div className="space-y-4">
            {message && (
                <div
                    className={`rounded-md p-3 text-sm ${
                        message.type === "success"
                            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                    }`}
                >
                    {message.text}
                </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-3 py-1.5 font-medium text-sm">
                        {players.length} new player
                        {players.length !== 1 && "s"}
                    </span>
                    <span className="rounded-md bg-green-100 px-3 py-1.5 font-medium text-green-700 text-sm dark:bg-green-900 dark:text-green-300">
                        {evaluatedCount} evaluated
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Filter by name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-xs"
                    />
                    <Button
                        onClick={handleSubmit}
                        disabled={isLoading || evaluatedCount === 0}
                        size="sm"
                    >
                        {isLoading ? "Saving..." : "Save Evaluations"}
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Name
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Gender
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Experience
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Assessment
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Division
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPlayers.map((player) => (
                            <tr
                                key={player.userId}
                                className="border-b transition-colors last:border-0 hover:bg-accent/50"
                            >
                                <td className="px-4 py-2 font-medium">
                                    {getDisplayName(player)}
                                </td>
                                <td className="px-4 py-2">
                                    {player.male === true
                                        ? "M"
                                        : player.male === false
                                          ? "F"
                                          : "—"}
                                </td>
                                <td className="px-4 py-2">
                                    {player.experience || "—"}
                                </td>
                                <td className="px-4 py-2">
                                    {player.assessment || "—"}
                                </td>
                                <td className="px-4 py-2">
                                    <Select
                                        value={
                                            selections[player.userId] || ""
                                        }
                                        onValueChange={(value) =>
                                            handleSelectionChange(
                                                player.userId,
                                                value
                                            )
                                        }
                                    >
                                        <SelectTrigger className="h-8 w-28">
                                            <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {divisions.map((div) => (
                                                <SelectItem
                                                    key={div.id}
                                                    value={String(div.id)}
                                                >
                                                    {div.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </td>
                            </tr>
                        ))}
                        {filteredPlayers.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No new players found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
