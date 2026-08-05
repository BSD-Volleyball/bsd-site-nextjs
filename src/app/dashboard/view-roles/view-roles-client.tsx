"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { AdminPlayerDetailPopup } from "@/components/player-detail/admin-player-detail-popup"
import { usePlayerDetailModal } from "@/components/player-detail/use-player-detail-modal"
import { ROLE_BADGE_COLORS, ROLE_OPTIONS } from "@/lib/role-display"
import type { RoleHolder } from "./actions"
import { getUsersWithRole } from "./actions"

interface ViewRolesClientProps {
    playerPicUrl: string
}

export function ViewRolesClient({ playerPicUrl }: ViewRolesClientProps) {
    const [selectedRole, setSelectedRole] = useState("")
    const [holders, setHolders] = useState<RoleHolder[]>([])
    const [isPending, startTransition] = useTransition()

    const {
        selectedUserId,
        playerDetails,
        draftHistory,
        signupHistory,
        ratingAverages,
        sharedRatingNotes,
        privateRatingNotes,
        viewerRating,
        pairPickName,
        pairReason,
        isLoading: playerLoading,
        openPlayerDetail,
        closePlayerDetail
    } = usePlayerDetailModal()

    function handleRoleChange(role: string) {
        setSelectedRole(role)
        startTransition(async () => {
            setHolders(await getUsersWithRole(role))
        })
    }

    return (
        <div className="space-y-6">
            <div className="w-64">
                <label
                    htmlFor="role-select"
                    className="mb-1 block font-medium text-muted-foreground text-sm"
                >
                    Role
                </label>
                <Select value={selectedRole} onValueChange={handleRoleChange}>
                    <SelectTrigger id="role-select">
                        <SelectValue placeholder="Select a role…" />
                    </SelectTrigger>
                    <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                                {r.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {isPending && (
                <p className="text-muted-foreground">Loading role holders…</p>
            )}

            {!isPending && selectedRole && holders.length === 0 && (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No users hold this role.
                </div>
            )}

            {!isPending && holders.length > 0 && (
                <div className="space-y-2">
                    <p className="text-muted-foreground text-sm">
                        {holders.length}{" "}
                        {holders.length === 1 ? "assignment" : "assignments"}
                    </p>
                    {holders.map((h) => (
                        <div
                            key={h.assignment_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    className="cursor-pointer font-medium text-sm hover:underline"
                                    onClick={() => openPlayerDetail(h.user_id)}
                                >
                                    {h.name}
                                </button>
                                <span
                                    className={`rounded-full px-2 py-0.5 font-medium text-xs ${ROLE_BADGE_COLORS[selectedRole] ?? "bg-gray-100 text-gray-800"}`}
                                >
                                    {selectedRole.replace(/_/g, " ")}
                                </span>
                                {h.season_label && (
                                    <Badge
                                        variant="outline"
                                        className="text-xs"
                                    >
                                        {h.season_label}
                                    </Badge>
                                )}
                                {h.division_label ? (
                                    <Badge
                                        variant="outline"
                                        className="text-xs"
                                    >
                                        {h.division_label}
                                    </Badge>
                                ) : h.season_id !== null ? (
                                    <Badge
                                        variant="outline"
                                        className="text-muted-foreground text-xs"
                                    >
                                        league-wide
                                    </Badge>
                                ) : null}
                            </div>
                            <span className="text-muted-foreground text-xs">
                                granted{" "}
                                {new Date(h.granted_at).toLocaleDateString(
                                    "en-US"
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <AdminPlayerDetailPopup
                open={!!selectedUserId}
                onClose={closePlayerDetail}
                playerDetails={playerDetails}
                draftHistory={draftHistory}
                signupHistory={signupHistory}
                playerPicUrl={playerPicUrl}
                isLoading={playerLoading}
                pairPickName={pairPickName}
                pairReason={pairReason}
                ratingAverages={ratingAverages}
                sharedRatingNotes={sharedRatingNotes}
                privateRatingNotes={privateRatingNotes}
                viewerRating={viewerRating}
            />
        </div>
    )
}
