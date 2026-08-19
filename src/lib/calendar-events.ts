/**
 * calendar-events.ts — turns a UserScheduleBundle into iCalendar events.
 *
 * Pure (no db, no server-only) so the naming and slot-grouping rules are
 * unit-testable. Two shapes:
 *  - personal: one VEVENT per activity for a single user.
 *  - friends:  one VEVENT per (date, start time) slot covering the owner and
 *              all their friends, with a short name list in the SUMMARY and
 *              per-person detail lines in the DESCRIPTION.
 *
 * Output is fully sorted so a subscription feed is byte-stable between
 * fetches when nothing changed.
 */

import {
    type CalendarEvent,
    DEFAULT_START_TIME,
    MATCH_DURATION_MINUTES,
    VENUE_LOCATION,
    addMinutes,
    parseTime
} from "@/lib/generate-ical"
import type {
    EventPlaceholder,
    MatchScheduleItem,
    ScheduleItem,
    SchedulePerson,
    UserScheduleBundle
} from "@/lib/schedule-item-types"

const UID_DOMAIN = "bsd-volleyball.com"

const pad2 = (n: number) => String(n).padStart(2, "0")
const hhmm = (t: { hour: number; minute: number }) =>
    `${pad2(t.hour)}:${pad2(t.minute)}`
const toDateStr = (date: string) => date.replace(/-/g, "")

/**
 * Short display names for a set of people: preferred name, else first name.
 * Only when two people in the same calendar share a short name do they get a
 * last initial ("Sam L.", "Sam R."), and a full last name if even that
 * collides.
 */
export function shortNamesFor(
    people: Iterable<SchedulePerson>
): Map<string, string> {
    const list = Array.from(people)
    const base = (p: SchedulePerson) =>
        p.preferredName?.trim() || p.firstName.trim() || "?"
    const groups = new Map<string, SchedulePerson[]>()
    for (const p of list) {
        const key = base(p).toLowerCase()
        const g = groups.get(key) ?? []
        g.push(p)
        groups.set(key, g)
    }
    const out = new Map<string, string>()
    for (const group of groups.values()) {
        if (group.length === 1) {
            out.set(group[0].userId, base(group[0]))
            continue
        }
        const initialGroups = new Map<string, SchedulePerson[]>()
        for (const p of group) {
            const key = (p.lastName.trim()[0] ?? "").toLowerCase()
            const g = initialGroups.get(key) ?? []
            g.push(p)
            initialGroups.set(key, g)
        }
        for (const p of group) {
            const initial = p.lastName.trim()[0] ?? ""
            const sameInitial = initialGroups.get(initial.toLowerCase()) ?? []
            out.set(
                p.userId,
                sameInitial.length > 1 || !initial
                    ? `${base(p)} ${p.lastName.trim()}`.trim()
                    : `${base(p)} ${initial}.`
            )
        }
    }
    return out
}

/** Start/end as "HH:mm", applying the 19:00 / +90 minute defaults. */
export function itemWindow(item: {
    startTime: string | null
    endTime: string | null
}): { start: string; end: string } {
    const start = item.startTime
        ? hhmm(parseTime(item.startTime))
        : DEFAULT_START_TIME
    if (item.endTime) return { start, end: hhmm(parseTime(item.endTime)) }
    const s = parseTime(start)
    return {
        start,
        end: hhmm(addMinutes(s.hour, s.minute, MATCH_DURATION_MINUTES))
    }
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
    return events.sort(
        (a, b) =>
            a.dateStr.localeCompare(b.dateStr) ||
            a.startTime.localeCompare(b.startTime) ||
            a.uid.localeCompare(b.uid)
    )
}

function fullName(p: SchedulePerson): string {
    return `${p.preferredName || p.firstName} ${p.lastName}`
}

function weekLabel(item: Pick<MatchScheduleItem, "playoff" | "week">): string {
    return item.playoff ? `Playoff Week ${item.week}` : `Week ${item.week}`
}

function courtLine(court: number | null): string[] {
    return court !== null ? [`Court ${court}`] : []
}

