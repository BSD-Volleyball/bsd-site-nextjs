"use client"

import { useState, useTransition } from "react"
import {
    RiAddLine,
    RiDeleteBinLine,
    RiSearchLine,
    RiUserLine
} from "@remixicon/react"
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
import { Badge } from "@/components/ui/badge"
import type {
    UserRoleAssignment,
    SeasonOption,
    DivisionOption,
    UserSearchResult
} from "./actions"
import {
    searchUsers,
    getUserRoleAssignments,
    addUserRole,
    removeUserRole
} from "./actions"
import type { Role } from "@/lib/permissions"

const ALL_ROLES: { value: Role; label: string; seasonal: boolean }[] = [
    { value: "admin", label: "Admin", seasonal: false },
    { value: "commissioner", label: "Commissioner", seasonal: true },
    { value: "captain", label: "Captain", seasonal: true },
    { value: "court_manager", label: "Court Manager", seasonal: true },
    { value: "ombudsman", label: "Ombudsman", seasonal: true },
    { value: "referee", label: "Referee", seasonal: true },
    {
        value: "referee_coordinator",
        label: "Referee Coordinator",
        seasonal: true
    }
]

const ROLE_BADGE_COLORS: Record<string, string> = {
    admin: "bg-red-100 text-red-800",
    commissioner: "bg-blue-100 text-blue-800",
    captain: "bg-green-100 text-green-800",
    court_manager: "bg-purple-100 text-purple-800",
    ombudsman: "bg-yellow-100 text-yellow-800",
    referee: "bg-orange-100 text-orange-800",
    referee_coordinator: "bg-teal-100 text-teal-800"
}

interface ManageRolesClientProps {
    seasons: SeasonOption[]
    divisions: DivisionOption[]
}

