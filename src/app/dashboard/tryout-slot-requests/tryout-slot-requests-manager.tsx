"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import {
    RiAddLine,
    RiCheckLine,
    RiCloseLine,
    RiDeleteBinLine,
    RiEditLine
} from "@remixicon/react"
import { UserCombobox } from "@/components/user-combobox"
import {
    createTryoutSlotRequest,
    deleteTryoutSlotRequest,
    updateTryoutSlotRequest,
    type TryoutSlotRequestEntry
} from "./actions"

interface TryoutSlotRequestsManagerProps {
    requests: TryoutSlotRequestEntry[]
    users: { id: string; name: string }[]
    slotLabelsByWeek: Record<number, string[]>
}

interface SlotChecks {
    canSlot1: boolean
    canSlot2: boolean
    canSlot3: boolean
}

const EMPTY_SLOTS: SlotChecks = {
    canSlot1: false,
    canSlot2: false,
    canSlot3: false
}

const SLOT_KEYS = ["canSlot1", "canSlot2", "canSlot3"] as const

function allowedSlotLabels(
    entry: Pick<TryoutSlotRequestEntry, "week" | keyof SlotChecks>,
    slotLabelsByWeek: Record<number, string[]>
) {
    const labels = slotLabelsByWeek[entry.week] ?? []
    return SLOT_KEYS.map((key, index) =>
        entry[key] ? (labels[index] ?? `Slot ${index + 1}`) : null
    ).filter((label): label is string => label !== null)
}

function SlotCheckboxes({
    week,
    slots,
    onChange,
    slotLabelsByWeek,
    idPrefix
}: {
    week: number
    slots: SlotChecks
    onChange: (next: SlotChecks) => void
    slotLabelsByWeek: Record<number, string[]>
    idPrefix: string
}) {
    const labels = slotLabelsByWeek[week] ?? []
    const slotCount = week === 1 ? 2 : 3

    return (
        <div className="flex flex-wrap gap-4">
            {SLOT_KEYS.slice(0, slotCount).map((key, index) => (
                <label
                    key={key}
                    htmlFor={`${idPrefix}-${key}`}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                >
                    <Checkbox
                        id={`${idPrefix}-${key}`}
                        checked={slots[key]}
                        onCheckedChange={(checked) =>
                            onChange({ ...slots, [key]: checked === true })
                        }
                    />
                    {labels[index] ?? `Slot ${index + 1}`}
                </label>
            ))}
        </div>
    )
}

