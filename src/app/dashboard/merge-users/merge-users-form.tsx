"use client"

import { useState, useRef, useEffect } from "react"
import type { UserOption } from "./actions"
import { mergeUsers } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"

function UserCombobox({
    users,
    value,
    onChange,
    placeholder
}: {
    users: UserOption[]
    value: string
    onChange: (id: string) => void
    placeholder: string
}) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    const selectedUser = users.find((u) => u.id === value)

    const filtered = users.filter((u) => {
        const q = search.toLowerCase()
        return (
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)
        )
    })

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 0)
        }
    }, [open])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-start font-normal"
                >
                    {selectedUser ? (
                        <span className="truncate">
                            {selectedUser.name} ({selectedUser.email})
                        </span>
                    ) : (
                        <span className="text-muted-foreground">
                            {placeholder}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <div className="border-b p-2">
                    <Input
                        ref={inputRef}
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8"
                    />
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                    {filtered.length === 0 ? (
                        <p className="p-2 text-center text-muted-foreground text-sm">
                            No users found.
                        </p>
                    ) : (
                        filtered.map((user) => (
                            <button
                                key={user.id}
                                type="button"
                                className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
                                    value === user.id
                                        ? "bg-accent"
                                        : ""
                                }`}
                                onClick={() => {
                                    onChange(user.id)
                                    setOpen(false)
                                    setSearch("")
                                }}
                            >
                                <span className="font-medium">
                                    {user.name}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    {user.email}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function MergeUsersForm({
    oldUsers,
    newUsers
}: {
    oldUsers: UserOption[]
    newUsers: UserOption[]
}) {
    const [oldUserId, setOldUserId] = useState<string>("")
    const [newUserId, setNewUserId] = useState<string>("")
    const [showConfirm, setShowConfirm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [result, setResult] = useState<{
        status: boolean
        message: string
    } | null>(null)

    const oldUser = oldUsers.find((u) => u.id === oldUserId)
    const newUser = newUsers.find((u) => u.id === newUserId)

    const handleMergeClick = () => {
        if (!oldUserId || !newUserId) {
            return
        }
        setShowConfirm(true)
    }

    const handleConfirm = async () => {
        setIsSubmitting(true)
        setResult(null)

        const response = await mergeUsers(oldUserId, newUserId)
        setResult(response)
        setIsSubmitting(false)
        setShowConfirm(false)

        if (response.status) {
            setOldUserId("")
            setNewUserId("")
        }
    }

    return (
        <>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Select Users to Merge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <label className="font-medium text-sm">
                            Old User (will be deleted)
                        </label>
                        <UserCombobox
                            users={oldUsers}
                            value={oldUserId}
                            onChange={setOldUserId}
                            placeholder="Select old user..."
                        />
                        <p className="text-muted-foreground text-xs">
                            Users created before 2026-01-31 00:00:01
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="font-medium text-sm">
                            New User (will be kept)
                        </label>
                        <UserCombobox
                            users={newUsers}
                            value={newUserId}
                            onChange={setNewUserId}
                            placeholder="Select new user..."
                        />
                        <p className="text-muted-foreground text-xs">
                            Users created after 2026-01-31 00:00:02
                        </p>
                    </div>

                    <Button
                        onClick={handleMergeClick}
                        disabled={!oldUserId || !newUserId}
                    >
                        Merge Users
                    </Button>

                    {result && (
                        <div
                            className={`rounded-md p-4 ${
                                result.status
                                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                            }`}
                        >
                            {result.message}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm User Merge</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. Please confirm you
                            want to merge these users.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="rounded-md bg-red-50 p-4 dark:bg-red-950">
                            <p className="font-medium text-red-800 text-sm dark:text-red-200">
                                Old User (will be DELETED)
                            </p>
                            {oldUser && (
                                <div className="mt-2 text-red-700 text-sm dark:text-red-300">
                                    <p>Name: {oldUser.name}</p>
                                    <p>Email: {oldUser.email}</p>
                                </div>
                            )}
                        </div>

                        <div className="rounded-md bg-green-50 p-4 dark:bg-green-950">
                            <p className="font-medium text-green-800 text-sm dark:text-green-200">
                                New User (will be KEPT)
                            </p>
                            {newUser && (
                                <div className="mt-2 text-green-700 text-sm dark:text-green-300">
                                    <p>Name: {newUser.name}</p>
                                    <p>Email: {newUser.email}</p>
                                </div>
                            )}
                        </div>

                        <p className="text-muted-foreground text-sm">
                            All records from the old user will be transferred to
                            the new user, including signups, team captaincy,
                            draft picks, waitlist entries, discounts,
                            evaluations, and commissioner roles.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowConfirm(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirm}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Merging..." : "Confirm Merge"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
