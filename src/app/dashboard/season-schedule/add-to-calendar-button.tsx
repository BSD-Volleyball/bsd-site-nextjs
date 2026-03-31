"use client"

import { RiCalendarCheckLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"

export function AddToCalendarButton() {
    return (
        <Button variant="outline" size="sm" asChild>
            <a href="/dashboard/season-schedule/calendar" download>
                <RiCalendarCheckLine className="mr-2 h-4 w-4" />
                Add to Calendar
            </a>
        </Button>
    )
}
