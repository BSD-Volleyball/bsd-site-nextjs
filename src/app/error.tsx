"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
    error,
    reset
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="space-y-2">
                <h1 className="font-bold text-2xl">Something went wrong</h1>
                <p className="max-w-md text-muted-foreground">
                    An unexpected error occurred. Please try again.
                </p>
            </div>
            <Button onClick={reset}>Try Again</Button>
        </div>
    )
}
