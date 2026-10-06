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
    /** Put on the trigger so a <Label htmlFor> can point at it. */
    id?: string
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
    id,
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
            {/* The clear button sits beside the trigger, not inside it: a
                button nested in a button is invalid and confuses assistive
                tech. A spacer inside the trigger keeps room for it. */}
            <div className="relative">
                <PopoverTrigger asChild>
                    <Button
                        id={id}
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
                                    aria-hidden="true"
                                    className={size === "sm" ? "size-4" : "size-5"}
                                />
                            )}
                            <RiArrowDownSLine className={iconClass} />
                        </div>
                    </Button>
                </PopoverTrigger>
                {selectedItem && (
                    <button
                        type="button"
                        aria-label="Clear selection"
                        className={cn(
                            "absolute top-1/2 -translate-y-1/2 rounded-sm p-0.5 hover:bg-accent",
                            size === "sm" ? "right-8" : "right-9"
                        )}
                        onClick={handleClear}
                    >
                        <RiCloseLine className={iconClass} />
                    </button>
                )}
            </div>
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
