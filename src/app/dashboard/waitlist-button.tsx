"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { expressWaitlistInterest } from "./actions"

interface WaitlistButtonProps {
    seasonId: number
}

export function WaitlistButton({ seasonId }: WaitlistButtonProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    const handleClick = async () => {
        setIsLoading(true)

        const result = await expressWaitlistInterest(seasonId)

        if (result.status) {
            toast.success(result.message)
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setIsLoading(false)
    }

    return (
        <div className="space-y-2">
            <Button onClick={handleClick} disabled={isLoading}>
                {isLoading ? "Submitting..." : "Express Interest"}
            </Button>
        </div>
    )
}
