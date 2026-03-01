"use client"

import { useEffect, useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { googleMembershipOptions } from "@/lib/google-membership"
import { updateGoogleMembership, type GoogleMembershipUser } from "./actions"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

interface GoogleMembershipTableProps {
    users: GoogleMembershipUser[]
    initialQuery: string
    page: number
    totalPages: number
    total: number
}

function normalizeMembershipValue(value: string | null | undefined): string {
    if (!value || value === "false") {
        return ""
    }

    return googleMembershipOptions.some((option) => option.value === value)
        ? value
        : ""
}

export function GoogleMembershipTable({
    users,
    initialQuery,
    page,
    totalPages,
    total
}: GoogleMembershipTableProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [search, setSearch] = useState(initialQuery)
    const [rowValues, setRowValues] = useState<
        Record<string, { seasonsList: string; notificationList: string }>
    >({})
    const [statusByUser, setStatusByUser] = useState<
        Record<string, { type: "success" | "error"; text: string }>
    >({})
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        setSearch(initialQuery)
    }, [initialQuery])

    useEffect(() => {
        setRowValues((current) => {
            const next = { ...current }

            for (const user of users) {
                if (!next[user.id]) {
                    next[user.id] = {
                        seasonsList: normalizeMembershipValue(user.seasonsList),
                        notificationList: normalizeMembershipValue(
                            user.notificationList
                        )
                    }
                }
            }

            return next
        })
    }, [users])

    useEffect(() => {
        const timeout = setTimeout(() => {
            const trimmedSearch = search.trim()
            const effectiveSearch =
                trimmedSearch.length >= 2 ? trimmedSearch : ""
            const currentQuery = searchParams.get("q") ?? ""
            if (effectiveSearch === currentQuery) {
                return
            }

            const params = new URLSearchParams(searchParams.toString())

            if (effectiveSearch) {
                params.set("q", effectiveSearch)
            } else {
                params.delete("q")
            }

            params.set("page", "1")
            router.replace(`${pathname}?${params.toString()}`)
        }, 300)

        return () => clearTimeout(timeout)
    }, [search, pathname, router, searchParams])

    const handlePageChange = (nextPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("page", String(nextPage))
        router.replace(`${pathname}?${params.toString()}`)
    }

    const handleRowValueChange = (
        userId: string,
        key: "seasonsList" | "notificationList",
        value: string
    ) => {
        setRowValues((current) => ({
            ...current,
            [userId]: {
                seasonsList: current[userId]?.seasonsList || "",
                notificationList: current[userId]?.notificationList || "",
                [key]: value
            }
        }))
    }

    const handleSave = (user: GoogleMembershipUser) => {
        const values = rowValues[user.id]
        if (!values) {
            return
        }

        startTransition(async () => {
            const result = await updateGoogleMembership(user.id, {
                seasonsList: values.seasonsList || "false",
                notificationList: values.notificationList || "false"
            })

            setStatusByUser((current) => ({
                ...current,
                [user.id]: {
                    type: result.status ? "success" : "error",
                    text: result.message
                }
            }))
        })
    }

    return (
        <div className="space-y-4">
            <div className="max-w-lg">
                <Input
                    placeholder="Search by old_id, name, or email"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </div>

            <div className="text-muted-foreground text-sm">
                Showing {users.length} of {total} users
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr className="border-b">
                                    <th className="px-4 py-3 text-left font-medium">
                                        Old ID
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium">
                                        Name
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium">
                                        Email
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium">
                                        Seasons List
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium">
                                        Notification List
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => {
                                    const preferred = user.preferredName
                                        ? ` (${user.preferredName})`
                                        : ""
                                    const name = `${user.firstName}${preferred} ${user.lastName}`
                                    const values = rowValues[user.id] ?? {
                                        seasonsList: "",
                                        notificationList: ""
                                    }

                                    return (
                                        <tr key={user.id} className="border-b">
                                            <td className="px-4 py-3">
                                                {user.oldId || ""}
                                            </td>
                                            <td className="px-4 py-3">
                                                {name}
                                            </td>
                                            <td className="px-4 py-3">
                                                {user.email}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Select
                                                    value={values.seasonsList}
                                                    onValueChange={(value) =>
                                                        handleRowValueChange(
                                                            user.id,
                                                            "seasonsList",
                                                            value
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select status" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {googleMembershipOptions.map(
                                                            (option) => (
                                                                <SelectItem
                                                                    key={`seasons-${user.id}-${option.value}`}
                                                                    value={
                                                                        option.value
                                                                    }
                                                                >
                                                                    {
                                                                        option.value
                                                                    }{" "}
                                                                    -{" "}
                                                                    {
                                                                        option.label
                                                                    }
                                                                </SelectItem>
                                                            )
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Select
                                                    value={
                                                        values.notificationList
                                                    }
                                                    onValueChange={(value) =>
                                                        handleRowValueChange(
                                                            user.id,
                                                            "notificationList",
                                                            value
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select status" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {googleMembershipOptions.map(
                                                            (option) => (
                                                                <SelectItem
                                                                    key={`notifications-${user.id}-${option.value}`}
                                                                    value={
                                                                        option.value
                                                                    }
                                                                >
                                                                    {
                                                                        option.value
                                                                    }{" "}
                                                                    -{" "}
                                                                    {
                                                                        option.label
                                                                    }
                                                                </SelectItem>
                                                            )
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="space-y-2">
                                                    <Button
                                                        type="button"
                                                        disabled={isPending}
                                                        onClick={() =>
                                                            handleSave(user)
                                                        }
                                                    >
                                                        Save
                                                    </Button>
                                                    {statusByUser[user.id] && (
                                                        <p
                                                            className={`text-xs ${
                                                                statusByUser[
                                                                    user.id
                                                                ].type ===
                                                                "success"
                                                                    ? "text-green-700 dark:text-green-300"
                                                                    : "text-red-700 dark:text-red-300"
                                                            }`}
                                                        >
                                                            {
                                                                statusByUser[
                                                                    user.id
                                                                ].text
                                                            }
                                                        </p>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}

                                {users.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-4 py-8 text-center text-muted-foreground"
                                        >
                                            No users match your search.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                    Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => handlePageChange(page - 1)}
                    >
                        Previous
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={page >= totalPages}
                        onClick={() => handlePageChange(page + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    )
}
