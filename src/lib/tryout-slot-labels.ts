// Human-readable labels for a tryout week's time slots ("7:00 PM" style),
// derived from the season's configured tryout events. Week 1 has two
// sessions; weeks 2/3 have three slots. Falls back to "Slot N" when the
// season has no time slots configured yet.

import "server-only"

import type { SeasonConfig } from "@/lib/season-types"
import { getEventsByType } from "@/lib/site-config"
import { formatEventTime } from "@/lib/season-utils"

export function getTryoutSlotLabels(
    config: SeasonConfig,
    week: 1 | 2 | 3
): string[] {
    const tryouts = config.seasonId ? getEventsByType(config, "tryout") : []
    const slotCount = week === 1 ? 2 : 3
    const timeSlots = tryouts[week - 1]?.timeSlots ?? []
    return Array.from({ length: slotCount }, (_, index) => {
        const slot = timeSlots[index]
        const timeLabel = slot?.startTime
            ? formatEventTime(slot.startTime)
            : null
        return (
            slot?.slotLabel ??
            (timeLabel
                ? `Slot ${index + 1} (${timeLabel})`
                : `Slot ${index + 1}`)
        )
    })
}
