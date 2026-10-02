import { describe, expect, it } from "vitest"
import {
    type CalendarSnapshot,
    renderCalendarFromSnapshot
} from "./calendar-snapshot"
import {
    type MatchScheduleItem,
    type SchedulePerson,
    type UserScheduleBundle,
    deserializeScheduleBundle,
    serializeScheduleBundle
} from "./schedule-item-types"

const person = (
    userId: string,
    firstName: string,
    lastName: string,
    preferredName: string | null = null
): SchedulePerson => ({ userId, firstName, lastName, preferredName })

const josh = person("u-josh", "Joshua", "Lukens", "Josh")
const sam = person("u-sam", "Sam", "Lee")
const alex = person("u-alex", "Alex", "Reyes")

function match(
    userId: string,
    overrides: Partial<MatchScheduleItem> = {}
): MatchScheduleItem {
    return {
        kind: "match",
        userId,
        date: "2026-10-07",
        startTime: "19:00:00",
        endTime: null,
        court: 2,
        matchId: 10,
        role: "play",
        playoff: false,
        week: 4,
        divisionId: 1,
        divisionName: "Rec",
        teamId: 100,
        homeTeamId: 100,
        awayTeamId: 200,
        homeName: "Spikers",
        awayName: "Diggers",
        subbingFor: null,
        ...overrides
    }
}

const bundle: UserScheduleBundle = {
    items: [
        match("u-josh"),
        match("u-sam", { teamId: 200 }),
        match("u-alex", { matchId: 11, date: "2026-10-14", week: 5 })
    ],
    placeholders: [],
    people: new Map([
        [josh.userId, josh],
        [sam.userId, sam],
        [alex.userId, alex]
    ]),
    seasonLabel: "Fall 2026",
    seasonYear: 2026
}

const TOKEN_JOSH = "A".repeat(43)
const TOKEN_SAM = "B".repeat(43)

const snapshot: CalendarSnapshot = {
    seasonId: 7,
    owners: { [TOKEN_JOSH]: "u-josh", [TOKEN_SAM]: "u-sam" },
    friends: { "u-josh": ["u-sam"], "u-sam": ["u-josh"] },
    bundle: serializeScheduleBundle(bundle)
}

const eventCount = (ics: string) => ics.split("BEGIN:VEVENT").length - 1

describe("serializeScheduleBundle / deserializeScheduleBundle", () => {
    it("survives a JSON round trip, Map included", () => {
        const wire = JSON.parse(JSON.stringify(serializeScheduleBundle(bundle)))
        const back = deserializeScheduleBundle(wire)
        expect(back.people).toBeInstanceOf(Map)
        expect(back.people.get("u-josh")).toEqual(josh)
        expect(back.items).toEqual(bundle.items)
        expect(back.seasonLabel).toBe("Fall 2026")
        expect(back.seasonYear).toBe(2026)
    })
})

describe("renderCalendarFromSnapshot", () => {
    it("renders a personal feed with only the owner's items", () => {
        const feed = renderCalendarFromSnapshot(
            snapshot,
            TOKEN_JOSH,
            "personal"
        )
        expect(feed).not.toBeNull()
        expect(feed?.filename).toBe("bsd-schedule-fall-2026.ics")
        expect(eventCount(feed?.ics ?? "")).toBe(1)
        expect(feed?.ics).toContain("Josh")
    })

    it("renders a friends feed from the owner and accepted friends only", () => {
        const feed = renderCalendarFromSnapshot(snapshot, TOKEN_JOSH, "friends")
        // Josh and Sam share one match slot; Alex is in the bundle but is
        // not Josh's friend, so Alex's week-5 match must not appear.
        expect(eventCount(feed?.ics ?? "")).toBe(1)
        expect(feed?.ics).not.toContain("Alex")
    })

    it("returns null for a token the snapshot does not know", () => {
        expect(
            renderCalendarFromSnapshot(snapshot, "C".repeat(43), "personal")
        ).toBeNull()
    })

    it("serves a valid empty calendar between seasons", () => {
        const offSeason: CalendarSnapshot = {
            ...snapshot,
            seasonId: null,
            bundle: null
        }
        const feed = renderCalendarFromSnapshot(
            offSeason,
            TOKEN_JOSH,
            "personal"
        )
        expect(feed?.ics).toContain("BEGIN:VCALENDAR")
        expect(eventCount(feed?.ics ?? "")).toBe(0)
        expect(feed?.filename).toBe("bsd-personal.ics")
    })
})
