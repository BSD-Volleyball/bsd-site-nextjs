/**
 * iCalendar (.ics) file generation utilities.
 * Produces RFC 5545-compliant output with America/New_York timezone.
 */

const VENUE_LOCATION =
    "Adventist HealthCare Fieldhouse, 18031 Central Park Circle, Boyds, MD 20841"

export interface CalendarEvent {
    uid: string
    summary: string
    description: string
    location: string
    /** YYYYMMDD */
    dateStr: string
    /** HH:mm (24-hour) */
    startTime: string
    /** HH:mm (24-hour) */
    endTime: string
}

/** Fold lines longer than 75 octets per RFC 5545 §3.1 */
function foldLine(line: string): string {
    const MAX = 75
    if (line.length <= MAX) return line
    const parts: string[] = [line.slice(0, MAX)]
    let i = MAX
    while (i < line.length) {
        parts.push(` ${line.slice(i, i + MAX - 1)}`)
        i += MAX - 1
    }
    return parts.join("\r\n")
}

/** Escape special characters for iCal text values */
function escapeText(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\n/g, "\\n")
}

function formatDtstamp(): string {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
}

/**
 * Parse a time string from the DB (24-hour HH:mm or HH:mm:ss).
 */
export function parseTime(time: string): { hour: number; minute: number } {
    const parts = time.split(":")
    const hour = Number.parseInt(parts[0], 10)
    const minute = Number.parseInt(parts[1] ?? "0", 10)
    return { hour, minute }
}

export function buildICalendar(events: CalendarEvent[]): string {
    const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BSD Volleyball//Schedule//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:BSD Volleyball Schedule",
        "X-WR-TIMEZONE:America/New_York",
        // VTIMEZONE – America/New_York (DST rules since 2007)
        "BEGIN:VTIMEZONE",
        "TZID:America/New_York",
        "BEGIN:DAYLIGHT",
        "TZOFFSETFROM:-0500",
        "TZOFFSETTO:-0400",
        "TZNAME:EDT",
        "DTSTART:19700308T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:-0400",
        "TZOFFSETTO:-0500",
        "TZNAME:EST",
        "DTSTART:19701101T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
        "END:STANDARD",
        "END:VTIMEZONE"
    ]

    const dtstamp = formatDtstamp()

    for (const event of events) {
        const pad2 = (n: number) => String(n).padStart(2, "0")
        const startParts = event.startTime.split(":")
        const endParts = event.endTime.split(":")
        const dtstart = `${event.dateStr}T${pad2(Number(startParts[0]))}${pad2(Number(startParts[1]))}00`
        const dtend = `${event.dateStr}T${pad2(Number(endParts[0]))}${pad2(Number(endParts[1]))}00`

        lines.push(
            "BEGIN:VEVENT",
            foldLine(`UID:${event.uid}`),
            `DTSTAMP:${dtstamp}`,
            `DTSTART;TZID=America/New_York:${dtstart}`,
            `DTEND;TZID=America/New_York:${dtend}`,
            foldLine(`SUMMARY:${escapeText(event.summary)}`),
            foldLine(`LOCATION:${escapeText(event.location)}`),
            foldLine(`DESCRIPTION:${escapeText(event.description)}`),
            "STATUS:CONFIRMED",
            "TRANSP:OPAQUE",
            "END:VEVENT"
        )
    }

    lines.push("END:VCALENDAR")
    return lines.join("\r\n")
}

/** Helper to compute end time given a start HH:mm and duration in minutes */
export function addMinutes(
    hour: number,
    minute: number,
    durationMinutes: number
): { hour: number; minute: number } {
    const totalMinutes = hour * 60 + minute + durationMinutes
    return {
        hour: Math.floor(totalMinutes / 60) % 24,
        minute: totalMinutes % 60
    }
}

export { VENUE_LOCATION }
