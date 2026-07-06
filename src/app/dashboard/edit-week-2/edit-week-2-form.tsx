"use client"

import { EditWeekRosterForm } from "@/components/edit-week-roster/edit-week-roster-form"
import {
    updateWeek2Rosters,
    sendWeek2RosterNotifications,
    type Week2EditablePlayer,
    type Week2EditableSlot
} from "./actions"

interface EditWeek2FormProps {
    players: Week2EditablePlayer[]
    slots: Week2EditableSlot[]
    playerPicUrl: string
    seasonLabel: string
}

export function EditWeek2Form({
    players,
    slots,
    playerPicUrl,
    seasonLabel
}: EditWeek2FormProps) {
    return (
        <EditWeekRosterForm
            weekNumber={2}
            captainMode="locked"
            players={players}
            slots={slots}
            playerPicUrl={playerPicUrl}
            seasonLabel={seasonLabel}
            updateRosters={updateWeek2Rosters}
            sendNotifications={sendWeek2RosterNotifications}
        />
    )
}
