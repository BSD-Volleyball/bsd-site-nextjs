"use client"

import { Combobox } from "@/components/ui/combobox"

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
