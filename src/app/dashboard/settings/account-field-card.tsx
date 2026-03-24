"use client"

import { useState } from "react"
import { toast } from "sonner"
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

    const hasChanged = value !== (initialValue ?? "")

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)

        const result = await updateAccountField(name, value || null)

        if (result.status) {
            toast.success(result.message)
        } else {
            toast.error(result.message)
        }
        setIsLoading(false)
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
