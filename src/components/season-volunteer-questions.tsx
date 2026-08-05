"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

// Asked during season signup and editable afterward on the season preferences
// page. Shared so both places word the questions identically.
export const REF_INTEREST_LABEL = "Interested in reffing this season?"
export const TRYOUT_HELP_LABEL =
    "Willing to help run tryouts for time slots you aren't assigned to?"

interface SeasonVolunteerQuestionsProps {
    refInterest: boolean
    tryoutHelp: boolean
    onRefInterestChange: (value: boolean) => void
    onTryoutHelpChange: (value: boolean) => void
    idPrefix?: string
}

export function SeasonVolunteerQuestions({
    refInterest,
    tryoutHelp,
    onRefInterestChange,
    onTryoutHelpChange,
    idPrefix = ""
}: SeasonVolunteerQuestionsProps) {
    const refId = `${idPrefix}ref-interest-toggle`
    const tryoutId = `${idPrefix}tryout-help-toggle`

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <Label htmlFor={refId} className="cursor-pointer font-normal">
                    {REF_INTEREST_LABEL}
                </Label>
                <Switch
                    id={refId}
                    checked={refInterest}
                    onCheckedChange={onRefInterestChange}
                />
            </div>
            <div className="flex items-center justify-between gap-4">
                <Label
                    htmlFor={tryoutId}
                    className="cursor-pointer font-normal"
                >
                    {TRYOUT_HELP_LABEL}
                </Label>
                <Switch
                    id={tryoutId}
                    checked={tryoutHelp}
                    onCheckedChange={onTryoutHelpChange}
                />
            </div>
        </div>
    )
}