export function TryoutSlotRequestsManager({
    requests,
    users,
    slotLabelsByWeek
}: TryoutSlotRequestsManagerProps) {
    const router = useRouter()
    const [search, setSearch] = useState("")
    const [showAddForm, setShowAddForm] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)

    // Add form state
    const [newUserId, setNewUserId] = useState<string | null>(null)
    const [newWeek, setNewWeek] = useState<number>(1)
    const [newSlots, setNewSlots] = useState<SlotChecks>(EMPTY_SLOTS)
    const [newComment, setNewComment] = useState("")

    // Edit form state
    const [editSlots, setEditSlots] = useState<SlotChecks>(EMPTY_SLOTS)
    const [editComment, setEditComment] = useState("")

    const filteredRequests = useMemo(() => {
        if (!search) return requests
        const lower = search.toLowerCase()
        return requests.filter(
            (request) =>
                request.userName.toLowerCase().includes(lower) ||
                (request.comment ?? "").toLowerCase().includes(lower)
        )
    }, [requests, search])

    const requestsByWeek = useMemo(() => {
        const map = new Map<number, TryoutSlotRequestEntry[]>()
        for (const request of filteredRequests) {
            const list = map.get(request.week) || []
            list.push(request)
            map.set(request.week, list)
        }
        return map
    }, [filteredRequests])

    const handleWeekChange = (value: string) => {
        const week = Number(value)
        setNewWeek(week)
        if (week === 1) {
            setNewSlots((prev) => ({ ...prev, canSlot3: false }))
        }
    }

    const resetAddForm = () => {
        setNewUserId(null)
        setNewWeek(1)
        setNewSlots(EMPTY_SLOTS)
        setNewComment("")
    }

    const handleCreate = async () => {
        if (!newUserId) {
            toast.error("Select a player.")
            return
        }

        setIsLoading(true)
        const result = await createTryoutSlotRequest({
            userId: newUserId,
            week: newWeek,
            ...newSlots,
            comment: newComment || null
        })

        if (result.status) {
            toast.success(result.message ?? "Request created.")
            resetAddForm()
            setShowAddForm(false)
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setIsLoading(false)
    }

    const startEdit = (request: TryoutSlotRequestEntry) => {
        setEditingId(request.id)
        setEditSlots({
            canSlot1: request.canSlot1,
            canSlot2: request.canSlot2,
            canSlot3: request.canSlot3
        })
        setEditComment(request.comment ?? "")
    }

    const handleUpdate = async (id: number) => {
        setIsLoading(true)
        const result = await updateTryoutSlotRequest({
            id,
            ...editSlots,
            comment: editComment || null
        })

        if (result.status) {
            toast.success(result.message ?? "Request updated.")
            setEditingId(null)
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setIsLoading(false)
    }

    const handleDelete = async () => {
        if (deleteTargetId === null) {
            return
        }

        setIsLoading(true)
        const result = await deleteTryoutSlotRequest(deleteTargetId)

        if (result.status) {
            toast.success(result.message ?? "Request deleted.")
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setDeleteTargetId(null)
        setIsLoading(false)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    placeholder="Search by name or comment..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="max-w-xs"
                />
                <Button
                    type="button"
                    onClick={() => setShowAddForm((prev) => !prev)}
                >
                    <RiAddLine className="mr-1 h-4 w-4" />
                    Add Request
                </Button>
            </div>

            {showAddForm && (
                <Card>
                    <CardHeader>
                        <CardTitle>New Tryout Slot Request</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>Player</Label>
                                <UserCombobox
                                    users={users}
                                    value={newUserId}
                                    onChange={setNewUserId}
                                    placeholder="Select a player..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Tryout Week</Label>
                                <Select
                                    value={String(newWeek)}
                                    onValueChange={handleWeekChange}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">
                                            Week 1
                                        </SelectItem>
                                        <SelectItem value="2">
                                            Week 2
                                        </SelectItem>
                                        <SelectItem value="3">
                                            Week 3
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Slots the player CAN attend</Label>
                            <SlotCheckboxes
                                week={newWeek}
                                slots={newSlots}
                                onChange={setNewSlots}
                                slotLabelsByWeek={slotLabelsByWeek}
                                idPrefix="new"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Comment</Label>
                            <Textarea
                                value={newComment}
                                onChange={(event) =>
                                    setNewComment(event.target.value)
                                }
                                placeholder="Why the request was made, who took it, etc."
                                rows={2}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                onClick={handleCreate}
                                disabled={isLoading}
                            >
                                {isLoading ? "Saving..." : "Save Request"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    resetAddForm()
                                    setShowAddForm(false)
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {[1, 2, 3].map((week) => {
                const weekRequests = requestsByWeek.get(week) || []

                return (
                    <Card key={`week-${week}`}>
                        <CardHeader>
                            <CardTitle>
                                Week {week} ({weekRequests.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {weekRequests.length === 0 ? (
                                <p className="text-muted-foreground text-sm">
                                    No requests for week {week}.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {weekRequests.map((request) => (
                                        <div
                                            key={request.id}
                                            className="rounded-md border p-3"
                                        >
                                            {editingId === request.id ? (
                                                <div className="space-y-3">
                                                    <p className="font-medium text-sm">
                                                        {request.userName}
                                                    </p>
                                                    <SlotCheckboxes
                                                        week={request.week}
                                                        slots={editSlots}
                                                        onChange={setEditSlots}
                                                        slotLabelsByWeek={
                                                            slotLabelsByWeek
                                                        }
                                                        idPrefix={`edit-${request.id}`}
                                                    />
                                                    <Textarea
                                                        value={editComment}
                                                        onChange={(event) =>
                                                            setEditComment(
                                                                event.target
                                                                    .value
                                                            )
                                                        }
                                                        rows={2}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            onClick={() =>
                                                                handleUpdate(
                                                                    request.id
                                                                )
                                                            }
                                                            disabled={isLoading}
                                                        >
                                                            <RiCheckLine className="mr-1 h-4 w-4" />
                                                            Save
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() =>
                                                                setEditingId(
                                                                    null
                                                                )
                                                            }
                                                        >
                                                            <RiCloseLine className="mr-1 h-4 w-4" />
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-sm">
                                                            {request.userName}
                                                        </p>
                                                        <p className="text-muted-foreground text-sm">
                                                            Can attend:{" "}
                                                            {allowedSlotLabels(
                                                                request,
                                                                slotLabelsByWeek
                                                            ).join(", ")}
                                                        </p>
                                                        {request.comment && (
                                                            <p className="text-muted-foreground text-xs italic">
                                                                {
                                                                    request.comment
                                                                }
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex shrink-0 gap-1">
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            aria-label="Edit request"
                                                            onClick={() =>
                                                                startEdit(
                                                                    request
                                                                )
                                                            }
                                                        >
                                                            <RiEditLine className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            aria-label="Delete request"
                                                            onClick={() =>
                                                                setDeleteTargetId(
                                                                    request.id
                                                                )
                                                            }
                                                        >
                                                            <RiDeleteBinLine className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )
            })}

            <AlertDialog
                open={deleteTargetId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteTargetId(null)
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete this tryout slot request?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            The player will no longer have a recorded time slot
                            preference for this week.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isLoading}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
