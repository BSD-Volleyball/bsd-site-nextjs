import { formatHeight } from "@/components/player-detail"
import { buildCsvContent } from "@/lib/csv-download"
import { buildPlayerPictureUrl } from "@/lib/utils"
import type { SignupEntry } from "./actions"

export function generateCsvContent(
    signups: SignupEntry[],
    playerPicUrl: string
): string {
    const headers = [
        "id",
        "First Name",
        "Last Name",
        "Preferred Name",
        "Email",
        "Phone",
        "Pair Pick",
        "Pair Reason",
        "Gender",
        "Age",
        "Captain",
        "Captain In",
        "Drafted In",
        "Paid",
        "Signup Date",
        "Experience",
        "Assessment",
        "Height",
        "Picture",
        "Skill: Passer",
        "Skill: Setter",
        "Skill: Hitter",
        "Skill: Other",
        "Seasons List",
        "Notification List",
        "Unavailable Dates",
        "Last Season",
        "Last Division",
        "Last Captain",
        "Last Overall"
    ]

    const rows = signups.map((entry) => [
        entry.oldId !== 0 ? String(entry.oldId) : "",
        entry.firstName,
        entry.lastName,
        entry.preferredName || "",
        entry.email,
        entry.phone || "",
        entry.pairPickName || "",
        entry.pairReason || "",
        entry.male === true ? "M" : entry.male === false ? "NM" : "",
        entry.age || "",
        entry.captain === "yes"
            ? "Yes"
            : entry.captain === "only_if_needed"
              ? "If needed"
              : entry.captain === "no"
                ? "No"
                : "",
        entry.captainIn || "",
        entry.draftedIn || "",
        entry.amountPaid || "",
        new Date(entry.signupDate).toLocaleDateString(),
        entry.experience || "",
        entry.assessment || "",
        formatHeight(entry.height),
        buildPlayerPictureUrl(playerPicUrl, entry.picture),
        entry.skillPasser ? "Yes" : "No",
        entry.skillSetter ? "Yes" : "No",
        entry.skillHitter ? "Yes" : "No",
        entry.skillOther ? "Yes" : "No",
        entry.seasonsList,
        entry.notificationList,
        entry.unavailableDates || "",
        entry.lastDraftSeason || "",
        entry.lastDraftDivision || "",
        entry.lastDraftCaptain || "",
        entry.lastDraftOverall !== null ? String(entry.lastDraftOverall) : ""
    ])

    return buildCsvContent(headers, rows)
}
