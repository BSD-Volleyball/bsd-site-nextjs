import { formatDisplayName } from "@/lib/utils"

export function formatMatchTime(timeStr: string | null): string {
    if (!timeStr) return ""
    const parts = timeStr.split(":")
    if (parts.length < 2) return timeStr
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (Number.isNaN(h) || Number.isNaN(m)) return timeStr
    const ampm = h >= 12 ? "PM" : "AM"
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
    return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`
}

export function displayName(player: {
    firstName: string
    lastName: string
    preferredName: string | null
}) {
    return formatDisplayName(
        player.firstName,
        player.lastName,
        player.preferredName
    )
}

export function formatDate(dateStr: string): string {
    const date = new Date(`${dateStr}T00:00:00`)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function genderLabel(male: boolean | null): string | null {
    if (male === true) return "Male"
    if (male === false) return "Non-male"
    return null
}

export type RegularLockTarget = {
    matchId: number
    matchDate: string
    originalUserId: string
    originalName: string
    subUserId: string
    subName: string
}

export type PermanentLockTarget = {
    originalUserId: string
    originalName: string
    subUserId: string
    subName: string
}
