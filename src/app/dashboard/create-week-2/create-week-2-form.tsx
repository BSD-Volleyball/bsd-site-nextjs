"use client"

import { CreateWeekRosterForm } from "@/components/preseason/create-week-roster-form"
import { WEEK2_CONFIG } from "@/lib/preseason/config"
import { saveWeek2Rosters } from "./actions"
import type {
    ExcludedPlayer,
    PreseasonDivision,
    Week2Candidate
} from "@/lib/preseason/types"

interface CreateWeek2FormProps {
    seasonLabel: string
    divisions: PreseasonDivision[]
    candidates: Week2Candidate[]
    excludedPlayers: ExcludedPlayer[]
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
