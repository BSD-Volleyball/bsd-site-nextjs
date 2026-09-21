/**
 * build.ts — pure grouping of schedule items and presence rows into
 * per-date, per-slot coverage. No database access; load.ts feeds it.
 */

import type { SchedulePerson, ScheduleItem } from "@/lib/schedule-item-types"
import { formatSlotLabel, normalizeTime } from "./format"
import { computeStatus } from "./status"
import type {
    CoverageDate,
    CoveragePerson,
    CoverageSlot,
    CoverageSource,
    OrphanedPresence
} from "./types"

export interface CoverageEventInput {
    eventId: number
    date: string
    eventType: "regular_season" | "playoff"
    label: string | null
}

export interface CoverageMatchInput {
    matchId: number
    date: string
    startTime: string | null
}

export interface PresenceInput {
    id: number
    userId: string
    date: string
    slotTime: string
    note: string | null
}

export interface CoachInput {
    userId: string
    date: string
    startTime: string | null
}

export interface BuildCoverageInput {
    events: CoverageEventInput[]
    matches: CoverageMatchInput[]
    items: ScheduleItem[]
    presence: PresenceInput[]
    /** Coach (captain/captain2) rows for teams in coaches-mode divisions. */
    coaching: CoachInput[]
    /** "userId|eventId" pairs from user_unavailability. */
    unavailable: Set<string>
    people: Map<string, SchedulePerson>
    adminIds: Set<string>
    leadershipIds: Set<string>
}

const SOURCE_ORDER: CoverageSource[] = [
    "play",
    "work",
    "ref",
    "coach",
    "present"
]
const TBD_KEY = "__tbd__"

export function displayName(p: SchedulePerson): string {
    return `${p.preferredName || p.firstName} ${p.lastName}`.trim()
}

function slotKey(t: string | null): string {
    return normalizeTime(t) ?? TBD_KEY
}

interface PersonAccumulator {
    sources: Set<CoverageSource>
    presenceId: number | null
    note: string | null
}