/** "Tryout 2" / "Week 4" / "Playoff Week 1". */
function placeholderName(ph: Pick<EventPlaceholder, "eventType" | "ordinal">) {
    switch (ph.eventType) {
        case "tryout":
            return `Tryout ${ph.ordinal}`
        case "regular_season":
            return `Week ${ph.ordinal}`
        case "playoff":
            return `Playoff Week ${ph.ordinal}`
    }
}

function placeholderTbd(eventType: EventPlaceholder["eventType"]): string {
    return eventType === "tryout" ? "Exact session TBD" : "Exact match time TBD"
}

// ---------------------------------------------------------------------------
// Personal calendar
// ---------------------------------------------------------------------------

export function personalCalendarEvents(
    bundle: UserScheduleBundle,
    userId: string
): CalendarEvent[] {
    const person = bundle.people.get(userId)
    const name = person ? (shortNamesFor([person]).get(userId) ?? "") : ""
    const season = bundle.seasonLabel
    const events: CalendarEvent[] = []

    for (const item of bundle.items) {
        if (item.userId !== userId) continue
        const { start, end } = itemWindow(item)
        const common = {
            location: VENUE_LOCATION,
            dateStr: toDateStr(item.date),
            startTime: start,
            endTime: end
        }
        switch (item.kind) {
            case "match": {
                const teams = `${item.homeName} vs ${item.awayName}`
                const isWork = item.role === "work"
                const description = [
                    `${season} – ${item.divisionName}`,
                    `${weekLabel(item)}${isWork ? " — work duty" : ""}`,
                    teams,
                    ...courtLine(item.court),
                    ...(item.subbingFor
                        ? [`Subbing for ${fullName(item.subbingFor)}`]
                        : [])
                ]
                events.push({
                    ...common,
                    uid: isWork
                        ? `bsd-work-${item.matchId}-${userId}@${UID_DOMAIN}`
                        : `bsd-match-${item.matchId}@${UID_DOMAIN}`,
                    summary: `BSD: ${isWork ? "Work: " : ""}${teams} (${name})`,
                    description: description.join("\n")
                })
                break
            }
            case "ref": {
                const teams = `${item.homeName} vs ${item.awayName}`
                events.push({
                    ...common,
                    uid: `bsd-ref-${item.matchId}-${userId}@${UID_DOMAIN}`,
                    summary: `BSD: Ref: ${teams}`,
                    description: [
                        `${season} – ${item.divisionName}`,
                        `Ref: ${teams}`,
                        ...courtLine(item.court)
                    ].join("\n")
                })
                break
            }
            case "tryout":
                events.push({
                    ...common,
                    uid: `bsd-tryout-${item.eventId}-${userId}@${UID_DOMAIN}`,
                    summary: `BSD: Tryout ${item.tryoutNumber} — Session ${item.session}`,
                    description: [
                        `${season} Tryouts`,
                        ...(item.sublabel ? [item.sublabel] : []),
                        ...courtLine(item.court)
                    ].join("\n")
                })
                break
            case "volunteer": {
                const title =
                    item.tryoutNumber > 0
                        ? `${item.jobName} — Tryout ${item.tryoutNumber}`
                        : item.jobName
                events.push({
                    ...common,
                    uid: `bsd-vol-${item.assignmentId}@${UID_DOMAIN}`,
                    summary: `BSD: ${title}`,
                    description: [
                        `${season} Tryouts — volunteer`,
                        item.allNight ? "All night" : `Session at ${start}`,
                        ...courtLine(item.courtNumber)
                    ].join("\n")
                })
                break
            }
        }
    }

    for (const ph of bundle.placeholders) {
        if (ph.userId !== userId) continue
        const what = placeholderName(ph)
        const context =
            ph.eventType === "tryout"
                ? `${season} Tryouts`
                : ph.eventType === "playoff"
                  ? `${season} Playoffs${ph.divisionName ? ` – ${ph.divisionName}` : ""}`
                  : `${season}${ph.divisionName ? ` – ${ph.divisionName}` : ""}`
        events.push({
            uid: `bsd-ph-${ph.eventId}-${userId}@${UID_DOMAIN}`,
            summary: `BSD: ${what}${ph.eventType === "regular_season" ? " Game" : ""}${ph.divisionName ? ` (${ph.divisionName})` : ""}`,
            description: [
                context,
                what,
                ph.label ?? "",
                placeholderTbd(ph.eventType)
            ]
                .filter(Boolean)
                .join("\n"),
            location: VENUE_LOCATION,
            dateStr: toDateStr(ph.date),
            startTime: ph.startTime,
            endTime: ph.endTime,
            sequence: ph.stage
        })
    }

    return sortEvents(events)
}

