/**
 * How the score pages name the people behind a court's result: who
 * photographed the sheet and who saved the scores. Short, because it sits
 * under a card on a phone.
 */

export function shortPersonName(
    firstName: string,
    lastName: string,
    preferredName?: string | null
): string {
    return `${preferredName?.trim() || firstName} ${lastName}`.trim()
}

/** "9:42 PM" in league time, whatever zone renders it (server or phone). */
export function formatEnteredTime(iso: string | null): string | null {
    if (!iso) return null
    const at = new Date(iso)
    if (Number.isNaN(at.getTime())) return null
    return at.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York"
    })
}
