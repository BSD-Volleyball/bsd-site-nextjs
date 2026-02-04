"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateSiteConfig, deleteSiteConfigKey } from "./actions"
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react"

interface ConfigRow {
    key: string
    value: string
    updated_at: string
}

interface SiteConfigFormProps {
    initialRows: ConfigRow[]
}

export function SiteConfigForm({ initialRows }: SiteConfigFormProps) {
    const router = useRouter()
    const [rows, setRows] = useState<ConfigRow[]>(initialRows)
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const handleValueChange = (index: number, value: string) => {
        setRows((prev) =>
            prev.map((row, i) => (i === index ? { ...row, value } : row))
        )
    }

    const handleKeyChange = (index: number, key: string) => {
        setRows((prev) =>
            prev.map((row, i) => (i === index ? { ...row, key } : row))
        )
    }

    const addRow = () => {
        setRows((prev) => [
            ...prev,
            { key: "", value: "", updated_at: new Date().toISOString() }
        ])
    }

    const removeRow = async (index: number) => {
        const row = rows[index]

        // If the row has a key that exists in the DB (i.e. it came from initialRows), delete it server-side
        const isExisting = initialRows.some((r) => r.key === row.key)

        if (isExisting && row.key) {
            setIsLoading(true)
            setMessage(null)

            const result = await deleteSiteConfigKey(row.key)
            setIsLoading(false)

            if (!result.status) {
                setMessage({ type: "error", text: result.message })
                return
            }

            setMessage({ type: "success", text: result.message })
        }

        setRows((prev) => prev.filter((_, i) => i !== index))
        router.refresh()
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setMessage(null)

        // Filter out rows with empty keys
        const updates = rows
            .filter((row) => row.key.trim())
            .map((row) => ({ key: row.key.trim(), value: row.value }))

        if (updates.length === 0) {
            setIsLoading(false)
            setMessage({ type: "error", text: "No valid entries to save." })
            return
        }

        const result = await updateSiteConfig(updates)
        setIsLoading(false)

        setMessage({
            type: result.status ? "success" : "error",
            text: result.message
        })

        if (result.status) {
            router.refresh()
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle className="text-lg">
                        Configuration Values
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {rows.map((row, index) => (
                        <div
                            key={index}
                            className="flex items-end gap-3 rounded-lg border p-3"
                        >
                            <div className="flex-1 space-y-1">
                                <Label
                                    htmlFor={`key-${index}`}
                                    className="text-muted-foreground text-xs"
                                >
                                    Key
                                </Label>
                                <Input
                                    id={`key-${index}`}
                                    value={row.key}
                                    onChange={(e) =>
                                        handleKeyChange(index, e.target.value)
                                    }
                                    placeholder="config_key"
                                    disabled={initialRows.some(
                                        (r) =>
                                            r.key === row.key && row.key !== ""
                                    )}
                                />
                            </div>
                            <div className="flex-1 space-y-1">
                                <Label
                                    htmlFor={`value-${index}`}
                                    className="text-muted-foreground text-xs"
                                >
                                    Value
                                </Label>
                                <Input
                                    id={`value-${index}`}
                                    value={row.value}
                                    onChange={(e) =>
                                        handleValueChange(index, e.target.value)
                                    }
                                    placeholder="value"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="invisible text-xs">
                                    Delete
                                </Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeRow(index)}
                                    disabled={isLoading}
                                    className="text-muted-foreground hover:text-destructive"
                                >
                                    <RiDeleteBinLine className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addRow}
                        className="gap-2"
                    >
                        <RiAddLine className="h-4 w-4" />
                        Add New Key
                    </Button>
                </CardContent>
                <CardFooter className="flex flex-col items-start gap-3">
                    {message && (
                        <div
                            className={`w-full rounded-md p-3 text-sm ${
                                message.type === "success"
                                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                            }`}
                        >
                            {message.text}
                        </div>
                    )}
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? "Saving..." : "Save Changes"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