export function buildCoverage(input: BuildCoverageInput): CoverageDate[] {
    const matchesByDate = new Map<string, CoverageMatchInput[]>()
    for (const m of input.matches) {
        const list = matchesByDate.get(m.date) ?? []
        list.push(m)
        matchesByDate.set(m.date, list)
    }
    const itemsByDate = new Map<string, ScheduleItem[]>()
    for (const it of input.items) {
        if (it.kind !== "match" && it.kind !== "ref") continue
        const list = itemsByDate.get(it.date) ?? []
        list.push(it)
        itemsByDate.set(it.date, list)
    }
    const presenceByDate = new Map<string, PresenceInput[]>()
    for (const p of input.presence) {
        const list = presenceByDate.get(p.date) ?? []
        list.push(p)
        presenceByDate.set(p.date, list)
    }
    const coachingByDate = new Map<string, CoachInput[]>()
    for (const c of input.coaching) {
        const list = coachingByDate.get(c.date) ?? []
        list.push(c)
        coachingByDate.set(c.date, list)
    }

    const events = [...input.events].sort((a, b) =>
        a.date.localeCompare(b.date)
    )
    const ordinals = { regular_season: 0, playoff: 0 }
    const out: CoverageDate[] = []

    for (const [index, event] of events.entries()) {
        const nextEventType = events[index + 1]?.eventType ?? null
        ordinals[event.eventType] += 1
        const ordinal = ordinals[event.eventType]
        const matches = matchesByDate.get(event.date) ?? []
        const presenceForDate = presenceByDate.get(event.date) ?? []
        if (matches.length === 0 && presenceForDate.length === 0) continue

        if (matches.length === 0) {
            const orphanedPresence: OrphanedPresence[] = presenceForDate.map(
                (p) => {
                    const person = input.people.get(p.userId)
                    return {
                        presenceId: p.id,
                        userId: p.userId,
                        name: person ? displayName(person) : "Unknown",
                        slotTime: normalizeTime(p.slotTime) ?? p.slotTime,
                        note: p.note
                    }
                }
            )
            const { status, reason } = computeStatus([])
            out.push({
                date: event.date,
                eventId: event.eventId,
                eventType: event.eventType,
                nextEventType,
                ordinal,
                label: event.label,
                matchCount: 0,
                slots: [],
                status,
                reason,
                orphanedPresence
            })
            continue
        }

        // Slots: distinct normalized start times, TBD last.
        const matchCountByKey = new Map<string, number>()
        for (const m of matches) {
            const key = slotKey(m.startTime)
            matchCountByKey.set(key, (matchCountByKey.get(key) ?? 0) + 1)
        }
        const keys = [...matchCountByKey.keys()].sort((a, b) => {
            if (a === TBD_KEY) return 1
            if (b === TBD_KEY) return -1
            return a.localeCompare(b)
        })

        // People per slot.
        const accByKey = new Map<string, Map<string, PersonAccumulator>>()
        const acc = (key: string, userId: string): PersonAccumulator => {
            let byUser = accByKey.get(key)
            if (!byUser) {
                byUser = new Map()
                accByKey.set(key, byUser)
            }
            let a = byUser.get(userId)
            if (!a) {
                a = { sources: new Set(), presenceId: null, note: null }
                byUser.set(userId, a)
            }
            return a
        }

        for (const it of itemsByDate.get(event.date) ?? []) {
            if (it.kind !== "match" && it.kind !== "ref") continue
            const key = slotKey(it.startTime)
            if (!matchCountByKey.has(key)) continue
            const source: CoverageSource =
                it.kind === "ref" ? "ref" : it.role === "work" ? "work" : "play"
            acc(key, it.userId).sources.add(source)
        }

        for (const c of coachingByDate.get(event.date) ?? []) {
            const key = slotKey(c.startTime)
            if (!matchCountByKey.has(key)) continue
            acc(key, c.userId).sources.add("coach")
        }

        const orphanedPresence: OrphanedPresence[] = []
        for (const p of presenceByDate.get(event.date) ?? []) {
            const key = normalizeTime(p.slotTime) ?? TBD_KEY
            const person = input.people.get(p.userId)
            const name = person ? displayName(person) : "Unknown"
            if (!matchCountByKey.has(key) || key === TBD_KEY) {
                orphanedPresence.push({
                    presenceId: p.id,
                    userId: p.userId,
                    name,
                    slotTime: normalizeTime(p.slotTime) ?? p.slotTime,
                    note: p.note
                })
                continue
            }
            const a = acc(key, p.userId)
            a.sources.add("present")
            a.presenceId = p.id
            a.note = p.note
        }

        const slots: CoverageSlot[] = keys.map((key) => {
            const startTime = key === TBD_KEY ? null : key
            const people: CoveragePerson[] = []
            for (const [userId, a] of accByKey.get(key) ?? []) {
                const person = input.people.get(userId)
                const isAdmin = input.adminIds.has(userId)
                const isLeadership = !isAdmin && input.leadershipIds.has(userId)
                const unavailable = input.unavailable.has(
                    `${userId}|${event.eventId}`
                )
                const isPresent = a.sources.has("present")
                // A manual presence row overrides unavailability: someone
                // unable to play (injury) can still cover the gym.
                people.push({
                    userId,
                    name: person ? displayName(person) : "Unknown",
                    counts: isPresent
                        ? isAdmin || isLeadership
                        : isAdmin && !unavailable,
                    isLeadership,
                    unavailable,
                    sources: SOURCE_ORDER.filter((s) => a.sources.has(s)),
                    presenceId: a.presenceId,
                    note: a.note
                })
            }
            people.sort((x, y) => {
                const rank = (p: CoveragePerson) =>
                    p.counts ? 0 : !p.isLeadership ? 1 : 2
                return rank(x) - rank(y) || x.name.localeCompare(y.name)
            })
            return {
                startTime,
                label: formatSlotLabel(startTime),
                matchCount: matchCountByKey.get(key) ?? 0,
                people
            }
        })

        const { status, reason } = computeStatus(slots)
        out.push({
            date: event.date,
            eventId: event.eventId,
            eventType: event.eventType,
            nextEventType,
            ordinal,
            label: event.label,
            matchCount: matches.length,
            slots,
            status,
            reason,
            orphanedPresence
        })
    }
    return out
}
