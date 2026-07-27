"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function MarketingErrorBoundary({
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
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="space-y-2">
                <h1 className="font-bold text-xl">Something went wrong</h1>
                <p className="max-w-md text-muted-foreground text-sm">
                    An error occurred loading this page. Try refreshing or head
                    back to the home page.
                </p>
            </div>
            <div className="flex gap-3">
                <Button onClick={reset} size="sm">
                    Try Again
                </Button>
                <Button asChild variant="outline" size="sm">
                    <Link href="/">Go Home</Link>
                </Button>
            </div>
        </div>
    )
}
