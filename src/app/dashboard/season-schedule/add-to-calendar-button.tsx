"use client"

import { useState } from "react"
import { RiCalendarCheckLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"

export function AddToCalendarButton() {
    const [isLoading, setIsLoading] = useState(false)

    async function handleClick() {
        setIsLoading(true)
        try {
            const response = await fetch("/dashboard/season-schedule/calendar")
            if (!response.ok) throw new Error("Failed to fetch calendar")
            const text = await response.text()
            // Build a blob: URL so Safari treats it as a file download
            // rather than trying to render text/calendar inline
            const blob = new Blob([text], {
                type: "text/calendar;charset=utf-8"
            })
            const url = URL.createObjectURL(blob)
            const filename =
                response.headers
                    .get("Content-Disposition")
                    ?.match(/filename="([^"]+)"/)?.[1] ?? "bsd-schedule.ics"
            const a = document.createElement("a")
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch {
            // Silent fail — browser will show no feedback, which is fine
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={isLoading}
        >
            <RiCalendarCheckLine className="mr-2 h-4 w-4" />
            {isLoading ? "Preparing…" : "Add to Calendar"}
        </Button>
    )
}
