"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
    RiAddLine,
    RiEditLine,
    RiDeleteBinLine,
    RiCheckLine,
    RiCloseLine
} from "@remixicon/react"
import { UserCombobox } from "./user-combobox"
import {
    createDiscount,
    updateDiscount,
    deleteDiscount,
    type DiscountEntry
} from "./actions"

interface DiscountsManagerProps {
    discounts: DiscountEntry[]
    users: { id: string; name: string }[]
}

export function DiscountsManager({ discounts, users }: DiscountsManagerProps) {
    const router = useRouter()
    const [search, setSearch] = useState("")
    const [showAddForm, setShowAddForm] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    // Add form state
    const [newUserId, setNewUserId] = useState<string | null>(null)
    const [newPercentage, setNewPercentage] = useState("")
    const [newExpiration, setNewExpiration] = useState("")
    const [newReason, setNewReason] = useState("")

    // Edit form state
    const [editPercentage, setEditPercentage] = useState("")
    const [editExpiration, setEditExpiration] = useState("")
    const [editReason, setEditReason] = useState("")

    const filteredDiscounts = useMemo(() => {
        if (!search) return discounts
        const lower = search.toLowerCase()
        return discounts.filter((d) => d.userName.toLowerCase().includes(lower))
    }, [discounts, search])

    const handleAddDiscount = async () => {
        if (!newUserId || !newPercentage) {
            setMessage({
                type: "error",
                text: "Please select a user and enter a percentage."
            })
            return
        }

        setIsLoading(true)
        setMessage(null)

        const result = await createDiscount({
            userId: newUserId,
            percentage: newPercentage,
            expiration: newExpiration || null,
            reason: newReason || null
        })

        setIsLoading(false)

        if (result.status) {
            setMessage({ type: "success", text: result.message })
            setShowAddForm(false)
            setNewUserId(null)
            setNewPercentage("")
            setNewExpiration("")
            setNewReason("")
            router.refresh()
        } else {
            setMessage({ type: "error", text: result.message })
        }
    }

    const handleStartEdit = (discount: DiscountEntry) => {
        setEditingId(discount.id)
        setEditPercentage(discount.percentage)
        setEditExpiration(
            discount.expiration
                ? new Date(discount.expiration).toISOString().split("T")[0]
                : ""
        )
        setEditReason(discount.reason || "")
        setMessage(null)
    }

    const handleCancelEdit = () => {
        setEditingId(null)
        setEditPercentage("")
        setEditExpiration("")
        setEditReason("")
    }

    const handleSaveEdit = async (id: number) => {
        if (!editPercentage) {
            setMessage({ type: "error", text: "Please enter a percentage." })
            return
        }

        setIsLoading(true)
        setMessage(null)

        const result = await updateDiscount({
            id,
            percentage: editPercentage,
            expiration: editExpiration || null,
            reason: editReason || null
        })

        setIsLoading(false)

        if (result.status) {
            setMessage({ type: "success", text: result.message })
            setEditingId(null)
            router.refresh()
        } else {
            setMessage({ type: "error", text: result.message })
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this discount?")) {
            return
        }

        setIsLoading(true)
        setMessage(null)

        const result = await deleteDiscount(id)

        setIsLoading(false)

        if (result.status) {
            setMessage({ type: "success", text: result.message })
            router.refresh()
        } else {
            setMessage({ type: "error", text: result.message })
        }
    }

    const formatDate = (date: Date | null) => {
        if (!date) return "No expiration"
        return new Date(date).toLocaleDateString()
    }

    const isExpired = (date: Date | null) => {
        if (!date) return false
        return new Date(date) < new Date()
    }

    return (
        <div className="space-y-4">
            {message && (
                <div
                    className={`rounded-md p-3 text-sm ${
                        message.type === "success"
                            ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                            : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                    }`}
                >
                    {message.text}
                </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-3 py-1.5 font-medium text-sm">
                        {discounts.length} discount
                        {discounts.length !== 1 && "s"}
                    </span>
                    <span className="rounded-md bg-green-100 px-3 py-1.5 font-medium text-green-700 text-sm dark:bg-green-900 dark:text-green-300">
                        {discounts.filter((d) => !d.used).length} active
                    </span>
                    <span className="rounded-md bg-gray-100 px-3 py-1.5 font-medium text-gray-700 text-sm dark:bg-gray-800 dark:text-gray-300">
                        {discounts.filter((d) => d.used).length} used
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Filter by name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-xs"
                    />
                    <Button
                        onClick={() => {
                            setShowAddForm(!showAddForm)
                            setMessage(null)
                        }}
                        size="sm"
                        className="gap-1"
                    >
                        <RiAddLine className="h-4 w-4" />
                        Add
                    </Button>
                </div>
            </div>

            {showAddForm && (
                <div className="rounded-lg border bg-muted/50 p-4">
                    <h3 className="mb-3 font-medium">Add New Discount</h3>
                    <div className="grid gap-4 sm:grid-cols-4">
                        <div className="sm:col-span-2">
                            <Label className="mb-1.5 block text-sm">
                                Player
                            </Label>
                            <UserCombobox
                                users={users}
                                value={newUserId}
                                onChange={setNewUserId}
                                placeholder="Select a player..."
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-sm">
                                Discount %
                            </Label>
                            <Input
                                type="number"
                                min="1"
                                max="100"
                                value={newPercentage}
                                onChange={(e) =>
                                    setNewPercentage(e.target.value)
                                }
                                placeholder="e.g. 20"
                            />
                        </div>
                        <div>
                            <Label className="mb-1.5 block text-sm">
                                Expiration (optional)
                            </Label>
                            <Input
                                type="date"
                                value={newExpiration}
                                onChange={(e) =>
                                    setNewExpiration(e.target.value)
                                }
                            />
                        </div>
                        <div className="sm:col-span-4">
                            <Label className="mb-1.5 block text-sm">
                                Reason (optional)
                            </Label>
                            <Input
                                value={newReason}
                                onChange={(e) => setNewReason(e.target.value)}
                                placeholder="e.g. Referral bonus"
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                        <Button
                            onClick={handleAddDiscount}
                            disabled={isLoading}
                            size="sm"
                        >
                            {isLoading ? "Creating..." : "Create Discount"}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowAddForm(false)
                                setNewUserId(null)
                                setNewPercentage("")
                                setNewExpiration("")
                                setNewReason("")
                            }}
                            size="sm"
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Player
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Discount
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Expiration
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Status
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Reason
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Created
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDiscounts.map((discount) => (
                            <tr
                                key={discount.id}
                                className="border-b transition-colors last:border-0 hover:bg-accent/50"
                            >
                                <td className="px-4 py-2 font-medium">
                                    {discount.userName}
                                </td>
                                <td className="px-4 py-2">
                                    {editingId === discount.id ? (
                                        <Input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={editPercentage}
                                            onChange={(e) =>
                                                setEditPercentage(
                                                    e.target.value
                                                )
                                            }
                                            className="h-8 w-20"
                                        />
                                    ) : (
                                        <span className="font-semibold text-green-600 dark:text-green-400">
                                            {discount.percentage}% off
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-2">
                                    {editingId === discount.id ? (
                                        <Input
                                            type="date"
                                            value={editExpiration}
                                            onChange={(e) =>
                                                setEditExpiration(
                                                    e.target.value
                                                )
                                            }
                                            className="h-8 w-36"
                                        />
                                    ) : (
                                        <span
                                            className={
                                                isExpired(discount.expiration)
                                                    ? "text-red-600 dark:text-red-400"
                                                    : ""
                                            }
                                        >
                                            {formatDate(discount.expiration)}
                                            {isExpired(discount.expiration) &&
                                                " (expired)"}
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-2">
                                    {discount.used ? (
                                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 text-xs dark:bg-gray-800 dark:text-gray-400">
                                            Used
                                        </span>
                                    ) : isExpired(discount.expiration) ? (
                                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-600 text-xs dark:bg-red-900 dark:text-red-400">
                                            Expired
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-600 text-xs dark:bg-green-900 dark:text-green-400">
                                            Active
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-2 text-muted-foreground">
                                    {editingId === discount.id ? (
                                        <Input
                                            value={editReason}
                                            onChange={(e) =>
                                                setEditReason(e.target.value)
                                            }
                                            className="h-8 w-40"
                                            placeholder="Optional"
                                        />
                                    ) : (
                                        <span>{discount.reason || "—"}</span>
                                    )}
                                </td>
                                <td className="px-4 py-2 text-muted-foreground">
                                    {new Date(
                                        discount.createdAt
                                    ).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-2">
                                    {editingId === discount.id ? (
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    handleSaveEdit(discount.id)
                                                }
                                                disabled={isLoading}
                                                className="h-8 w-8 p-0"
                                            >
                                                <RiCheckLine className="h-4 w-4 text-green-600" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleCancelEdit}
                                                className="h-8 w-8 p-0"
                                            >
                                                <RiCloseLine className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    handleStartEdit(discount)
                                                }
                                                className="h-8 w-8 p-0"
                                                title="Edit"
                                            >
                                                <RiEditLine className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    handleDelete(discount.id)
                                                }
                                                disabled={isLoading}
                                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                                title="Delete"
                                            >
                                                <RiDeleteBinLine className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredDiscounts.length === 0 && (
                            <tr>
                                <td
                                    colSpan={7}
                                    className="px-4 py-6 text-center text-muted-foreground"
                                >
                                    No discounts found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
