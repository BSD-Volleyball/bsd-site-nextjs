"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RiEditLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SeasonPhase } from "@/lib/season-phases"
import { isTeamRenameOpen, TEAM_NAME_MAX_LENGTH } from "@/lib/team-name"
import { renameTeam } from "./roster-actions"

/**
 * The "Team name" row at the top of the Captain Info card. Captains,
 * co-captains and coaches can rename their team inline between the draft
 * and playoffs; outside that window the name is shown read-only.
 */
export function TeamNameEditor({
    teamId,
    teamName,
    phase
}: {
    teamId: number
    teamName: string
    phase: SeasonPhase | null
}) {
    const router = useRouter()
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(teamName)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const canRename = phase !== null && isTeamRenameOpen(phase)

    const startEditing = () => {
        setDraft(teamName)
        setError(null)
        setSuccess(null)
        setEditing(true)
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        const result = await renameTeam(teamId, draft)
        setSaving(false)
        if (!result.status) {
            setError(result.message)
            return
        }
        setEditing(false)
        setSuccess(result.message ?? null)
        router.refresh()
    }

    if (editing) {
        return (
            <form
                className="space-y-2"
                onSubmit={(e) => {
                    e.preventDefault()
                    void handleSave()
                }}
            >
                <label
                    htmlFor="team-name-input"
                    className="font-medium text-sm text-teal-700 dark:text-teal-300"
                >
                    Team name
                </label>
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        id="team-name-input"
                        value={draft}
                        maxLength={TEAM_NAME_MAX_LENGTH}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") setEditing(false)
                        }}
                        disabled={saving}
                        autoFocus
                        className="max-w-xs bg-white dark:bg-teal-900"
                    />
                    <Button
                        type="submit"
                        size="sm"
                        disabled={saving || !draft.trim()}
                        className="bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
                    >
                        {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(false)}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                </div>
                <p className="text-teal-700/80 text-xs dark:text-teal-300/80">
                    Your division's commissioners are notified when you rename
                    your team.
                </p>
                {error && (
                    <p className="text-red-700 text-sm dark:text-red-300">
                        {error}
                    </p>
                )}
            </form>
        )
    }

    return (
        <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-sm text-teal-700 dark:text-teal-300">
                    Team name
                </span>
                <span className="font-semibold text-teal-900 dark:text-teal-100">
                    {teamName}
                </span>
                {canRename && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={startEditing}
                        className="h-7 px-2 text-teal-700 hover:bg-teal-100 dark:text-teal-300 dark:hover:bg-teal-900"
                    >
                        <RiEditLine className="h-4 w-4" />
                        Rename
                    </Button>
                )}
            </div>
            {!canRename && phase === "playoffs" && (
                <p className="text-teal-700/80 text-xs dark:text-teal-300/80">
                    Names are locked for playoffs. Ask your commissioner if
                    yours needs to change.
                </p>
            )}
            {success && (
                <p className="text-green-700 text-sm dark:text-green-300">
                    {success}
                </p>
            )}
        </div>
    )
}