// ---------------------------------------------------------------------------
// Friends calendar
// ---------------------------------------------------------------------------

interface Slot {
    date: string
    start: string
    items: ScheduleItem[]
}

const byName = (names: Map<string, string>) => (a: string, b: string) =>
    (names.get(a) ?? "").localeCompare(names.get(b) ?? "")

function playerLabel(
    item: MatchScheduleItem,
    names: Map<string, string>
): string {
    const n = names.get(item.userId) ?? "?"
    return item.subbingFor
        ? `${n} (subbing for ${
              names.get(item.subbingFor.userId) ??
              item.subbingFor.preferredName ??
              item.subbingFor.firstName
          })`
        : n
}

function matchDetail(
    item: Pick<MatchScheduleItem, "playoff" | "week" | "divisionName" | "court">
): string {
    const wk = item.playoff ? `Playoff Wk ${item.week}` : `Wk ${item.week}`
    const court = item.court !== null ? ` — Court ${item.court}` : ""
    return `(${item.divisionName}, ${wk})${court}`
}

export function friendsCalendarEvents(
    bundle: UserScheduleBundle,
    ownerId: string
): CalendarEvent[] {
    const names = shortNamesFor(bundle.people.values())
    const cmpUser = byName(names)
    const slots = new Map<string, Slot>()

    for (const item of bundle.items) {
        if (!bundle.people.has(item.userId)) continue
        const { start } = itemWindow(item)
        const key = `${item.date}|${start}`
        const slot = slots.get(key) ?? { date: item.date, start, items: [] }
        slot.items.push(item)
        slots.set(key, slot)
    }

    const events: CalendarEvent[] = []

    for (const slot of slots.values()) {
        const end = slot.items
            .map((i) => itemWindow(i).end)
            .sort()
            .at(-1) as string
        const parts: string[] = []
        const lines: string[] = []

        // Matches, grouped by match id.
        const matchItems = slot.items.filter(
            (i): i is MatchScheduleItem => i.kind === "match"
        )
        const matchIds = Array.from(
            new Set(matchItems.map((i) => i.matchId))
        ).sort((a, b) => a - b)
        for (const matchId of matchIds) {
            const group = matchItems.filter((i) => i.matchId === matchId)
            const sample = group[0]
            const play = group
                .filter((i) => i.role === "play")
                .sort((a, b) => cmpUser(a.userId, b.userId))
            const home = play.filter((i) => i.teamId === sample.homeTeamId)
            const away = play.filter((i) => i.teamId !== sample.homeTeamId)
            const homeNames = home.map((i) => names.get(i.userId) ?? "?")
            const awayNames = away.map((i) => names.get(i.userId) ?? "?")
            const label = [homeNames.join(" & "), awayNames.join(" & ")]
                .filter(Boolean)
                .join(" vs ")
            if (label) parts.push(label)
            if (home.length) {
                lines.push(
                    `${home.map((i) => playerLabel(i, names)).join(", ")} — ${sample.homeName} vs ${sample.awayName} ${matchDetail(sample)}`
                )
            }
            if (away.length) {
                lines.push(
                    `${away.map((i) => playerLabel(i, names)).join(", ")} — ${sample.awayName} vs ${sample.homeName} ${matchDetail(sample)}`
                )
            }
            const work = group
                .filter((i) => i.role === "work")
                .sort((a, b) => cmpUser(a.userId, b.userId))
            if (work.length) {
                const workNames = work.map((i) => names.get(i.userId) ?? "?")
                parts.push(`${workNames.join(" & ")} (work)`)
                lines.push(
                    `${workNames.join(", ")} — Work: ${sample.homeName} vs ${sample.awayName} ${matchDetail(sample)}`
                )
            }
        }

        // Reffing.
        const refs = slot.items
            .filter((i) => i.kind === "ref")
            .sort((a, b) => cmpUser(a.userId, b.userId))
        for (const r of refs) {
            const n = names.get(r.userId) ?? "?"
            parts.push(`${n} (ref)`)
            const court = r.court !== null ? ` — Court ${r.court}` : ""
            lines.push(
                `${n} — Ref: ${r.homeName} vs ${r.awayName} (${r.divisionName})${court}`
            )
        }

        // Volunteering.
        const vols = slot.items
            .filter((i) => i.kind === "volunteer")
            .sort((a, b) => cmpUser(a.userId, b.userId))
        const volSeen = new Set<string>()
        for (const v of vols) {
            const n = names.get(v.userId) ?? "?"
            if (!volSeen.has(v.userId)) {
                volSeen.add(v.userId)
                parts.push(`${n} (vol)`)
            }
            const where =
                v.tryoutNumber > 0 ? ` (Tryout ${v.tryoutNumber})` : ""
            const court =
                v.courtNumber !== null ? ` — Court ${v.courtNumber}` : ""
            lines.push(`${n} — ${v.jobName}${where}${court}`)
        }

        // Tryouts.
        const tryouts = slot.items
            .filter((i) => i.kind === "tryout")
            .sort((a, b) => cmpUser(a.userId, b.userId))
        const tryoutSeen = new Set<string>()
        for (const t of tryouts) {
            const n = names.get(t.userId) ?? "?"
            if (!tryoutSeen.has(t.userId)) {
                tryoutSeen.add(t.userId)
                parts.push(n)
            }
            const sub = t.sublabel ? ` (${t.sublabel})` : ""
            const court = t.court !== null ? ` — Court ${t.court}` : ""
            lines.push(
                `${n} — Tryout ${t.tryoutNumber} Session ${t.session}${sub}${court}`
            )
        }

        if (parts.length === 0) continue
        events.push({
            uid: `bsd-friends-${ownerId}-${toDateStr(slot.date)}-${slot.start.replace(":", "")}@${UID_DOMAIN}`,
            summary: `BSD: ${parts.join(", ")}`,
            description: lines.join("\n"),
            location: VENUE_LOCATION,
            dateStr: toDateStr(slot.date),
            startTime: slot.start,
            endTime: end
        })
    }

    // Placeholders: one per unresolved season night, listing the people who
    // are expected there but have no concrete assignment yet.
    const byEvent = new Map<number, EventPlaceholder[]>()
    for (const ph of bundle.placeholders) {
        if (!bundle.people.has(ph.userId)) continue
        const list = byEvent.get(ph.eventId) ?? []
        list.push(ph)
        byEvent.set(ph.eventId, list)
    }
    for (const [eventId, list] of byEvent) {
        const sorted = [...list].sort((a, b) => cmpUser(a.userId, b.userId))
        const start = sorted.map((p) => p.startTime).sort()[0]
        const end = sorted
            .map((p) => p.endTime)
            .sort()
            .at(-1) as string
        const people = Array.from(
            new Set(sorted.map((p) => names.get(p.userId) ?? "?"))
        )
        const sample = sorted[0]
        const what = placeholderName(sample)
        const gamesSuffix =
            sample.eventType === "regular_season" ? " Games" : ""
        events.push({
            uid: `bsd-friends-ph-${ownerId}-${eventId}@${UID_DOMAIN}`,
            summary: `BSD: ${what}${gamesSuffix} TBD — ${people.join(", ")}`,
            description: sorted
                .map(
                    (p) =>
                        `${names.get(p.userId) ?? "?"} — ${placeholderName(p)}${
                            p.divisionName ? ` (${p.divisionName})` : ""
                        } — time TBD`
                )
                .join("\n"),
            location: VENUE_LOCATION,
            dateStr: toDateStr(sample.date),
            startTime: start,
            endTime: end,
            sequence: Math.max(...sorted.map((p) => p.stage))
        })
    }

    return sortEvents(events)
}
