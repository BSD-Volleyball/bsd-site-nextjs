"use client"

import { CreateWeekRosterForm } from "@/components/preseason/create-week-roster-form"
import { WEEK2_CONFIG } from "@/lib/preseason/config"
import { saveWeek2Rosters } from "./actions"
import type {
    Week2Candidate,
    Week2Division,
    Week2ExcludedPlayer
} from "./week2-types"

interface CreateWeek2FormProps {
    seasonLabel: string
    divisions: Week2Division[]
    candidates: Week2Candidate[]
    excludedPlayers: Week2ExcludedPlayer[]
    playerPicUrl: string
}

export function CreateWeek2Form(props: CreateWeek2FormProps) {
    return (
        <CreateWeekRosterForm
            config={WEEK2_CONFIG}
            saveAction={saveWeek2Rosters}
            {...props}
        />
    )
}
