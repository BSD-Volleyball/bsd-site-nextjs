"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"

interface User {
    id: string
    name: string
}

interface UserComboboxProps {
    users: User[]
    value: string | null
    onChange: (userId: string | null) => void
    placeholder?: string
}

export function UserCombobox({
    users,
    value,
    onChange,
    placeholder = "Select a player..."
}: UserComboboxProps) {
    return (
        <Combobox
            items={users}
            value={value}
            onChange={onChange}
            getKey={(u) => u.id}
            getLabel={(u) => u.name}
            placeholder={placeholder}
            searchPlaceholder="Search players..."
            emptyText="No players found"
        />
    )
}

interface EmailUser {
    id: string
    name: string
    email: string
    phone?: string | null
}

interface UserEmailComboboxProps {
    users: EmailUser[]
    value: string | null
    onChange: (userId: string) => void
    placeholder?: string
    disabled?: boolean
}

/**
 * Player picker that shows the email alongside the name.
 *
 * `UserCombobox` above labels by name only, which is fine when the list is a
 * season's signups. This one exists for pickers that span the whole ~2,000
 * account membership, where several people share a name and the email is the
 * only thing that tells them apart.
 */
const MAX_RENDERED = 100

export function UserEmailCombobox({
    users,
    value,
    onChange,
    placeholder = "Select a player...",
    disabled = false
}: UserEmailComboboxProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    const selectedUser = users.find((u) => u.id === value)

    const q = search.toLowerCase()
    const matches = q
        ? users.filter(
              (u) =>
                  u.name.toLowerCase().includes(q) ||
                  u.email.toLowerCase().includes(q) ||
                  (u.phone?.toLowerCase().includes(q) ?? false)
          )
        : users
    // The full membership is too long to render in a popover, so only the
    // first slice is mounted -- with a visible note, because a list that
    // silently stops at 100 reads as "that person is not in the system".
    const shown = matches.slice(0, MAX_RENDERED)
    const hidden = matches.length - shown.length

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
                    disabled={disabled}
                    className="w-full justify-start font-normal"
                >
                    {selectedUser ? (
                        <span className="truncate">
                            {selectedUser.name} ({selectedUser.email})
                            {selectedUser.phone && ` - ${selectedUser.phone}`}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">
                            {placeholder}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
            >
                <div className="border-b p-2">
                    <Input
                        ref={inputRef}
                        placeholder="Search by name, email or phone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8"
                    />
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                    {shown.length === 0 ? (
                        <p className="p-2 text-center text-muted-foreground text-sm">
                            No users found.
                        </p>
                    ) : (
                        shown.map((user) => (
                            <button
                                key={user.id}
                                type="button"
                                className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${
                                    value === user.id ? "bg-accent" : ""
                                }`}
                                onClick={() => {
                                    onChange(user.id)
                                    setOpen(false)
                                    setSearch("")
                                }}
                            >
                                <span className="font-medium">{user.name}</span>
                                <span className="text-muted-foreground text-xs">
                                    {user.email}
                                    {user.phone ? ` · ${user.phone}` : ""}
                                </span>
                            </button>
                        ))
                    )}
                </div>
                {hidden > 0 && (
                    <p className="border-t p-2 text-center text-muted-foreground text-xs">
                        {hidden} more match — keep typing to narrow it down.
                    </p>
                )}
            </PopoverContent>
        </Popover>
    )
}
