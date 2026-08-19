import { describe, expect, it } from "vitest"
import {
    friendsCalendarEvents,
    itemWindow,
    personalCalendarEvents,
    shortNamesFor
} from "./calendar-events"
import type {
    MatchScheduleItem,
    PlayoffPlaceholder,
    ScheduleItem,
    SchedulePerson,
    UserScheduleBundle
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
const kim = person("u-kim", "Kim", "Park")
const pat = person("u-pat", "Pat", "Quinn")

function bundle(
    people: SchedulePerson[],
    items: ScheduleItem[],
    playoffPlaceholders: PlayoffPlaceholder[] = []
): UserScheduleBundle {
    return {
        items,
        playoffPlaceholders,
        people: new Map(people.map((p) => [p.userId, p])),
        seasonLabel: "Fall 2026",
        seasonYear: 2026
    }
}

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

describe("shortNamesFor", () => {
    it("uses preferred name, else first name, untouched when unique", () => {
        const names = shortNamesFor([josh, sam])
        expect(names.get("u-josh")).toBe("Josh")
        expect(names.get("u-sam")).toBe("Sam")
    })

    it("adds a last initial only on collisions", () => {
        const samR = person("u-sam2", "Sam", "Rivera")
        const names = shortNamesFor([josh, sam, samR])
        expect(names.get("u-josh")).toBe("Josh")
        expect(names.get("u-sam")).toBe("Sam L.")
        expect(names.get("u-sam2")).toBe("Sam R.")
    })

    it("falls back to the full last name when initials also collide", () => {
        const samLin = person("u-sam3", "Sam", "Lin")
        const names = shortNamesFor([sam, samLin])
        expect(names.get("u-sam")).toBe("Sam Lee")
        expect(names.get("u-sam3")).toBe("Sam Lin")
    })

    it("collides case-insensitively and on preferred vs first name", () => {
        const preferredSam = person("u-x", "Samuel", "Zed", "sam")
        const names = shortNamesFor([sam, preferredSam])
        expect(names.get("u-sam")).toBe("Sam L.")
        expect(names.get("u-x")).toBe("sam Z.")
    })
})

describe("itemWindow", () => {
    it("defaults a missing start to 19:00 and end to +90 minutes", () => {
        expect(itemWindow({ startTime: null, endTime: null })).toEqual({
            start: "19:00",
            end: "20:30"
        })
        expect(itemWindow({ startTime: "18:00:00", endTime: null })).toEqual({
            start: "18:00",
            end: "19:30"
        })
        expect(
            itemWindow({ startTime: "18:00:00", endTime: "19:15:00" })
        ).toEqual({ start: "18:00", end: "19:15" })
    })
})

describe("personalCalendarEvents", () => {
    it("formats a regular-season match like the legacy download", () => {
        const [ev] = personalCalendarEvents(
            bundle([josh], [match("u-josh")]),
            "u-josh",
            7
        )
        expect(ev.uid).toBe("bsd-match-10@bsd-volleyball.com")
        expect(ev.summary).toBe("BSD: Spikers vs Diggers (Josh)")
        expect(ev.description).toBe(
            "Fall 2026 – Rec\nWeek 4\nSpikers vs Diggers\nCourt 2"
        )
        expect(ev.dateStr).toBe("20261007")
        expect(ev.startTime).toBe("19:00")
        expect(ev.endTime).toBe("20:30")
    })

    it("includes sub pickups, work duty, reffing, tryouts and volunteering", () => {
        const items: ScheduleItem[] = [
            match("u-josh", {
                matchId: 11,
                teamId: 200,
                subbingFor: pat
            }),
            match("u-josh", {
                matchId: 12,
                role: "work",
                playoff: true,
                week: 1,
                date: "2026-11-04"
            }),
            {
                kind: "ref",
                userId: "u-josh",
                date: "2026-10-14",
                startTime: "20:30:00",
                endTime: null,
                court: 5,
                matchId: 13,
                playoff: false,
                divisionName: "Comp",
                homeName: "Netters",
                awayName: "Blockers"
            },
            {
                kind: "tryout",
                userId: "u-josh",
                date: "2026-09-10",
                startTime: "18:00:00",
                endTime: "19:30:00",
                court: 3,
                eventId: 50,
                tryoutNumber: 2,
                session: 1,
                sublabel: "Rec Team 3 (captain)"
            },
            {
                kind: "volunteer",
                userId: "u-josh",
                date: "2026-09-03",
                startTime: "18:00:00",
                endTime: "21:30:00",
                court: null,
                assignmentId: 77,
                eventId: 49,
                tryoutNumber: 1,
                jobName: "Scorekeeper",
                allNight: true,
                courtNumber: null
            }
        ]
        const events = personalCalendarEvents(
            bundle([josh], items),
            "u-josh",
            7
        )
        expect(events.map((e) => e.summary)).toEqual([
            "BSD: Scorekeeper — Tryout 1",
            "BSD: Tryout 2 — Session 1",
            "BSD: Spikers vs Diggers (Josh)",
            "BSD: Ref: Netters vs Blockers",
            "BSD: Work: Spikers vs Diggers (Josh)"
        ])
        expect(events.map((e) => e.uid)).toEqual([
            "bsd-vol-77@bsd-volleyball.com",
            "bsd-tryout-50-u-josh@bsd-volleyball.com",
            "bsd-match-11@bsd-volleyball.com",
            "bsd-ref-13-u-josh@bsd-volleyball.com",
            "bsd-work-12-u-josh@bsd-volleyball.com"
        ])
        expect(events[2].description).toContain("Subbing for Pat Quinn")
        expect(events[4].description).toContain("Playoff Week 1 — work duty")
        expect(events[0].endTime).toBe("21:30")
        expect(events[1].endTime).toBe("19:30")
    })

    it("emits playoff placeholders with the legacy UID and ignores other users", () => {
        const ph: PlayoffPlaceholder = {
            userId: "u-josh",
            eventId: 90,
            date: "2026-11-11",
            playoffWeek: 2,
            startTime: "18:00",
            endTime: "21:00",
            divisionId: 1,
            divisionName: "Rec",
            label: "Playoffs night 2"
        }
        const events = personalCalendarEvents(
            bundle([josh, sam], [match("u-sam")], [ph]),
            "u-josh",
            7
        )
        expect(events).toHaveLength(1)
        expect(events[0].uid).toBe("bsd-playoff-wk2-s7@bsd-volleyball.com")
        expect(events[0].summary).toBe("BSD: Playoff Week 2 (Josh)")
        expect(events[0].description).toBe(
            "Fall 2026 Playoffs – Rec\nPlayoff Week 2\nPlayoffs night 2\nExact match time TBD"
        )
    })
})

describe("friendsCalendarEvents", () => {
    it("groups one slot: teammates, opponents, other matches, refs", () => {
        const items: ScheduleItem[] = [
            match("u-josh"),
            match("u-sam"),
            match("u-alex", { teamId: 200 }),
            match("u-kim", {
                matchId: 20,
                teamId: 300,
                homeTeamId: 300,
                awayTeamId: 400,
                homeName: "Netters",
                awayName: "Blockers",
                divisionName: "Comp",
                court: 5
            }),
            {
                kind: "ref",
                userId: "u-pat",
                date: "2026-10-07",
                startTime: "19:00:00",
                endTime: null,
                court: 5,
                matchId: 20,
                playoff: false,
                divisionName: "Comp",
                homeName: "Netters",
                awayName: "Blockers"
            }
        ]
        const events = friendsCalendarEvents(
            bundle([josh, sam, alex, kim, pat], items),
            "u-josh"
        )
        expect(events).toHaveLength(1)
        const [ev] = events
        expect(ev.summary).toBe("BSD: Josh & Sam vs Alex, Kim, Pat (ref)")
        expect(ev.description).toBe(
            [
                "Josh, Sam — Spikers vs Diggers (Rec, Wk 4) — Court 2",
                "Alex — Diggers vs Spikers (Rec, Wk 4) — Court 2",
                "Kim — Netters vs Blockers (Comp, Wk 4) — Court 5",
                "Pat — Ref: Netters vs Blockers (Comp) — Court 5"
            ].join("\n")
        )
        expect(ev.uid).toBe(
            "bsd-friends-u-josh-20261007-1900@bsd-volleyball.com"
        )
        expect(ev.startTime).toBe("19:00")
        expect(ev.endTime).toBe("20:30")
    })

    it("shows 'A & B' for teammates without an opposing friend and 'A vs B' for opponents", () => {
        const teammates = friendsCalendarEvents(
            bundle([josh, sam], [match("u-josh"), match("u-sam")]),
            "u-josh"
        )
        expect(teammates[0].summary).toBe("BSD: Josh & Sam")

        const opponents = friendsCalendarEvents(
            bundle(
                [josh, alex],
                [match("u-josh"), match("u-alex", { teamId: 200 })]
            ),
            "u-josh"
        )
        expect(opponents[0].summary).toBe("BSD: Josh vs Alex")
    })

    it("tags work duty and subs, and splits different start times into separate events", () => {
        const items: ScheduleItem[] = [
            match("u-josh", {
                matchId: 30,
                playoff: true,
                week: 1,
                date: "2026-11-04"
            }),
            match("u-sam", {
                matchId: 30,
                playoff: true,
                week: 1,
                date: "2026-11-04",
                role: "work",
                teamId: 300
            }),
            match("u-alex", {
                matchId: 31,
                date: "2026-11-04",
                startTime: "20:30:00",
                teamId: 200,
                subbingFor: pat
            })
        ]
        const events = friendsCalendarEvents(
            bundle([josh, sam, alex, pat], items),
            "u-josh"
        )
        expect(events.map((e) => e.summary)).toEqual([
            "BSD: Josh, Sam (work)",
            "BSD: Alex"
        ])
        expect(events[0].description).toBe(
            [
                "Josh — Spikers vs Diggers (Rec, Playoff Wk 1) — Court 2",
                "Sam — Work: Spikers vs Diggers (Rec, Playoff Wk 1) — Court 2"
            ].join("\n")
        )
        expect(events[1].description).toBe(
            "Alex (subbing for Pat) — Diggers vs Spikers (Rec, Wk 4) — Court 2"
        )
    })

    it("lists tryout names plainly and volunteers with (vol)", () => {
        const items: ScheduleItem[] = [
            {
                kind: "tryout",
                userId: "u-kim",
                date: "2026-09-10",
                startTime: "18:00:00",
                endTime: "19:30:00",
                court: 3,
                eventId: 50,
                tryoutNumber: 2,
                session: 1,
                sublabel: null
            },
            {
                kind: "tryout",
                userId: "u-josh",
                date: "2026-09-10",
                startTime: "18:00:00",
                endTime: "19:30:00",
                court: 1,
                eventId: 50,
                tryoutNumber: 2,
                session: 1,
                sublabel: "Rec Team 3 (captain)"
            },
            {
                kind: "volunteer",
                userId: "u-pat",
                date: "2026-09-10",
                startTime: "18:00:00",
                endTime: "21:30:00",
                court: null,
                assignmentId: 77,
                eventId: 50,
                tryoutNumber: 2,
                jobName: "Scorekeeper",
                allNight: true,
                courtNumber: 4
            }
        ]
        const [ev] = friendsCalendarEvents(
            bundle([josh, kim, pat], items),
            "u-josh"
        )
        expect(ev.summary).toBe("BSD: Pat (vol), Josh, Kim")
        expect(ev.description).toBe(
            [
                "Pat — Scorekeeper (Tryout 2) — Court 4",
                "Josh — Tryout 2 Session 1 (Rec Team 3 (captain)) — Court 1",
                "Kim — Tryout 2 Session 1 — Court 3"
            ].join("\n")
        )
        expect(ev.endTime).toBe("21:30")
    })

    it("collapses playoff placeholders into one event per night", () => {
        const ph = (userId: string, divisionName: string, startTime: string) =>
            ({
                userId,
                eventId: 90,
                date: "2026-11-11",
                playoffWeek: 2,
                startTime,
                endTime: "21:00",
                divisionId: 1,
                divisionName,
                label: null
            }) satisfies PlayoffPlaceholder
        const events = friendsCalendarEvents(
            bundle(
                [josh, sam, alex],
                [],
                [ph("u-sam", "Comp", "19:00"), ph("u-josh", "Rec", "18:00")]
            ),
            "u-josh"
        )
        expect(events).toHaveLength(1)
        expect(events[0].summary).toBe("BSD: Playoffs TBD — Josh, Sam")
        expect(events[0].uid).toBe(
            "bsd-friends-playoff-u-josh-90@bsd-volleyball.com"
        )
        expect(events[0].startTime).toBe("18:00")
        expect(events[0].description).toBe(
            "Josh — Playoff Week 2 (Rec) — time TBD\nSam — Playoff Week 2 (Comp) — time TBD"
        )
    })

    it("is order-independent and uses disambiguated names everywhere", () => {
        const samR = person("u-sam2", "Sam", "Rivera")
        const items: ScheduleItem[] = [
            match("u-sam2", { teamId: 200 }),
            match("u-sam")
        ]
        const a = friendsCalendarEvents(bundle([sam, samR], items), "u-sam")
        const b = friendsCalendarEvents(
            bundle([samR, sam], [...items].reverse()),
            "u-sam"
        )
        expect(a).toEqual(b)
        expect(a[0].summary).toBe("BSD: Sam L. vs Sam R.")
        expect(a[0].description).toContain("Sam L. — Spikers vs Diggers")
        expect(a[0].description).toContain("Sam R. — Diggers vs Spikers")
    })
})
