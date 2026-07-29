"use client"

import { CreateWeekRosterForm } from "@/components/preseason/create-week-roster-form"
import { WEEK3_CONFIG } from "@/lib/preseason/config"
import { saveWeek3Rosters } from "./actions"
import type {
    Week3Candidate,
    Week3Division,
    Week3ExcludedPlayer
} from "./week3-types"

interface CreateWeek3FormProps {
    seasonLabel: string
    divisions: Week3Division[]
    candidates: Week3Candidate[]
    excludedPlayers: Week3ExcludedPlayer[]
    playerPicUrl: string
}

export function CreateWeek3Form(props: CreateWeek3FormProps) {
    return (
        <CreateWeekRosterForm
            config={WEEK3_CONFIG}
            saveAction={saveWeek3Rosters}
            {...props}
        />
    )
}
