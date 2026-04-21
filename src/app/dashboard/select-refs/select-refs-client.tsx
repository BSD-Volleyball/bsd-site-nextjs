"use client"

import { useState, useTransition, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
    RiSearchLine,
    RiDeleteBinLine,
    RiAddLine,
    RiUserLine,
    RiToggleLine,
    RiToggleFill
} from "@remixicon/react"
import { toast } from "sonner"
import { formatPlayerName } from "@/lib/utils"
import type {
    SelectRefsData,
    SeasonRefRow,
    UserSearchResultRef
} from "./actions"
import {
    searchUsersForRef,
    addSeasonRef,
    removeSeasonRef,
    updateSeasonRef,
    getSelectRefsData
} from "./actions"

interface SelectRefsClientProps {
    initialData: SelectRefsData
}

export function SelectRefsClient({ initialData }: SelectRefsClientProps) {
    const [data, setData] = useState<SelectRefsData>(initialData)
    const [searchQuery, setSearchQuery] = useState("")
    const [searchResults, setSearchResults] = useState<UserSearchResultRef[]>(
        []
    )
    const [isSearching, setIsSearching] = useState(false)
    const [isPending, startTransition] = useTransition()

    const refreshData = useCallback(async () => {
        const updated = await getSelectRefsData()
        setData(updated)
    }, [])

    async function handleSearch(query: string) {
        setSearchQuery(query)
        if (query.length < 2) {
            setSearchResults([])
            return
        }
        setIsSearching(true)
        try {
            const result = await searchUsersForRef(query)
            if (result.status) {
                setSearchResults(result.data)
            }
        } finally {
            setIsSearching(false)
        }
    }

    function handleAddRef(user: UserSearchResultRef) {
        setSearchResults([])
        setSearchQuery("")

        startTransition(async () => {
            const result = await addSeasonRef(user.id)
            if (result.status) {
                toast.success(
                    `Added ${formatPlayerName(user.firstName, user.lastName, user.preferredName)} as a ref`
                )
                await refreshData()
            } else {
                toast.error(result.message)
            }
        })
    }

    function handleRemoveRef(ref: SeasonRefRow) {
        startTransition(async () => {
            const result = await removeSeasonRef(ref.seasonRefId)
            if (result.status) {
                toast.success(
                    `Removed ${formatPlayerName(ref.firstName, ref.lastName, ref.preferredName)}`
                )
                await refreshData()
            } else {
                toast.error(result.message)
            }
        })
    }

    function handleToggleActive(ref: SeasonRefRow) {
        startTransition(async () => {
            const result = await updateSeasonRef(
                ref.seasonRefId,
                ref.isCertified,
                ref.hasW9,
                ref.passedTest,
                !ref.isActive,
                ref.maxDivisionLevel
            )
            if (result.status) {
                const action = ref.isActive ? "Deactivated" : "Activated"
                toast.success(
                    `${action} ${formatPlayerName(ref.firstName, ref.lastName, ref.preferredName)}`
                )
                await refreshData()
            } else {
                toast.error(result.message)
            }
        })
    }

    function handleToggleCertified(ref: SeasonRefRow, checked: boolean) {
        startTransition(async () => {
            const result = await updateSeasonRef(
                ref.seasonRefId,
                checked,
                ref.hasW9,
                ref.passedTest,
                ref.isActive,
                ref.maxDivisionLevel
            )
            if (result.status) {
                toast.success(
                    `Updated certification for ${formatPlayerName(ref.firstName, ref.lastName, ref.preferredName)}`
                )
                await refreshData()
            } else {
                toast.error(result.message)
            }
        })
    }

    function handleToggleW9(ref: SeasonRefRow, checked: boolean) {
        startTransition(async () => {
            const result = await updateSeasonRef(
                ref.seasonRefId,
                ref.isCertified,
                checked,
                ref.passedTest,
                ref.isActive,
                ref.maxDivisionLevel
            )
            if (result.status) {
                toast.success(
                    `Updated W9 status for ${formatPlayerName(ref.firstName, ref.lastName, ref.preferredName)}`
                )
                await refreshData()
            } else {
                toast.error(result.message)
            }
        })
    }

    function handleTogglePassedTest(ref: SeasonRefRow, checked: boolean) {
        startTransition(async () => {
            const result = await updateSeasonRef(
                ref.seasonRefId,
                ref.isCertified,
                ref.hasW9,
                checked,
                ref.isActive,
                ref.maxDivisionLevel
            )
            if (result.status) {
                toast.success(
                    `Updated test status for ${formatPlayerName(ref.firstName, ref.lastName, ref.preferredName)}`
                )
                await refreshData()
            } else {
                toast.error(result.message)
            }
        })
    }

    function handleChangeDivisionLevel(ref: SeasonRefRow, level: string) {
        startTransition(async () => {
            const result = await updateSeasonRef(
                ref.seasonRefId,
                ref.isCertified,
                ref.hasW9,
                ref.passedTest,
                ref.isActive,
                Number(level)
            )
            if (result.status) {
                toast.success(
                    `Updated max division for ${formatPlayerName(ref.firstName, ref.lastName, ref.preferredName)}`
                )
                await refreshData()
            } else {
                toast.error(result.message)
            }
        })
    }

    const existingUserIds = new Set(data.refs.map((r) => r.userId))
    const filteredResults = searchResults.filter(
        (u) => !existingUserIds.has(u.id)
    )

    const activeRefs = data.refs.filter((r) => r.isActive)
    const inactiveRefs = data.refs.filter((r) => !r.isActive)

    return (
        <div className="space-y-6">
            {/* Season info */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Current Season
                        <Badge variant="outline">{data.seasonLabel}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">
                        {activeRefs.length} active ref
                        {activeRefs.length !== 1 ? "s" : ""} assigned for this
                        season
                        {inactiveRefs.length > 0
                            ? `, ${inactiveRefs.length} inactive`
                            : ""}
                        .
                    </p>
                </CardContent>
            </Card>

            {/* Add ref search */}
            <div className="space-y-2">
                <Label>Add a referee</Label>
                <div className="relative">
                    <RiSearchLine className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                    />
                </div>
                {filteredResults.length > 0 && (
                    <div className="rounded-md border bg-background shadow-md">
                        {filteredResults.map((user) => (
                            <button
                                key={user.id}
                                type="button"
                                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-muted"
                                onClick={() => handleAddRef(user)}
                                disabled={isPending}
                            >
                                <span>
                                    <span className="font-medium">
                                        {formatPlayerName(
                                            user.firstName,
                                            user.lastName,
                                            user.preferredName
                                        )}
                                    </span>{" "}
                                    <span className="text-muted-foreground">
                                        {user.email}
                                    </span>
                                </span>
                                <RiAddLine className="h-4 w-4 text-muted-foreground" />
                            </button>
                        ))}
                    </div>
                )}
                {isSearching && (
                    <p className="text-muted-foreground text-sm">
                        Searching...
                    </p>
                )}
                {searchQuery.length >= 2 &&
                    !isSearching &&
                    filteredResults.length === 0 &&
                    searchResults.length === 0 && (
                        <p className="text-muted-foreground text-sm">
                            No users found.
                        </p>
                    )}
            </div>

            {/* Active refs table */}
            {data.refs.length === 0 ? (
                <div className="rounded-lg border p-8 text-center">
                    <RiUserLine className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                        No refs assigned for this season yet.
                    </p>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        <h2 className="font-semibold text-base">
                            Active Refs
                            <span className="ml-2 font-normal text-muted-foreground text-sm">
                                ({activeRefs.length})
                            </span>
                        </h2>
                        {activeRefs.length === 0 ? (
                            <div className="rounded-lg border p-6 text-center text-muted-foreground text-sm">
                                No active refs.
                            </div>
                        ) : (
                            <RefsTable
                                refs={activeRefs}
                                divisions={data.divisions}
                                isPending={isPending}
                                onToggleActive={handleToggleActive}
                                onToggleCertified={handleToggleCertified}
                                onToggleW9={handleToggleW9}
                                onTogglePassedTest={handleTogglePassedTest}
                                onChangeDivisionLevel={
                                    handleChangeDivisionLevel
                                }
                                onRemove={handleRemoveRef}
                            />
                        )}
                    </div>

                    {inactiveRefs.length > 0 && (
                        <div className="space-y-2">
                            <h2 className="font-semibold text-base text-muted-foreground">
                                Inactive Refs
                                <span className="ml-2 font-normal text-sm">
                                    ({inactiveRefs.length})
                                </span>
                            </h2>
                            <RefsTable
                                refs={inactiveRefs}
                                divisions={data.divisions}
                                isPending={isPending}
                                onToggleActive={handleToggleActive}
                                onToggleCertified={handleToggleCertified}
                                onToggleW9={handleToggleW9}
                                onTogglePassedTest={handleTogglePassedTest}
                                onChangeDivisionLevel={
                                    handleChangeDivisionLevel
                                }
                                onRemove={handleRemoveRef}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Shared table sub-component
// ---------------------------------------------------------------------------

interface RefsTableProps {
    refs: SeasonRefRow[]
    divisions: SelectRefsData["divisions"]
    isPending: boolean
    onToggleActive: (ref: SeasonRefRow) => void
    onToggleCertified: (ref: SeasonRefRow, checked: boolean) => void
    onToggleW9: (ref: SeasonRefRow, checked: boolean) => void
    onTogglePassedTest: (ref: SeasonRefRow, checked: boolean) => void
    onChangeDivisionLevel: (ref: SeasonRefRow, level: string) => void
    onRemove: (ref: SeasonRefRow) => void
}

function RefsTable({
    refs,
    divisions,
    isPending,
    onToggleActive,
    onToggleCertified,
    onToggleW9,
    onTogglePassedTest,
    onChangeDivisionLevel,
    onRemove
}: RefsTableProps) {
    return (
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium">
                            Name
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                            Email
                        </th>
                        <th className="px-4 py-3 text-center font-medium">
                            Certified
                        </th>
                        <th className="px-4 py-3 text-center font-medium">
                            W9
                        </th>
                        <th className="px-4 py-3 text-center font-medium">
                            Passed Test
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                            Max Division
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {refs.map((ref) => (
                        <tr
                            key={ref.seasonRefId}
                            className="border-b last:border-b-0"
                        >
                            <td className="px-4 py-3 font-medium">
                                {formatPlayerName(
                                    ref.firstName,
                                    ref.lastName,
                                    ref.preferredName
                                )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                                {ref.email}
                            </td>
                            <td className="px-4 py-3 text-center">
                                <Switch
                                    checked={ref.isCertified}
                                    onCheckedChange={(checked) =>
                                        onToggleCertified(ref, checked)
                                    }
                                    disabled={isPending}
                                />
                            </td>
                            <td className="px-4 py-3 text-center">
                                <Switch
                                    checked={ref.hasW9}
                                    onCheckedChange={(checked) =>
                                        onToggleW9(ref, checked)
                                    }
                                    disabled={isPending}
                                />
                            </td>
                            <td className="px-4 py-3 text-center">
                                <Switch
                                    checked={ref.passedTest}
                                    onCheckedChange={(checked) =>
                                        onTogglePassedTest(ref, checked)
                                    }
                                    disabled={isPending}
                                />
                            </td>
                            <td className="px-4 py-3">
                                <Select
                                    value={String(ref.maxDivisionLevel)}
                                    onValueChange={(value) =>
                                        onChangeDivisionLevel(ref, value)
                                    }
                                    disabled={isPending}
                                >
                                    <SelectTrigger className="w-40">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">None</SelectItem>
                                        {divisions.map((div) => (
                                            <SelectItem
                                                key={div.id}
                                                value={String(div.level)}
                                            >
                                                {div.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={isPending}
                                        title={
                                            ref.isActive
                                                ? "Deactivate ref"
                                                : "Activate ref"
                                        }
                                        onClick={() => onToggleActive(ref)}
                                    >
                                        {ref.isActive ? (
                                            <RiToggleFill className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <RiToggleLine className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        disabled={isPending}
                                        onClick={() => onRemove(ref)}
                                    >
                                        <RiDeleteBinLine className="h-4 w-4" />
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
