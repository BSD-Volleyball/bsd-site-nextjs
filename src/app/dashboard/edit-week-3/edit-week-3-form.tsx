"use client"

import { EditWeekRosterForm } from "@/components/edit-week-roster/edit-week-roster-form"
import {
    updateWeek3Rosters,
    sendWeek3RosterNotifications,
    type Week3EditablePlayer,
    type Week3EditableSlot
} from "./actions"

interface EditWeek3FormProps {
    players: Week3EditablePlayer[]
    slots: Week3EditableSlot[]
    playerPicUrl: string
    seasonLabel: string
}

export function EditWeek3Form({
    players,
    slots,
    playerPicUrl,
    seasonLabel
}: EditWeek3FormProps) {
    return (
        <EditWeekRosterForm
            weekNumber={3}
            captainMode="editable"
            players={players}
            slots={slots}
            playerPicUrl={playerPicUrl}
            seasonLabel={seasonLabel}
            updateRosters={updateWeek3Rosters}
            sendNotifications={sendWeek3RosterNotifications}
        />
    )
}
