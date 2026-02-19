"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import {
    getCommissionersForSeason,
    saveCommissioners,
    type Season,
    type User,
    type Division
} from "./actions"

interface CommissionersFormProps {
    seasons: Season[]
    users: User[]
    divisions: Division[]
    initialSeasonId: number | null
}

interface CommissionerSelectProps {
    users: User[]
    value: string | null
    onValueChange: (value: string | null) => void
    label: string
    id: string
}

function CommissionerSelect({
    users,
    value,
    onValueChange,
    label,
    id
}: CommissionerSelectProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedUser = useMemo(
        () => users.find((u) => u.id === value),
        [users, value]
    )

    const filteredUsers = useMemo(() => {
        if (!search) return users
        const lowerSearch = search.toLowerCase()
        return users.filter((u) => u.name.toLowerCase().includes(lowerSearch))
    }, [users, search])

    const handleSelect = (userId: string | null) => {
        onValueChange(userId)
        setOpen(false)
        setSearch("")
    }

    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between font-normal"
                    >
                        <span
                            className={cn(
                                !selectedUser && "text-muted-foreground"
                            )}
                        >
                            {selectedUser
                                ? selectedUser.name
                                : "Select a commissioner..."}
                        </span>
                        <div className="flex items-center gap-1">
                            {selectedUser && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    className="rounded-sm p-0.5 hover:bg-accent"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleSelect(null)
                                    }}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                        ) {
                                            e.stopPropagation()
                                            handleSelect(null)
                                        }
                                    }}
                                >
                                    <RiCloseLine className="h-4 w-4 text-muted-foreground" />
                                </span>
                            )}
                            <RiArrowDownSLine className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-(--radix-popover-trigger-width) p-2"
                    align="start"
                >
                    <Input
                        placeholder="Search by name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoCorrect="off"
                        className="mb-2"
                    />
                    <div className="max-h-60 overflow-y-auto">
                        {filteredUsers.length === 0 ? (
                            <p className="py-2 text-center text-muted-foreground text-sm">
                                No users found
                            </p>
                        ) : (
                            filteredUsers.map((user) => (
                                <button
                                    key={user.id}
                                    type="button"
                                    className={cn(
                                        "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                                        value === user.id && "bg-accent"
                                    )}
                                    onClick={() => handleSelect(user.id)}
                                >
                                    {user.name}
                                </button>
                            ))
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}

export function CommissionersForm({
    seasons,
    users,
    divisions,
    initialSeasonId
}: CommissionersFormProps) {
    const router = useRouter()
    const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(
        initialSeasonId
    )
    const [assignments, setAssignments] = useState<
        Record<
            number,
            {
                commissioner1: string | null
                commissioner2: string | null
            }
        >
    >({})
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const loadCommissioners = useCallback(async (seasonId: number) => {
        setIsLoading(true)
        setMessage(null)

        const result = await getCommissionersForSeason(seasonId)

        if (result.status) {
            const assignmentsMap: Record<
                number,
                {
                    commissioner1: string | null
                    commissioner2: string | null
                }
            > = {}

            for (const assignment of result.assignments) {
                assignmentsMap[assignment.divisionId] = {
                    commissioner1: assignment.commissioner1,
                    commissioner2: assignment.commissioner2
                }
            }

            setAssignments(assignmentsMap)
        } else {
            setMessage({
                type: "error",
                text: result.message || "Failed to load commissioners."
            })
        }

        setIsLoading(false)
    }, [])

    // Load commissioners when season changes
    useEffect(() => {
        if (selectedSeasonId) {
            loadCommissioners(selectedSeasonId)
        }
    }, [selectedSeasonId, loadCommissioners])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        if (!selectedSeasonId) {
            setMessage({
                type: "error",
                text: "Please select a season."
            })
            return
        }

        setIsSaving(true)
        setMessage(null)

        const assignmentsArray = divisions.map((div) => ({
            divisionId: div.id,
            divisionName: div.name,
            commissioner1: assignments[div.id]?.commissioner1 ?? null,
            commissioner2: assignments[div.id]?.commissioner2 ?? null
        }))

        const result = await saveCommissioners({
            seasonId: selectedSeasonId,
            assignments: assignmentsArray
        })

        setMessage({
            type: result.status ? "success" : "error",
            text: result.message
        })

        if (result.status) {
            router.refresh()
        }

        setIsSaving(false)
    }

    function updateCommissioner(
        divisionId: number,
        commissionerType: "commissioner1" | "commissioner2",
        value: string | null
    ) {
        setAssignments((prev) => ({
            ...prev,
            [divisionId]: {
                commissioner1: prev[divisionId]?.commissioner1 ?? null,
                commissioner2: prev[divisionId]?.commissioner2 ?? null,
                [commissionerType]: value
            }
        }))
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="season">Season</Label>
                <Select
                    value={selectedSeasonId?.toString() ?? ""}
                    onValueChange={(value) =>
                        setSelectedSeasonId(Number.parseInt(value))
                    }
                >
                    <SelectTrigger id="season">
                        <SelectValue placeholder="Select a season" />
                    </SelectTrigger>
                    <SelectContent>
                        {seasons.map((season) => (
                            <SelectItem
                                key={season.id}
                                value={season.id.toString()}
                            >
                                {season.season.charAt(0).toUpperCase() +
                                    season.season.slice(1)}{" "}
                                {season.year} ({season.code})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {isLoading && (
                <div className="text-center text-muted-foreground">
                    Loading commissioners...
                </div>
            )}

            {!isLoading && selectedSeasonId && (
                <div className="space-y-4">
                    {divisions.map((division) => (
                        <Card key={division.id}>
                            <CardHeader>
                                <CardTitle className="text-lg">
                                    {division.name} Division
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <CommissionerSelect
                                    users={users}
                                    value={
                                        assignments[division.id]
                                            ?.commissioner1 ?? null
                                    }
                                    onValueChange={(value) =>
                                        updateCommissioner(
                                            division.id,
                                            "commissioner1",
                                            value
                                        )
                                    }
                                    label="Commissioner 1"
                                    id={`${division.id}-comm1`}
                                />

                                <CommissionerSelect
                                    users={users}
                                    value={
                                        assignments[division.id]
                                            ?.commissioner2 ?? null
                                    }
                                    onValueChange={(value) =>
                                        updateCommissioner(
                                            division.id,
                                            "commissioner2",
                                            value
                                        )
                                    }
                                    label="Commissioner 2"
                                    id={`${division.id}-comm2`}
                                />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {message && (
                <div
                    className={`rounded-md p-4 ${
                        message.type === "success"
                            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                    }`}
                >
                    {message.text}
                </div>
            )}

            <Button type="submit" disabled={isSaving || !selectedSeasonId}>
                {isSaving ? "Saving..." : "Save Commissioners"}
            </Button>
        </form>
    )
}
