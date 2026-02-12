"use client"

import { useState } from "react"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateAccountField, type AccountProfileData } from "./actions"

interface AccountFieldCardProps {
    name: keyof AccountProfileData
    label: string
    description?: string
    initialValue: string | null
    placeholder?: string
}

export function AccountFieldCard({
    name,
    label,
    description,
    initialValue,
    placeholder
}: AccountFieldCardProps) {
    const [value, setValue] = useState(initialValue ?? "")
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const hasChanged = value !== (initialValue ?? "")

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)
        setMessage(null)

        const result = await updateAccountField(name, value || null)

        setMessage({
            type: result.status ? "success" : "error",
            text: result.message
        })
        setIsLoading(false)

        if (result.status) {
            setTimeout(() => setMessage(null), 3000)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">{label}</CardTitle>
                    {description && (
                        <CardDescription>{description}</CardDescription>
                    )}
                </CardHeader>
                <CardContent>
                    <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={placeholder}
                    />
                    {message && (
                        <p
                            className={`mt-2 text-sm ${
                                message.type === "success"
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                            }`}
                        >
                            {message.text}
                        </p>
                    )}
                </CardContent>
                <CardFooter className="border-t pt-6">
                    <Button type="submit" disabled={isLoading || !hasChanged}>
                        {isLoading ? "Saving..." : "Save"}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    )
}
