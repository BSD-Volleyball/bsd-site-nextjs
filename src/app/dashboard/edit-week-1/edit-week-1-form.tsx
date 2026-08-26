"use client"

import { EditWeek1RosterForm } from "@/components/edit-week-roster/edit-week-1-roster-form"
import {
    updateWeek1Rosters,
    sendWeek1RosterNotifications,
    type Week1EditablePlayer,
    type Week1EditableSlot
} from "./actions"

interface EditWeek1FormProps {
    players: Week1EditablePlayer[]
    slots: Week1EditableSlot[]
    slotLabels: string[]
    playerPicUrl: string
    seasonLabel: string
}

export function EditWeek1Form({
    players,
    slots,
    slotLabels,
    playerPicUrl,
    seasonLabel
}: EditWeek1FormProps) {
    return (
        <EditWeek1RosterForm
            players={players}
            slots={slots}
            slotLabels={slotLabels}
            playerPicUrl={playerPicUrl}
            seasonLabel={seasonLabel}
            updateRosters={updateWeek1Rosters}
            sendNotifications={sendWeek1RosterNotifications}
        />
    )
}
