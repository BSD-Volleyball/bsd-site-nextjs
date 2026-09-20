"use client"

import { RiAddLine, RiCloseLine } from "@remixicon/react"
import { useState } from "react"
import { toast } from "sonner"
import { UserCombobox } from "@/components/user-combobox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { StatusBanner } from "@/components/ui/status-banner"
import type { RecipientGroupType } from "@/lib/email-recipients"
import type { SurveyEditorOptionsPayload, AudiencePreview } from "./actions"
import {
    SURVEY_GROUP_TYPES,
    type SurveyAudienceDefinition,
    type SurveyAudienceGroup
} from "@/lib/surveys/types"
import { previewSurveyAudience, updateSurveyAudience } from "./actions"

interface AudienceBuilderProps {
    surveyId: number
    audience: SurveyAudienceDefinition
    options: SurveyEditorOptionsPayload
    editable: boolean
    onSaved: () => void
}

const OFFERED_TYPES = SURVEY_GROUP_TYPES.filter(
    (spec) => spec.needs !== "event"
)
const SIMPLE_TYPES = OFFERED_TYPES.filter(
    (spec) => spec.needs === "none" || spec.needs === "season"
)
const DIVISION_SPEC = OFFERED_TYPES.find((spec) => spec.needs === "division")
const TEAM_SPEC = OFFERED_TYPES.find((spec) => spec.needs === "team")

function nameOf(names: { id: number; name: string }[], id: number | undefined) {
    return names.find((n) => n.id === id)?.name
}

