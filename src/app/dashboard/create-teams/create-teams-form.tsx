"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"
import { createTeams, type SeasonOption, type DivisionOption, type UserOption } from "./actions"

interface CreateTeamsFormProps {
    seasons: SeasonOption[]
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
        () => users.find(u => u.id === value),
        [users, value]
    )

    const filteredUsers = useMemo(() => {
        let filtered = users.filter(u => !excludeIds.includes(u.id) || u.id === value)
        if (!search) return filtered
        const lowerSearch = search.toLowerCase()
        return filtered.filter(u => {
            const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
            const preferredName = u.preffered_name?.toLowerCase() || ""
            const oldIdStr = u.old_id?.toString() || ""
            return fullName.includes(lowerSearch) || preferredName.includes(lowerSearch) || oldIdStr.includes(lowerSearch)
        })
    }, [users, search, excludeIds, value])

    const getDisplayName = (user: UserOption) => {
        const oldIdPart = user.old_id ? `[${user.old_id}] ` : ""
        const preferredPart = user.preffered_name ? ` (${user.preffered_name})` : ""
        return `${oldIdPart}${user.first_name}${preferredPart} ${user.last_name}`
    }

    const handleSelect = (userId: string) => {
        const user = users.find(u => u.id === userId) || null
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
                    <span className={cn(!selectedUser && "text-muted-foreground")}>
                        {selectedUser ? getDisplayName(selectedUser) : placeholder}
                    </span>
                    <div className="flex items-center gap-1">
                        {selectedUser && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="rounded-sm hover:bg-accent p-0.5"
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
            <PopoverContent className="w-(--radix-popover-trigger-width) p-2" align="start">
                <Input
                    placeholder="Search players..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mb-2"
                />
                <div className="max-h-60 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                        <p className="text-muted-foreground text-sm py-2 text-center">
                            No players found
                        </p>
                    ) : (
                        filteredUsers.map(user => (
                            <button
                                key={user.id}
                                type="button"
                                className={cn(
                                    "w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-accent",
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

export function CreateTeamsForm({ seasons, divisions, users }: CreateTeamsFormProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [seasonId, setSeasonId] = useState<string>("")
    const [divisionId, setDivisionId] = useState<string>("")
    const [teamCount, setTeamCount] = useState<"4" | "6">("6")
    const [captains, setCaptains] = useState<CaptainSelection[]>(
        Array(6).fill(null).map(() => ({ captainId: null, teamName: "" }))
    )

    const selectedCaptainIds = useMemo(
        () => captains.map(c => c.captainId).filter((id): id is string => id !== null),
        [captains]
    )

    const handleCaptainChange = (index: number, userId: string | null, user: UserOption | null) => {
        setCaptains(prev => {
            const newCaptains = [...prev]
            newCaptains[index] = {
                captainId: userId,
                teamName: user ? `Team ${user.last_name}` : ""
            }
            return newCaptains
        })
    }

    const handleTeamNameChange = (index: number, name: string) => {
        setCaptains(prev => {
            const newCaptains = [...prev]
            newCaptains[index] = {
                ...newCaptains[index],
                teamName: name
            }
            return newCaptains
        })
    }

    const handleTeamCountChange = (value: "4" | "6") => {
        setTeamCount(value)
        // If switching from 6 to 4, clear the last two slots
        if (value === "4") {
            setCaptains(prev => {
                const newCaptains = [...prev]
                newCaptains[4] = { captainId: null, teamName: "" }
                newCaptains[5] = { captainId: null, teamName: "" }
                return newCaptains
            })
        }
    }

    const formatSeasonLabel = (season: SeasonOption) => {
        const seasonName = season.season.charAt(0).toUpperCase() + season.season.slice(1)
        return `${seasonName} ${season.year}`
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        if (!seasonId) {
            setError("Please select a season.")
            return
        }

        if (!divisionId) {
            setError("Please select a division.")
            return
        }

        const numTeams = parseInt(teamCount)
        const teamsToCreate = captains.slice(0, numTeams).map(c => ({
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

        const result = await createTeams(
            parseInt(seasonId),
            parseInt(divisionId),
            teamsToCreate
        )

        if (result.status) {
            setSuccess(result.message)
            // Reset form
            setCaptains(Array(6).fill(null).map(() => ({ captainId: null, teamName: "" })))
        } else {
            setError(result.message)
        }

        setIsLoading(false)
    }

    const numTeams = parseInt(teamCount)

    return (
        <form onSubmit={handleSubmit}>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Team Configuration</CardTitle>
                    <CardDescription>
                        Select the season, division, and number of teams to create.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="season">
                                Season <span className="text-destructive">*</span>
                            </Label>
                            <Select value={seasonId} onValueChange={setSeasonId}>
                                <SelectTrigger id="season">
                                    <SelectValue placeholder="Select a season" />
                                </SelectTrigger>
                                <SelectContent>
                                    {seasons.map((season) => (
                                        <SelectItem key={season.id} value={season.id.toString()}>
                                            {formatSeasonLabel(season)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="division">
                                Division <span className="text-destructive">*</span>
                            </Label>
                            <Select value={divisionId} onValueChange={setDivisionId}>
                                <SelectTrigger id="division">
                                    <SelectValue placeholder="Select a division" />
                                </SelectTrigger>
                                <SelectContent>
                                    {divisions.map((division) => (
                                        <SelectItem key={division.id} value={division.id.toString()}>
                                            {division.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>
                            Number of Teams <span className="text-destructive">*</span>
                        </Label>
                        <RadioGroup
                            value={teamCount}
                            onValueChange={(value) => handleTeamCountChange(value as "4" | "6")}
                            className="flex gap-4"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="6" id="teams-6" />
                                <Label htmlFor="teams-6" className="font-normal cursor-pointer">
                                    6 Teams
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="4" id="teams-4" />
                                <Label htmlFor="teams-4" className="font-normal cursor-pointer">
                                    4 Teams
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className="border-t pt-6">
                        <h3 className="font-semibold mb-4">Captains</h3>
                        <div className="space-y-4">
                            {Array.from({ length: numTeams }).map((_, index) => (
                                <div key={index} className="grid grid-cols-2 gap-4 items-end">
                                    <div className="space-y-2">
                                        <Label htmlFor={`captain-${index}`}>
                                            Captain {index + 1} <span className="text-destructive">*</span>
                                        </Label>
                                        <UserCombobox
                                            users={users}
                                            value={captains[index].captainId}
                                            onChange={(userId, user) => handleCaptainChange(index, userId, user)}
                                            placeholder="Select a captain..."
                                            excludeIds={selectedCaptainIds}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`team-name-${index}`}>
                                            Team Name <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id={`team-name-${index}`}
                                            value={captains[index].teamName}
                                            onChange={(e) => handleTeamNameChange(index, e.target.value)}
                                            placeholder="Team name"
                                        />
                                    </div>
                                </div>
                            ))}
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
                    <Button type="submit" disabled={isLoading} className="ml-auto">
                        {isLoading ? "Creating..." : "Create"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
