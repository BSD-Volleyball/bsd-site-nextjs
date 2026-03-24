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

export function serializeCsvField(value: unknown): string {
    if (value == null) return ""
    const str = String(value)
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}
