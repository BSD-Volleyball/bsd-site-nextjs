/**
 * calendar-device.ts — coarse device detection used ONLY to order the
 * "subscribe in …" buttons and pick a hint. Every platform stays available
 * regardless of the guess, so a wrong bucket costs nothing.
 *
 * Pure and client-safe; takes navigator fields as arguments so it is
 * unit-testable with fixture user-agent strings.
 */

import type { CalendarPlatform } from "@/lib/calendar-links"

export type CalendarDevice =
    | "ios-safari"
    | "ios-other"
    | "android"
    | "mac"
    | "windows"
    | "other"

export interface DeviceSignals {
    userAgent: string
    /** navigator.userAgentData?.platform or navigator.platform */
    platform?: string | null
    /** navigator.maxTouchPoints — iPadOS Safari reports a Mac UA. */
    maxTouchPoints?: number
}

export function detectCalendarDevice(signals: DeviceSignals): CalendarDevice {
    const ua = signals.userAgent
    const platform = (signals.platform ?? "").toLowerCase()
    const touch = signals.maxTouchPoints ?? 0

    const isIPadOnMacUa = /Macintosh/.test(ua) && touch > 1
    const isIOS = /iPhone|iPad|iPod/.test(ua) || isIPadOnMacUa
    if (isIOS) {
        // Every iOS browser embeds WebKit and says "Safari", so detect the
        // others by their own tokens.
        const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/.test(
            ua
        )
        return isOtherBrowser ? "ios-other" : "ios-safari"
    }
    if (/Android/.test(ua) || platform === "android") return "android"
    if (/Macintosh|Mac OS X/.test(ua) || platform === "macos") return "mac"
    if (/Windows/.test(ua) || platform === "windows") return "windows"
    return "other"
}

/** Read the signals from a browser `navigator`. */
export function deviceSignalsFromNavigator(nav: Navigator): DeviceSignals {
    const uaData = (
        nav as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData
    return {
        userAgent: nav.userAgent,
        platform: uaData?.platform ?? nav.platform,
        maxTouchPoints: nav.maxTouchPoints
    }
}

export interface DevicePlan {
    /** Platforms in display order; the first is the recommended one. */
    order: CalendarPlatform[]
    /**
     * The bare webcal:// link has no handler here (Android, non-Safari iOS
     * browsers), so show copy-and-add steps instead of a dead button.
     */
    webcalUnsupported: boolean
    /** One-line hint shown under the button row. */
    hint: string
}

const APPLE_HINT =
    "Apple: choose iCloud as the account so it syncs to all your devices, and set Auto-refresh to every hour."
const GOOGLE_HINT =
    "Google refreshes subscribed calendars only every 12–24 hours; once added on the web it syncs to the Google Calendar app."
const OUTLOOK_HINT =
    "Outlook: pick Outlook.com for a personal Microsoft account or Microsoft 365 for work/school. Classic Outlook for Windows: Add Calendar → From Internet, paste the link."

export function devicePlan(device: CalendarDevice): DevicePlan {
    switch (device) {
        case "ios-safari":
        case "mac":
            return {
                order: ["apple", "google", "outlook", "ms365"],
                webcalUnsupported: false,
                hint: APPLE_HINT
            }
        case "ios-other":
            return {
                order: ["apple", "google", "outlook", "ms365"],
                webcalUnsupported: true,
                hint: `This browser can't open Apple Calendar directly — copy the link, then Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar. ${APPLE_HINT}`
            }
        case "android":
            return {
                order: ["google", "outlook", "ms365", "apple"],
                webcalUnsupported: true,
                hint: GOOGLE_HINT
            }
        case "windows":
            return {
                order: ["outlook", "ms365", "google", "apple"],
                webcalUnsupported: false,
                hint: OUTLOOK_HINT
            }
        default:
            return {
                order: ["google", "apple", "outlook", "ms365"],
                webcalUnsupported: false,
                hint: `${GOOGLE_HINT} ${OUTLOOK_HINT}`
            }
    }
}
