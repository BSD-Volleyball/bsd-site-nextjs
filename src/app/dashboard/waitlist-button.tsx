"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { WaiverContent } from "@/components/waiver-content"
import { expressWaitlistInterest } from "./actions"

interface WaitlistButtonProps {
    seasonId: number
    activeWaiver: { id: number; content: string } | null
}

export function WaitlistButton({
    seasonId,
    activeWaiver
}: WaitlistButtonProps) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [waiverAgreed, setWaiverAgreed] = useState(false)

    const handleClick = async () => {
        if (!activeWaiver) return
        setIsLoading(true)

        const result = await expressWaitlistInterest(
            seasonId,
            activeWaiver.id,
            waiverAgreed
        )

        if (result.status) {
            toast.success(result.message)
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setIsLoading(false)
    }

    if (!activeWaiver) {
        return (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                No active waiver is currently published. Please contact an
                administrator before joining the waitlist.
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <h3 className="font-medium text-base">
                    Liability and Conduct Waiver
                </h3>
                <WaiverContent content={activeWaiver.content} />
            </div>
            <div className="flex items-center gap-2">
                <Checkbox
                    id={`waitlist-waiver-agree-${seasonId}`}
                    checked={waiverAgreed}
                    onCheckedChange={(checked: boolean | "indeterminate") =>
                        setWaiverAgreed(checked === true)
                    }
                />
                <Label
                    htmlFor={`waitlist-waiver-agree-${seasonId}`}
                    className="cursor-pointer font-medium"
                >
                    I Agree
                </Label>
            </div>
            <Button onClick={handleClick} disabled={isLoading || !waiverAgreed}>
                {isLoading ? "Submitting..." : "Express Interest"}
            </Button>
        </div>
    )
}
