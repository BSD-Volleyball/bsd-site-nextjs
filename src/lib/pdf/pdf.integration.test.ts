import { PDFDocument } from "pdf-lib"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { week1Rosters, week2Rosters } from "@/database/schema"
import { generateWeekNametagsPdf } from "@/lib/pdf/nametags"
import { generateTryoutSheetsPdf } from "@/lib/pdf/tryout-sheets"
import { generateWeek1TryoutSheetsPdf } from "@/lib/pdf/tryout-sheets-week1"
import {
    createDivision,
    createEventTimeSlot,
    createSeason,
    createSeasonEvent
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"

// Smoke tests: the layout math in these generators is not asserted — only
// that authorized requests produce a parseable PDF and unauthorized ones
// are rejected.

async function seedWeek2Fixture() {
    const season = await createSeason({ phase: "prep_tryout_week_2" })
    const division = await createDivision({ name: "AA", level: 1 })
    // Both generators read the week-2 tryout event (index 1) and its slots
    for (const [i, date] of [
        "2026-09-05",
        "2026-09-12",
        "2026-09-19"
    ].entries()) {
        const event = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: date,
            sort_order: i
        })
        await createEventTimeSlot(event.id, { start_time: "18:00" })
        await createEventTimeSlot(event.id, {
            start_time: "19:30",
            sort_order: 1
        })
    }

    for (let team = 1; team <= 2; team++) {
        for (let slot = 0; slot < 3; slot++) {
            const player = await createUser()
            await db.insert(week2Rosters).values({
                season: season.id,
                user: player.id,
                division: division.id,
                team_number: team,
                is_captain: slot === 0
            })
        }
    }
    return { season, division }
}

async function expectPdfResponse(response: Response) {
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/pdf")
    const bytes = new Uint8Array(await response.arrayBuffer())
    const header = new TextDecoder().decode(bytes.slice(0, 5))
    expect(header).toBe("%PDF-")
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(0)
}

describe("generateWeekNametagsPdf", () => {
    beforeEach(seedWeek2Fixture)

    it("denies non-admin users", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const response = await generateWeekNametagsPdf(2)
        expect(response.status).toBe(403)
    })

    it("produces a parseable PDF for admins", async () => {
        await createUserWithRoles([{ role: "admin" }])
        await expectPdfResponse(await generateWeekNametagsPdf(2))
    })
})

describe("generateWeekNametagsPdf (week 1)", () => {
    async function seedWeek1Fixture() {
        const season = await createSeason({ phase: "prep_tryout_week_1" })
        const event = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: "2026-09-05",
            sort_order: 0
        })
        await createEventTimeSlot(event.id, { start_time: "18:00" })
        await createEventTimeSlot(event.id, {
            start_time: "19:30",
            sort_order: 1
        })

        // Sessions 1 and 2 get real players; session 3 rows are alternates
        for (const sessionNumber of [1, 2, 3]) {
            const player = await createUser()
            await db.insert(week1Rosters).values({
                season: season.id,
                user: player.id,
                session_number: sessionNumber,
                court_number: 1
            })
        }
    }

    beforeEach(seedWeek1Fixture)

    it("denies non-admin users", async () => {
        await createUserWithRoles([{ role: "captain" }])
        const response = await generateWeekNametagsPdf(1)
        expect(response.status).toBe(403)
    })

    it("produces a PDF for sessions 1-2 only, excluding alternates", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const response = await generateWeekNametagsPdf(1)
        expect(response.status).toBe(200)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const doc = await PDFDocument.load(bytes)
        // One page per session with players; a session-3 page would mean
        // alternates leaked into the nametags
        expect(doc.getPageCount()).toBe(2)
    })

    it("generateWeek1TryoutSheetsPdf produces a parseable PDF in phase", async () => {
        await createUserWithRoles([{ role: "admin" }])
        await expectPdfResponse(await generateWeek1TryoutSheetsPdf())
    })

    it("generateWeek1TryoutSheetsPdf rejects the wrong phase", async () => {
        await createSeason({ phase: "draft", year: 2027 })
        await createUserWithRoles([{ role: "admin" }])
        const response = await generateWeek1TryoutSheetsPdf()
        expect(response.status).toBeGreaterThanOrEqual(400)
    })
})

describe("generateTryoutSheetsPdf", () => {
    beforeEach(seedWeek2Fixture)

    it("denies users without captain-pages access", async () => {
        await createUserWithRoles([])
        const response = await generateTryoutSheetsPdf(2)
        expect(response.status).toBe(403)
    })

    it("rejects requests outside the matching prep phase", async () => {
        // A newer season in the wrong phase becomes current
        await createSeason({ phase: "draft", year: 2027 })
        await createUserWithRoles([{ role: "admin" }])
        const response = await generateTryoutSheetsPdf(2)
        expect(response.status).toBeGreaterThanOrEqual(400)
    })

    it("produces a parseable PDF during prep_tryout_week_2", async () => {
        await createUserWithRoles([{ role: "admin" }])
        await expectPdfResponse(await generateTryoutSheetsPdf(2))
    })
})
