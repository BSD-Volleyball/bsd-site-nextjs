export const googleMembershipOptions = [
    { value: "Y", label: "member" },
    { value: "N", label: "not a member" },
    { value: "P", label: "pending member" },
    { value: "B", label: "person has blocked" },
    { value: "E", label: "error" }
] as const

export function getGoogleMembershipLabel(value: string | null | undefined) {
    if (!value) {
        return "—"
    }

    const option = googleMembershipOptions.find((item) => item.value === value)
    return option ? option.label : value
}
