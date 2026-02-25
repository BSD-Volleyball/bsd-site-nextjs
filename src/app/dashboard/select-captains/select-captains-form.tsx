"use client"

import { useState, useMemo, useEffect } from "react"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { createTeams, type DivisionOption, type UserOption } from "./actions"

interface SelectCaptainsFormProps {
    seasonLabel: string
    divisions: DivisionOption[]
    users: UserOption[]
}

interface CaptainSelection {
    captainId: string | null
    teamName: string
}

function UserCombobox({
    users,
    value,
    onChange,
    placeholder = "Select a captain...",
    excludeIds = []
}: {
    users: UserOption[]
    value: string | null
    onChange: (userId: string | null, user: UserOption | null) => void
    placeholder?: string
    excludeIds?: string[]
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedUser = useMemo(
        () => users.find((u) => u.id === value),
        [users, value]
    )

    const filteredUsers = useMemo(() => {
        const filtered = users.filter(
            (u) => !excludeIds.includes(u.id) || u.id === value
        )
        if (!search) return filtered
        const lowerSearch = search.toLowerCase()
        return filtered.filter((u) => {
            const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
            const preferredName = u.preffered_name?.toLowerCase() || ""
            const oldIdStr = u.old_id?.toString() || ""
            return (
                fullName.includes(lowerSearch) ||
                preferredName.includes(lowerSearch) ||
                oldIdStr.includes(lowerSearch)
            )
        })
    }, [users, search, excludeIds, value])

    const getDisplayName = (user: UserOption) => {
        const oldIdPart = user.old_id ? `[${user.old_id}] ` : ""
        const preferredPart = user.preffered_name
            ? ` (${user.preffered_name})`
            : ""
        return `${oldIdPart}${user.first_name}${preferredPart} ${user.last_name}`
    }

    const handleSelect = (userId: string) => {
        const user = users.find((u) => u.id === userId) || null
        onChange(userId, user)
        setOpen(false)
        setSearch("")
    }

    const handleClear = () => {
        onChange(null, null)
        setSearch("")
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    <span
                        className={cn(!selectedUser && "text-muted-foreground")}
                    >
                        {selectedUser
                            ? getDisplayName(selectedUser)
                            : placeholder}
                    </span>
                    <div className="flex items-center gap-1">
                        {selectedUser && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="rounded-sm p-0.5 hover:bg-accent"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleClear()
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation()
                                        handleClear()
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
                    placeholder="Search players..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoCorrect="off"
                    className="mb-2"
                />
                <div className="max-h-60 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                        <p className="py-2 text-center text-muted-foreground text-sm">
                            No players found
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
                                {getDisplayName(user)}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function SelectCaptainsForm({
    seasonLabel = "",
    divisions,
    users
}: SelectCaptainsFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [divisionId, setDivisionId] = useState<string>("")
    const [captains, setCaptains] = useState<CaptainSelection[]>(
        Array(6)
            .fill(null)
            .map(() => ({ captainId: null, teamName: "" }))
    )

    const selectedDivision = useMemo(
        () => divisions.find((d) => d.id.toString() === divisionId) || null,
        [divisions, divisionId]
    )

    const numTeams = useMemo(() => {
        if (!selectedDivision) {
            return 6
        }

        return selectedDivision.name.trim().toUpperCase() === "BB" ? 4 : 6
    }, [selectedDivision])

    useEffect(() => {
        if (numTeams === 4) {
            setCaptains((prev) => {
                const next = [...prev]
                next[4] = { captainId: null, teamName: "" }
                next[5] = { captainId: null, teamName: "" }
                return next
            })
        }
    }, [numTeams])

    const selectedCaptainIds = useMemo(
        () =>
            captains
                .slice(0, numTeams)
                .map((c) => c.captainId)
                .filter((id): id is string => id !== null),
        [captains, numTeams]
    )

    const handleCaptainChange = (
        index: number,
        userId: string | null,
        user: UserOption | null
    ) => {
        setCaptains((prev) => {
            const newCaptains = [...prev]
            newCaptains[index] = {
                captainId: userId,
                teamName: user ? `Team ${user.last_name}` : ""
            }
            return newCaptains
        })
    }

    const handleTeamNameChange = (index: number, name: string) => {
        setCaptains((prev) => {
            const newCaptains = [...prev]
            newCaptains[index] = {
                ...newCaptains[index],
                teamName: name
            }
            return newCaptains
        })
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!divisionId) {
            setError("Please select a division.")
            return
        }

        const teamsToCreate = captains.slice(0, numTeams).map((c) => ({
            captainId: c.captainId || "",
            teamName: c.teamName
        }))

        // Check all captains are selected
        for (let i = 0; i < numTeams; i++) {
            if (!teamsToCreate[i].captainId) {
                setError(`Please select a captain for Team ${i + 1}.`)
                return
            }
            if (!teamsToCreate[i].teamName.trim()) {
                setError(`Please enter a name for Team ${i + 1}.`)
                return
            }
        }

        setIsLoading(true)

        const result = await createTeams(parseInt(divisionId), teamsToCreate)

        if (result.status) {
            setSuccess(result.message)
            // Reset form
            setCaptains(
                Array(6)
                    .fill(null)
                    .map(() => ({ captainId: null, teamName: "" }))
            )
        } else {
            setError(result.message)
        }

        setIsLoading(false)
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Team Configuration</CardTitle>
                    <CardDescription>
                        Select captains for the current season by choosing a
                        division and players.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="current-season">Current Season</Label>
                        <Input
                            id="current-season"
                            value={seasonLabel ?? ""}
                            readOnly
                            className="bg-muted"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="division">
                            Division <span className="text-destructive">*</span>
                        </Label>
                        <Select
                            value={divisionId}
                            onValueChange={setDivisionId}
                        >
                            <SelectTrigger id="division">
                                <SelectValue placeholder="Select a division" />
                            </SelectTrigger>
                            <SelectContent>
                                {divisions.map((division) => (
                                    <SelectItem
                                        key={division.id}
                                        value={division.id.toString()}
                                    >
                                        {division.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="border-t pt-6">
                        <h3 className="mb-4 font-semibold">Captains</h3>
                        <div className="space-y-4">
                            {Array.from({ length: numTeams }).map(
                                (_, index) => (
                                    <div
                                        key={index}
                                        className="grid grid-cols-2 items-end gap-4"
                                    >
                                        <div className="space-y-2">
                                            <Label htmlFor={`captain-${index}`}>
                                                Captain {index + 1}{" "}
                                                <span className="text-destructive">
                                                    *
                                                </span>
                                            </Label>
                                            <UserCombobox
                                                users={users}
                                                value={
                                                    captains[index].captainId
                                                }
                                                onChange={(userId, user) =>
                                                    handleCaptainChange(
                                                        index,
                                                        userId,
                                                        user
                                                    )
                                                }
                                                placeholder="Select a captain..."
                                                excludeIds={selectedCaptainIds}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label
                                                htmlFor={`team-name-${index}`}
                                            >
                                                Team Name{" "}
                                                <span className="text-destructive">
                                                    *
                                                </span>
                                            </Label>
                                            <Input
                                                id={`team-name-${index}`}
                                                value={captains[index].teamName}
                                                onChange={(e) =>
                                                    handleTeamNameChange(
                                                        index,
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="Team name"
                                            />
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm dark:bg-red-950 dark:text-red-200">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="rounded-md bg-green-50 p-3 text-green-800 text-sm dark:bg-green-950 dark:text-green-200">
                            {success}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="border-t pt-6">
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="ml-auto"
                    >
                        {isLoading ? "Creating..." : "Create"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
