"use client"

import { useState, useMemo, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover"
import { RiArrowDownSLine, RiCloseLine } from "@remixicon/react"
import { cn } from "@/lib/utils"

interface ComboboxProps<T> {
    items: T[]
    value: string | null
    onChange: (id: string | null) => void
    getKey: (item: T) => string
    getLabel: (item: T) => string
    /** Custom search predicate; defaults to case-insensitive label match. */
    matchesSearch?: (item: T, lowerSearch: string) => boolean
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: ReactNode
    /** Compact trigger/icons (used inside dense tables). */
    size?: "default" | "sm"
    triggerClassName?: string
    popoverClassName?: string
}

export function Combobox<T>({
    items,
    value,
    onChange,
    getKey,
    getLabel,
    matchesSearch,
    placeholder = "Select...",
    searchPlaceholder = "Search...",
    emptyText = "No results found",
    size = "default",
    triggerClassName,
    popoverClassName
}: ComboboxProps<T>) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")

    const selectedItem = useMemo(
        () => items.find((item) => getKey(item) === value),
        [items, value, getKey]
    )

    const filteredItems = useMemo(() => {
        if (!search) return items
        const lowerSearch = search.toLowerCase()
        if (matchesSearch) {
            return items.filter((item) => matchesSearch(item, lowerSearch))
        }
        return items.filter((item) =>
            getLabel(item).toLowerCase().includes(lowerSearch)
        )
    }, [items, search, matchesSearch, getLabel])

    const handleSelect = (id: string) => {
        onChange(id)
        setOpen(false)
        setSearch("")
    }

    const handleClear = () => {
        onChange(null)
        setSearch("")
    }

    const iconClass =
        size === "sm"
            ? "h-3 w-3 text-muted-foreground"
            : "h-4 w-4 text-muted-foreground"

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between font-normal",
                        triggerClassName
                    )}
                >
                    <span
                        className={cn(
                            "truncate",
                            !selectedItem && "text-muted-foreground"
                        )}
                    >
                        {selectedItem ? getLabel(selectedItem) : placeholder}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                        {selectedItem && (
                            <span
                                role="button"
                                tabIndex={0}
                                className="rounded-sm p-0.5 hover:bg-accent"
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
                                <RiCloseLine className={iconClass} />
                            </span>
                        )}
                        <RiArrowDownSLine className={iconClass} />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className={cn(
                    "w-(--radix-popover-trigger-width) p-2",
                    popoverClassName
                )}
                align="start"
            >
                <Input
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoCorrect="off"
                    className={cn("mb-2", size === "sm" && "h-8 text-sm")}
                />
                <div className="max-h-60 overflow-y-auto">
                    {filteredItems.length === 0 ? (
                        <p className="py-2 text-center text-muted-foreground text-sm">
                            {emptyText}
                        </p>
                    ) : (
                        filteredItems.map((item) => (
                            <button
                                key={getKey(item)}
                                type="button"
                                className={cn(
                                    "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                                    value === getKey(item) && "bg-accent"
                                )}
                                onClick={() => handleSelect(getKey(item))}
                            >
                                {getLabel(item)}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
