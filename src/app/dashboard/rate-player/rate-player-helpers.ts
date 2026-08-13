import { formatDisplayName } from "@/lib/utils"
import type { PlayerRatingValues, RatePlayerEntry } from "./actions"

export function getDisplayName(player: RatePlayerEntry): string {
    return formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
}

export function getOldIdLabel(player: RatePlayerEntry): string {
    if (player.oldId === null) {
        return "No old_id"
    }

    return `#${player.oldId}`
}

export function getGenderLabel(male: boolean | null): string {
    if (male === true) {
        return "Male"
    }

    if (male === false) {
        return "Non-Male"
    }

    return "—"
}

export function getEmptyRating(): PlayerRatingValues {
    return {
        overall: null,
        passing: null,
        setting: null,
        hitting: null,
        serving: null,
        blocking: null,
        sharedNotes: null,
        privateNotes: null
    }
}
