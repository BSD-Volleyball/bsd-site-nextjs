import { formatHeight } from "@/components/player-detail"
import { buildCsvContent } from "@/lib/csv-download"
import { buildPlayerPictureUrl } from "@/lib/utils"
import type { SignupCsvEntry } from "./actions"

export function generateCsvContent(
    entries: SignupCsvEntry[],
    playerPicUrl: string
): string {
    const headers = [
        "id",
        "First Name",
        "Last Name",
        "Preferred Name",
        "Pair Pick",
        "Gender",
        "Age",
        "Experience",
        "Assessment",
        "Height",
        "Picture",
        "Skill: Passer",
        "Skill: Setter",
        "Skill: Hitter",
        "Skill: Other",
        "Unavailable Dates",
        "Last Season",
        "Last Division",
        "Last Captain",
        "Captain In",
        "Drafted In",
        "My Overall Rating",
        "My Passing Rating",
        "My Setting Rating",
        "My Hitting Rating",
        "My Serving Rating",
        "My Shared Notes",
        "My Private Notes"
    ]

    const rows = entries.map((entry) => [
        entry.oldId !== 0 ? String(entry.oldId) : "",
        entry.firstName,
        entry.lastName,
        entry.preferredName || "",
        entry.pairPickName || "",
        entry.male === true ? "M" : entry.male === false ? "NM" : "",
        entry.age || "",
        entry.experience || "",
        entry.assessment || "",
        formatHeight(entry.height),
        buildPlayerPictureUrl(playerPicUrl, entry.picture),
        entry.skillPasser ? "Yes" : "No",
        entry.skillSetter ? "Yes" : "No",
        entry.skillHitter ? "Yes" : "No",
        entry.skillOther ? "Yes" : "No",
        entry.unavailableDates || "",
        entry.lastDraftSeason || "",
        entry.lastDraftDivision || "",
        entry.lastDraftCaptain || "",
        entry.captainIn || "",
        entry.draftedIn || "",
        entry.viewerOverallRating ?? "",
        entry.viewerPassingRating ?? "",
        entry.viewerSettingRating ?? "",
        entry.viewerHittingRating ?? "",
        entry.viewerServingRating ?? "",
        entry.viewerSharedNotes || "",
        entry.viewerPrivateNotes || ""
    ])

    return buildCsvContent(headers, rows)
}
