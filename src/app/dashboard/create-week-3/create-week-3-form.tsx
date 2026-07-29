"use client"

import { CreateWeekRosterForm } from "@/components/preseason/create-week-roster-form"
import { WEEK3_CONFIG } from "@/lib/preseason/config"
import { saveWeek3Rosters } from "./actions"
import type {
    ExcludedPlayer,
    PreseasonDivision,
    Week3Candidate
} from "@/lib/preseason/types"

interface CreateWeek3FormProps {
    seasonLabel: string
    divisions: PreseasonDivision[]
    candidates: Week3Candidate[]
    excludedPlayers: ExcludedPlayer[]
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
