"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { formatPlayerLabel } from "@/lib/utils"

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

/** The player shape most admin pickers load from their actions. */
export interface PlayerOption {
    id: string
    old_id: number | null
    first_name: string
    last_name: string
    preferred_name: string | null
}

function playerLabel(p: PlayerOption): string {
    return formatPlayerLabel(
        p.first_name,
        p.last_name,
        p.preferred_name,
        p.old_id
    )
}

function playerMatches(p: PlayerOption, lowerSearch: string): boolean {
    return (
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(lowerSearch) ||
        (p.preferred_name?.toLowerCase().includes(lowerSearch) ?? false) ||
        (p.old_id?.toString().includes(lowerSearch) ?? false)
    )
}

interface PlayerOptionComboboxProps<T extends PlayerOption> {
    id?: string
    users: T[]
    value: string | null
    onChange: (userId: string | null, user: T | null) => void
    placeholder?: string
    /** Hidden from the list (e.g. already picked elsewhere), unless selected. */
    excludeIds?: readonly string[]
    size?: "default" | "sm"
    triggerClassName?: string
    popoverClassName?: string
}

/**
 * Player picker for admin forms: labels with the legacy id and preferred
 * name, searches name, preferred name and legacy id, and can hide players
 * already chosen elsewhere on the page.
 */
export function PlayerOptionCombobox<T extends PlayerOption>({
    id,
    users,
    value,
    onChange,
    placeholder = "Select a player...",
    excludeIds,
    size,
    triggerClassName,
    popoverClassName
}: PlayerOptionComboboxProps<T>) {
    const items = useMemo(
        () =>
            excludeIds?.length
                ? users.filter(
                      (u) => !excludeIds.includes(u.id) || u.id === value
                  )
                : users,
        [users, excludeIds, value]
    )
    return (
        <Combobox
            id={id}
            items={items}
            value={value}
            onChange={(id) =>
                onChange(
                    id,
                    id ? (users.find((u) => u.id === id) ?? null) : null
                )
            }
            getKey={(u) => u.id}
            getLabel={playerLabel}
            matchesSearch={playerMatches}
            placeholder={placeholder}
            searchPlaceholder="Search players..."
            emptyText="No players found"
            size={size}
            triggerClassName={triggerClassName}
            popoverClassName={popoverClassName}
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
    /** Put on the trigger so a <Label htmlFor> can point at it. */
    id?: string
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
    id,
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

    // Every whitespace-separated term must appear somewhere in the row. Names
    // render as "First (Nick) Last", so a plain substring search would miss
    // "jo pessagno" against "Joann (Jo) Pessagno" -- the terms are adjacent to
    // the reader but not in the string.
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = terms.length
        ? users.filter((u) => {
              const haystack =
                  `${u.name} ${u.email} ${u.phone ?? ""}`.toLowerCase()
              return terms.every((term) => haystack.includes(term))
          })
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
                    id={id}
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
                                <span className="text-muted-foreground text-sm">
                                    {user.email}
                                    {user.phone ? ` · ${user.phone}` : ""}
                                </span>
                            </button>
                        ))
                    )}
                </div>
                {hidden > 0 && (
                    <p className="border-t p-2 text-center text-muted-foreground text-sm">
                        {hidden} more match — keep typing to narrow it down.
                    </p>
                )}
            </PopoverContent>
        </Popover>
    )
}
