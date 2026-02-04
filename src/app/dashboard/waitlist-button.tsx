"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { expressWaitlistInterest } from "./actions"

interface WaitlistButtonProps {
    seasonId: number
}

export function WaitlistButton({ seasonId }: WaitlistButtonProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const handleClick = async () => {
        setIsLoading(true)
        setMessage(null)

        const result = await expressWaitlistInterest(seasonId)

        setMessage({
            type: result.status ? "success" : "error",
            text: result.message
        })
        setIsLoading(false)

        if (result.status) {
            router.refresh()
        }
    }

    return (
        <div className="space-y-2">
            <Button onClick={handleClick} disabled={isLoading}>
                {isLoading ? "Submitting..." : "Express Interest"}
            </Button>
            {message && (
                <p
                    className={`text-sm ${
                        message.type === "success"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                    }`}
                >
                    {message.text}
                </p>
            )}
        </div>
    )
}