export function ManageRolesClient({
    seasons,
    divisions
}: ManageRolesClientProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
    const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(
        null
    )
    const [assignments, setAssignments] = useState<UserRoleAssignment[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [statusMessage, setStatusMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    // Add role form state
    const [newRole, setNewRole] = useState<Role | "">("")
    const [newSeasonId, setNewSeasonId] = useState<string>("")
    const [newDivisionId, setNewDivisionId] = useState<string>("")
    const [divisionMode, setDivisionMode] = useState<
        "specific" | "league-wide"
    >("league-wide")

    const [isPending, startTransition] = useTransition()

    const selectedRoleDef = ALL_ROLES.find((r) => r.value === newRole)

    async function handleSearch(query: string) {
        setSearchQuery(query)
        if (query.length < 2) {
            setSearchResults([])
            return
        }
        setIsSearching(true)
        try {
            const results = await searchUsers(query)
            setSearchResults(results)
        } finally {
            setIsSearching(false)
        }
    }

    async function handleSelectUser(user: UserSearchResult) {
        setSelectedUser(user)
        setSearchResults([])
        setSearchQuery("")
        setStatusMessage(null)
        const roles = await getUserRoleAssignments(user.id)
        setAssignments(roles)
    }

    function handleAddRole() {
        if (!selectedUser || !newRole) return

        startTransition(async () => {
            setStatusMessage(null)
            const result = await addUserRole({
                userId: selectedUser.id,
                role: newRole as Role,
                seasonId: newSeasonId ? Number(newSeasonId) : undefined,
                divisionId:
                    divisionMode === "specific" && newDivisionId
                        ? Number(newDivisionId)
                        : undefined
            })
            if (result.status) {
                setStatusMessage({ type: "success", text: result.message })
                setNewRole("")
                setNewSeasonId("")
                setNewDivisionId("")
                setDivisionMode("league-wide")
                const updated = await getUserRoleAssignments(selectedUser.id)
                setAssignments(updated)
            } else {
                setStatusMessage({ type: "error", text: result.message })
            }
        })
    }

    function handleRemoveRole(assignment: UserRoleAssignment) {
        if (!selectedUser) return

        startTransition(async () => {
            setStatusMessage(null)
            const result = await removeUserRole({
                userId: selectedUser.id,
                roleRowId: assignment.id,
                role: assignment.role as Role,
                seasonId: assignment.season_id ?? undefined,
                divisionId: assignment.division_id ?? undefined
            })
            if (result.status) {
                setStatusMessage({ type: "success", text: result.message })
                const updated = await getUserRoleAssignments(selectedUser.id)
                setAssignments(updated)
            } else {
                setStatusMessage({ type: "error", text: result.message })
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* User search */}
            <div className="space-y-2">
                <Label>Search for a user</Label>
                <div className="relative">
                    <RiSearchLine className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        placeholder="Name or email..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                    />
                </div>
                {searchResults.length > 0 && (
                    <div className="rounded-md border bg-background shadow-md">
                        {searchResults.map((user) => (
                            <button
                                key={user.id}
                                type="button"
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted"
                                onClick={() => handleSelectUser(user)}
                            >
                                <span className="font-medium">
                                    {user.first_name} {user.last_name}
                                </span>{" "}
                                <span className="text-muted-foreground">
                                    {user.email}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {isSearching && (
                    <p className="text-muted-foreground text-sm">
                        Searching...
                    </p>
                )}
            </div>

            {/* Selected user + role management */}
            {selectedUser && (
                <div className="space-y-5 rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                        <RiUserLine className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <p className="font-semibold">
                                {selectedUser.first_name}{" "}
                                {selectedUser.last_name}
                            </p>
                            <p className="text-muted-foreground text-sm">
                                {selectedUser.email}
                            </p>
                        </div>
                    </div>

                    {/* Status message */}
                    {statusMessage && (
                        <p
                            className={`text-sm ${statusMessage.type === "success" ? "text-green-600" : "text-red-600"}`}
                        >
                            {statusMessage.text}
                        </p>
                    )}

                    {/* Current roles */}
                    <div className="space-y-2">
                        <Label className="text-base">Current Roles</Label>
                        {assignments.length === 0 ? (
                            <p className="text-muted-foreground text-sm">
                                No roles assigned.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {assignments.map((a) => (
                                    <div
                                        key={a.id}
                                        className="flex items-center justify-between rounded-md border px-3 py-2"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`rounded-full px-2 py-0.5 font-medium text-xs ${ROLE_BADGE_COLORS[a.role] ?? "bg-gray-100 text-gray-800"}`}
                                            >
                                                {a.role.replace(/_/g, " ")}
                                            </span>
                                            {a.season_label && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-xs"
                                                >
                                                    {a.season_label}
                                                </Badge>
                                            )}
                                            {a.division_label ? (
                                                <Badge
                                                    variant="outline"
                                                    className="text-xs"
                                                >
                                                    {a.division_label}
                                                </Badge>
                                            ) : a.season_id !== null ? (
                                                <Badge
                                                    variant="outline"
                                                    className="text-muted-foreground text-xs"
                                                >
                                                    league-wide
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                            disabled={isPending}
                                            onClick={() => handleRemoveRole(a)}
                                        >
                                            <RiDeleteBinLine className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Add role form */}
                    <div className="space-y-3 border-t pt-4">
                        <Label className="text-base">Add Role</Label>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label className="text-muted-foreground text-xs">
                                    Role
                                </Label>
                                <Select
                                    value={newRole}
                                    onValueChange={(v) => {
                                        setNewRole(v as Role)
                                        setNewSeasonId("")
                                        setNewDivisionId("")
                                        setDivisionMode("league-wide")
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ALL_ROLES.map((r) => (
                                            <SelectItem
                                                key={r.value}
                                                value={r.value}
                                            >
                                                {r.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedRoleDef?.seasonal && (
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground text-xs">
                                        Season
                                    </Label>
                                    <Select
                                        value={newSeasonId}
                                        onValueChange={setNewSeasonId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select season..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {seasons.map((s) => (
                                                <SelectItem
                                                    key={s.id}
                                                    value={String(s.id)}
                                                >
                                                    {s.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {selectedRoleDef?.seasonal && (
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground text-xs">
                                        Division scope
                                    </Label>
                                    <Select
                                        value={divisionMode}
                                        onValueChange={(v) => {
                                            setDivisionMode(
                                                v as "specific" | "league-wide"
                                            )
                                            setNewDivisionId("")
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="league-wide">
                                                League-wide
                                            </SelectItem>
                                            <SelectItem value="specific">
                                                Specific division
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {selectedRoleDef?.seasonal &&
                                divisionMode === "specific" && (
                                    <div className="space-y-1">
                                        <Label className="text-muted-foreground text-xs">
                                            Division
                                        </Label>
                                        <Select
                                            value={newDivisionId}
                                            onValueChange={setNewDivisionId}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select division..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {divisions.map((d) => (
                                                    <SelectItem
                                                        key={d.id}
                                                        value={String(d.id)}
                                                    >
                                                        {d.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                        </div>

                        <Button
                            onClick={handleAddRole}
                            disabled={
                                isPending ||
                                !newRole ||
                                (selectedRoleDef?.seasonal && !newSeasonId) ||
                                (divisionMode === "specific" && !newDivisionId)
                            }
                            size="sm"
                        >
                            <RiAddLine className="mr-1 h-4 w-4" />
                            Grant Role
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
