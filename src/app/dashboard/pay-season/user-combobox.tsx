"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"

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
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedUser = useMemo(
        () => users.find(u => u.id === value),
        [users, value]
    )

    const filteredUsers = useMemo(() => {
        if (!search) return users
        const lowerSearch = search.toLowerCase()
        return users.filter(u => u.name.toLowerCase().includes(lowerSearch))
    }, [users, search])

    const handleSelect = (userId: string) => {
        onChange(userId)
        setOpen(false)
        setSearch("")
    }

    const handleClear = () => {
        onChange(null)
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
                        {selectedUser ? selectedUser.name : placeholder}
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
                                {user.name}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
