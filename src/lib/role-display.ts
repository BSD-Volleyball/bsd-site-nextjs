// Client-safe display metadata for roles, shared by Manage Roles, View
// Roles, and the admin player detail popup. The authoritative role list
// lives in ROLE_PERMISSIONS (src/lib/permissions.ts); keep these in sync.

import type { Role } from "@/lib/permissions"

export const ROLE_OPTIONS: { value: Role; label: string; seasonal: boolean }[] =
    [
        { value: "admin", label: "Admin", seasonal: false },
        { value: "commissioner", label: "Commissioner", seasonal: true },
        { value: "captain", label: "Captain", seasonal: true },
        { value: "court_manager", label: "Court Manager", seasonal: true },
        { value: "ombudsman", label: "Ombudsman", seasonal: true },
        { value: "referee", label: "Referee", seasonal: true },
        {
            value: "referee_coordinator",
            label: "Referee Coordinator",
            seasonal: true
        },
        {
            value: "leadership_group",
            label: "Leadership Group",
            seasonal: false
        },
        {
            value: "tryout_volunteer",
            label: "Tryout Volunteer",
            seasonal: true
        }
    ]

export const ROLE_BADGE_COLORS: Record<string, string> = {
    admin: "bg-red-100 text-red-800",
    commissioner: "bg-blue-100 text-blue-800",
    captain: "bg-green-100 text-green-800",
    court_manager: "bg-purple-100 text-purple-800",
    ombudsman: "bg-yellow-100 text-yellow-800",
    referee: "bg-orange-100 text-orange-800",
    referee_coordinator: "bg-teal-100 text-teal-800",
    leadership_group: "bg-indigo-100 text-indigo-800",
    tryout_volunteer: "bg-pink-100 text-pink-800"
}

export function roleLabel(role: string): string {
    return (
        ROLE_OPTIONS.find((r) => r.value === role)?.label ??
        role.replace(/_/g, " ")
    )
}
