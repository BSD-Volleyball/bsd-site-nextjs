"use client"

import { cancelCurrentSubscription } from "@/lib/payments/actions"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function CancelSubscription() {
    const router = useRouter()
    const [isPending, setIsPending] = useState(false)

    async function handleSubCancellation() {
        try {
            setIsPending(true)
            const loadingToast = toast.loading("Canceling subscription...")

            const result = await cancelCurrentSubscription()

            toast.dismiss(loadingToast)

            if (result.status) {
                toast.success(result.message)
                setTimeout(() => {
                    router.refresh()
                }, 3000)
            } else {
                toast.error(result.message)
            }
        } catch (error) {
            console.log(error)
            toast.error("Failed to cancel subscription")
        } finally {
            setIsPending(false)
        }
    }

    return (
        <Button
            variant="destructive"
            onClick={handleSubCancellation}
            disabled={isPending}
        >
            {isPending ? "Processing..." : "Cancel subscription"}
        </Button>
    )
}