/** Audience builder: pick simple groups, add scoped division/team rows, and add/exclude individuals. */
export function AudienceBuilder({
    surveyId,
    audience,
    options,
    editable,
    onSaved
}: AudienceBuilderProps) {
    const [groups, setGroups] = useState<SurveyAudienceGroup[]>(audience.groups)
    const [addUserIds, setAddUserIds] = useState<string[]>(audience.addUserIds)
    const [removeUserIds, setRemoveUserIds] = useState<string[]>(
        audience.removeUserIds
    )
    const [addPick, setAddPick] = useState<string | null>(null)
    const [removePick, setRemovePick] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [previewBusy, setPreviewBusy] = useState(false)
    const [preview, setPreview] = useState<AudiencePreview | null>(null)

    const simpleSelected = new Set(
        groups
            .filter((g) => SIMPLE_TYPES.some((s) => s.type === g.type))
            .map((g) => g.type)
    )
    function toggleSimple(type: RecipientGroupType, checked: boolean) {
        setGroups((prev) => {
            if (checked) return [...prev, { type }]
            return prev.filter((g) => g.type !== type)
        })
    }

    function addScopedRow(type: RecipientGroupType) {
        setGroups((prev) => [...prev, { type }])
    }

    function updateScopedRow(
        index: number,
        field: "divisionId" | "teamId",
        value: number
    ) {
        setGroups((prev) =>
            prev.map((g, i) => {
                if (i !== index) return g
                return { ...g, [field]: value }
            })
        )
    }

    function removeGroupAt(index: number) {
        setGroups((prev) => prev.filter((_, i) => i !== index))
    }

    function addPerson() {
        if (!addPick) return
        if (!addUserIds.includes(addPick)) {
            setAddUserIds((prev) => [...prev, addPick])
        }
        setRemoveUserIds((prev) => prev.filter((id) => id !== addPick))
        setAddPick(null)
    }

    function excludePerson() {
        if (!removePick) return
        if (!removeUserIds.includes(removePick)) {
            setRemoveUserIds((prev) => [...prev, removePick])
        }
        setAddUserIds((prev) => prev.filter((id) => id !== removePick))
        setRemovePick(null)
    }

    async function handleSave() {
        setBusy(true)
        const result = await updateSurveyAudience(surveyId, {
            groups,
            addUserIds,
            removeUserIds
        })
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Audience saved.")
            onSaved()
        } else {
            toast.error(result.message)
        }
    }

    async function handlePreview() {
        setPreviewBusy(true)
        const result = await previewSurveyAudience(surveyId)
        setPreviewBusy(false)
        if (result.status) {
            setPreview(result.data)
        } else {
            toast.error(result.message)
        }
    }

    return (
        <div className="space-y-4">
            {!editable && (
                <StatusBanner variant="info">
                    The audience is locked once the survey is published.
                </StatusBanner>
            )}

            <div className="space-y-2">
                {SIMPLE_TYPES.map((spec) => (
                    <label
                        key={spec.type}
                        className="flex items-center gap-2 text-sm"
                    >
                        <Checkbox
                            checked={simpleSelected.has(spec.type)}
                            disabled={!editable}
                            onCheckedChange={(checked) =>
                                toggleSimple(spec.type, checked === true)
                            }
                        />
                        {spec.label}
                    </label>
                ))}
            </div>

            {DIVISION_SPEC && (
                <div className="space-y-2">
                    <p className="font-medium text-sm">Divisions</p>
                    {groups.map((group, index) =>
                        group.type === DIVISION_SPEC.type ? (
                            <div
                                key={`division-${index}`}
                                className="flex items-center gap-2"
                            >
                                <Select
                                    value={
                                        group.divisionId
                                            ? String(group.divisionId)
                                            : ""
                                    }
                                    disabled={!editable}
                                    onValueChange={(value) =>
                                        updateScopedRow(
                                            index,
                                            "divisionId",
                                            Number(value)
                                        )
                                    }
                                >
                                    <SelectTrigger
                                        className="w-64"
                                        aria-label="Division"
                                    >
                                        <SelectValue placeholder="Choose a division">
                                            {nameOf(
                                                options.divisions,
                                                group.divisionId
                                            )}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {options.divisions.map((division) => (
                                            <SelectItem
                                                key={division.id}
                                                value={String(division.id)}
                                            >
                                                {division.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {editable && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeGroupAt(index)}
                                    >
                                        <RiCloseLine className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        ) : null
                    )}
                    {editable && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addScopedRow(DIVISION_SPEC.type)}
                        >
                            <RiAddLine className="mr-1 h-4 w-4" />
                            Add division
                        </Button>
                    )}
                </div>
            )}

            {TEAM_SPEC && (
                <div className="space-y-2">
                    <p className="font-medium text-sm">Teams</p>
                    {groups.map((group, index) =>
                        group.type === TEAM_SPEC.type ? (
                            <div
                                key={`team-${index}`}
                                className="flex items-center gap-2"
                            >
                                <Select
                                    value={
                                        group.teamId ? String(group.teamId) : ""
                                    }
                                    disabled={!editable}
                                    onValueChange={(value) =>
                                        updateScopedRow(
                                            index,
                                            "teamId",
                                            Number(value)
                                        )
                                    }
                                >
                                    <SelectTrigger
                                        className="w-64"
                                        aria-label="Team"
                                    >
                                        <SelectValue placeholder="Choose a team">
                                            {nameOf(
                                                options.teams,
                                                group.teamId
                                            )}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {options.teams.map((team) => (
                                            <SelectItem
                                                key={team.id}
                                                value={String(team.id)}
                                            >
                                                {team.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {editable && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeGroupAt(index)}
                                    >
                                        <RiCloseLine className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        ) : null
                    )}
                    {editable && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addScopedRow(TEAM_SPEC.type)}
                        >
                            <RiAddLine className="mr-1 h-4 w-4" />
                            Add team
                        </Button>
                    )}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <p className="font-medium text-sm">Add person</p>
                    {editable && (
                        <div className="flex items-center gap-2">
                            <UserCombobox
                                users={options.users}
                                value={addPick}
                                onChange={setAddPick}
                                placeholder="Find a person to add..."
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addPerson}
                            >
                                Add
                            </Button>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {addUserIds.map((id) => (
                            <Badge key={id} variant="outline" className="gap-1">
                                {options.users.find((u) => u.id === id)?.name ??
                                    id}
                                {editable && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setAddUserIds((prev) =>
                                                prev.filter((x) => x !== id)
                                            )
                                        }
                                    >
                                        <RiCloseLine className="h-3 w-3" />
                                    </button>
                                )}
                            </Badge>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="font-medium text-sm">Exclude person</p>
                    {editable && (
                        <div className="flex items-center gap-2">
                            <UserCombobox
                                users={options.users}
                                value={removePick}
                                onChange={setRemovePick}
                                placeholder="Find a person to exclude..."
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={excludePerson}
                            >
                                Exclude
                            </Button>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {removeUserIds.map((id) => (
                            <Badge key={id} variant="outline" className="gap-1">
                                {options.users.find((u) => u.id === id)?.name ??
                                    id}
                                {editable && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setRemoveUserIds((prev) =>
                                                prev.filter((x) => x !== id)
                                            )
                                        }
                                    >
                                        <RiCloseLine className="h-3 w-3" />
                                    </button>
                                )}
                            </Badge>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {editable && (
                    <Button type="button" disabled={busy} onClick={handleSave}>
                        Save audience
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    disabled={previewBusy}
                    onClick={handlePreview}
                >
                    Preview audience
                </Button>
            </div>

            {preview && (
                <div className="space-y-2 rounded-md border p-4">
                    <p className="font-medium">
                        {preview.total} recipient
                        {preview.total === 1 ? "" : "s"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {preview.groupCounts.map((entry, index) => (
                            <Badge key={index} variant="outline">
                                {entry.label}: {entry.count}
                            </Badge>
                        ))}
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-sm border bg-muted/30 p-2 text-sm">
                        {preview.names.length === 0 ? (
                            <p className="text-muted-foreground">
                                No one matches yet.
                            </p>
                        ) : (
                            <ul className="space-y-0.5">
                                {preview.names.map((name, index) => (
                                    <li key={index}>{name}</li>
                                ))}
                            </ul>
                        )}
                        {preview.total > preview.names.length && (
                            <p className="mt-1 text-muted-foreground">
                                and {preview.total - preview.names.length} more…
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
