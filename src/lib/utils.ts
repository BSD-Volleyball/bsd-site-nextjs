import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

// ---------------------------------------------------------------------------
// Player name formatting
// ---------------------------------------------------------------------------

export function formatPlayerName(
    firstName: string,
    lastName: string,
    preferredName?: string | null
): string {
    const preferred = preferredName ? ` (${preferredName})` : ""
    return `${firstName}${preferred} ${lastName}`
}

/**
 * Picker label: the legacy id in brackets (how long-time admins identify
 * players) followed by formatPlayerName, e.g. "[1042] Patricia (Pat) Smith".
 */
export function formatPlayerLabel(
    firstName: string,
    lastName: string,
    preferredName?: string | null,
    oldId?: number | null
): string {
    const name = formatPlayerName(firstName, lastName, preferredName)
    return oldId ? `[${oldId}] ${name}` : name
}

export function formatDisplayName(
    firstName: string,
    lastName: string,
    preferredName?: string | null
): string {
    return `${preferredName || firstName} ${lastName}`.trim()
}

// ---------------------------------------------------------------------------
// Gender split
// ---------------------------------------------------------------------------

export function splitByGender<T extends { male?: boolean | null }>(
    players: T[]
): { males: T[]; nonMales: T[] } {
    return {
        males: players.filter((p) => p.male === true),
        nonMales: players.filter((p) => p.male !== true)
    }
}

/**
 * Parses an `individual_divisions.gender_split` value ("6-2", "5-3", "4-4")
 * into per-team male / non-male counts. Unrecognized or missing values fall
 * back to the league default of 5-3 so callers always get a usable target.
 */
export function parseGenderSplit(genderSplit: string | null | undefined): {
    malePerTeam: number
    nonMalePerTeam: number
} {
    const [male, nonMale] = (genderSplit ?? "").split("-").map(Number)

    if (!Number.isFinite(male) || !Number.isFinite(nonMale)) {
        return { malePerTeam: 5, nonMalePerTeam: 3 }
    }

    return { malePerTeam: male, nonMalePerTeam: nonMale }
}

// ---------------------------------------------------------------------------
// Player picture URL
// ---------------------------------------------------------------------------

export function buildPlayerPictureUrl(
    baseUrl: string,
    picturePath: string | null
): string {
    if (!picturePath) return ""
    if (/^https?:\/\//i.test(picturePath)) return picturePath
    if (!baseUrl) return picturePath
    const normalizedBaseUrl = baseUrl.endsWith("/")
        ? baseUrl.slice(0, -1)
        : baseUrl
    const normalizedPicturePath = picturePath.startsWith("/")
        ? picturePath
        : `/${picturePath}`
    return `${normalizedBaseUrl}${normalizedPicturePath}`
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/** Leading characters a spreadsheet treats as the start of a formula. */
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/

/**
 * One CSV cell. Quotes when the value contains a delimiter, quote or line
 * break, and prefixes an apostrophe when a *string* starts with a formula
 * trigger: these exports carry player-typed text (names, pair reasons,
 * survey answers) that admins open in Excel, where `=HYPERLINK(...)` would
 * otherwise run. Numbers are serialised as given so numeric columns keep
 * their sign.
 */
export function serializeCsvField(value: unknown): string {
    if (value == null) return ""
    let str = String(value)
    if (typeof value === "string" && CSV_FORMULA_PREFIX.test(str)) {
        str = `'${str}`
        return `"${str.replace(/"/g, '""')}"`
    }
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

/**
 * Move `items[fromIndex]` to `toIndex`, shifting everything in between by
 * one. Returns a new array; the input is never mutated.
 */
export function reorder<T>(
    items: T[],
    fromIndex: number,
    toIndex: number
): T[] {
    if (fromIndex === toIndex) {
        return items
    }
    const updated = [...items]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    return updated
}
