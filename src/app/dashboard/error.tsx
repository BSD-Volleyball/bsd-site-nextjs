"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function DashboardErrorBoundary({
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
                    An error occurred loading this page. Try refreshing or
                    return to the dashboard.
                </p>
            </div>
            <div className="flex gap-3">
                <Button onClick={reset} size="sm">
                    Try Again
                </Button>
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard">Back to Dashboard</Link>
                </Button>
            </div>
        </div>
    )
}
