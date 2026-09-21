import { PDFDocument } from "pdf-lib"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/database/db"
import { matchReferees, playoffMatchesMeta } from "@/database/schema"
import { sendCoverageDigestForDate } from "@/lib/notifications/coverage-digest"
import { sendBatchEmails } from "@/lib/postmark"
import {
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"

import { buildScoreSheetsPdfBytes, generateScoreSheetsPdf } from "./generate"
import { loadScoreSheetNight } from "./load"

const NIGHT = "2026-10-05"
const mockedSendBatch = vi.mocked(sendBatchEmails)

/**
 * The real generator is used everywhere except the one test that needs the
 * sheet build to fail, so the digest's "never let the attachment break the
 * email" guarantee can be exercised for real.
 */
let failSheetBuild = false
vi.mock("./generate", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./generate")>()
    return {
        ...actual,
        buildScoreSheetsPdfBytes: async (date: string) => {
            if (failSheetBuild) throw new Error("render exploded")
            return actual.buildScoreSheetsPdfBytes(date)
        }
    }
})

interface Seeded {
    seasonId: number
    divisionAA: number
    divisionA: number
    refName: string
}

/**
 * Three regular-season nights so the third one's ordinal is a real "Week 3"
 * rather than an artefact of being the only event.
 */
async function seedRegularNight(): Promise<Seeded> {
    const season = await createSeason({ phase: "in_season" })
    const divisionAA = (await createDivision({ name: "AA", level: 1 })).id
    const divisionA = (await createDivision({ name: "A", level: 2 })).id

    for (const [index, date] of ["2026-09-21", "2026-09-28", NIGHT].entries()) {
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: date,
            sort_order: index
        })
    }

    const captain = await createUser({
        first_name: "Jordan",
        last_name: "Rivera",
        preferred_name: "Jo"
    })
    const coCaptain = await createUser({
        first_name: "Sam",
        last_name: "Okonkwo"
    })

    const teamA = await createTeam({
        season: season.id,
        captain: captain.id,
        captain2: coCaptain.id,
        division: divisionAA,
        name: "Spike Force",
        number: 1
    })
    const teamB = await createTeam({
        season: season.id,
        captain: coCaptain.id,
        division: divisionAA,
        name: "Net Profit",
        number: 2
    })
    const teamC = await createTeam({
        season: season.id,
        captain: captain.id,
        division: divisionA,
        name: "Dig It",
        number: 1
    })
    const teamD = await createTeam({
        season: season.id,
        captain: coCaptain.id,
        division: divisionA,
        name: "Block Party",
        number: 2
    })

    // Court 1 hosts two matches, court 2 hosts one.
    const first = await createMatch({
        season: season.id,
        division: divisionAA,
        week: 3,
        date: NIGHT,
        time: "19:00:00",
        court: 1,
        home_team: teamA.id,
        away_team: teamB.id
    })
    await createMatch({
        season: season.id,
        division: divisionAA,
        week: 3,
        date: NIGHT,
        time: "20:10:00",
        court: 1,
        home_team: teamB.id,
        away_team: teamA.id
    })
    await createMatch({
        season: season.id,
        division: divisionA,
        week: 3,
        date: NIGHT,
        time: "19:00:00",
        court: 2,
        home_team: teamC.id,
        away_team: teamD.id
    })

    const referee = await createUser({
        first_name: "Casey",
        last_name: "Lindqvist"
    })
    await db.insert(matchReferees).values({
        match_id: first.id,
        referee_id: referee.id,
        season_id: season.id,
        role: "primary"
    })

    logout()
    return {
        seasonId: season.id,
        divisionAA,
        divisionA,
        refName: "Casey Lindqvist"
    }
}

async function pageCountOf(response: Response): Promise<number> {
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-")
    const doc = await PDFDocument.load(bytes)
    return doc.getPageCount()
}

describe("loadScoreSheetNight", () => {
    it("groups a night into one sheet per court, matches in time order", async () => {
        const seeded = await seedRegularNight()
        const night = await loadScoreSheetNight(seeded.seasonId, NIGHT)

        expect(night).not.toBeNull()
        if (!night) return

        expect(night.courts.map((c) => c.court)).toEqual([1, 2])
        expect(night.courts[0].matches).toHaveLength(2)
        expect(night.courts[1].matches).toHaveLength(1)

        const [early, late] = night.courts[0].matches
        expect(early.time).toBe("19:00:00")
        expect(late.time).toBe("20:10:00")
        expect(early.orderOnCourt).toBe(1)
        expect(late.orderOnCourt).toBe(2)
    })

    it("labels the night by counting events of its own type", async () => {
        const seeded = await seedRegularNight()
        const night = await loadScoreSheetNight(seeded.seasonId, NIGHT)

        expect(night?.eventType).toBe("regular_season")
        expect(night?.ordinal).toBe(3)
        expect(night?.nightLabel).toContain("Week 3")
        expect(night?.seasonCode).toBe("F26")
    })

    it("pre-fills teams, captains and the assigned referee", async () => {
        const seeded = await seedRegularNight()
        const night = await loadScoreSheetNight(seeded.seasonId, NIGHT)
        const match = night?.courts[0].matches[0]

        expect(match?.home.name).toBe("Spike Force")
        expect(match?.away.name).toBe("Net Profit")
        // Preferred name wins, and the co-captain is listed too
        expect(match?.home.captains).toEqual(["Jo Rivera", "Sam Okonkwo"])
        expect(match?.home.isPlaceholder).toBe(false)
        expect(match?.referee).toBe(seeded.refName)

        // The second match on the court has no referee assigned
        expect(night?.courts[0].matches[1].referee).toBeNull()
    })

    it("returns null for a date with no matches", async () => {
        const seeded = await seedRegularNight()
        expect(
            await loadScoreSheetNight(seeded.seasonId, "2026-12-25")
        ).toBeNull()
    })

    it("prints a bracket label when a playoff team is not known yet", async () => {
        const season = await createSeason({ phase: "in_season" })
        const division = await createDivision({ name: "BB", level: 5 })
        await createSeasonEvent(season.id, {
            event_type: "playoff",
            event_date: NIGHT,
            sort_order: 0
        })

        const captain = await createUser()
        const known = await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id,
            name: "Top Seed",
            number: 1
        })
        const workTeam = await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id,
            name: "Bench Crew",
            number: 2
        })

        const match = await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: NIGHT,
            time: "19:00:00",
            court: 5,
            playoff: true,
            home_team: known.id,
            away_team: null
        })
        await db.insert(playoffMatchesMeta).values({
            season: season.id,
            division: division.id,
            week: 1,
            match_num: 2,
            match_id: match.id,
            bracket: "winners",
            home_source: "S1",
            away_source: "W1",
            work_team: workTeam.id,
            work_source: "L1"
        })

        logout()
        const night = await loadScoreSheetNight(season.id, NIGHT)
        const loaded = night?.courts[0].matches[0]

        expect(night?.eventType).toBe("playoff")
        expect(loaded?.home.name).toBe("Top Seed")
        expect(loaded?.away.name).toBe("Winner of M1")
        expect(loaded?.away.isPlaceholder).toBe(true)
        expect(loaded?.away.captains).toEqual([])
        expect(loaded?.playoffMatchNum).toBe(2)
        expect(loaded?.workTeam).toBe("Bench Crew")
    })

    it("puts matches with no court on a trailing sheet", async () => {
        const season = await createSeason({ phase: "in_season" })
        const division = await createDivision({ name: "AA", level: 1 })
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: NIGHT,
            sort_order: 0
        })
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id,
            name: "Only Team"
        })

        await createMatch({
            season: season.id,
            division: division.id,
            date: NIGHT,
            time: "19:00:00",
            court: 3,
            home_team: team.id
        })
        await createMatch({
            season: season.id,
            division: division.id,
            date: NIGHT,
            court: null,
            home_team: team.id
        })

        logout()
        const night = await loadScoreSheetNight(season.id, NIGHT)
        expect(night?.courts.map((c) => c.court)).toEqual([3, null])
    })
})

describe("generateScoreSheetsPdf", () => {
    it("denies a captain and an unauthenticated caller", async () => {
        await seedRegularNight()

        const captain = await createUserWithRoles([{ role: "captain" }])
        expect((await generateScoreSheetsPdf(NIGHT, captain.id)).status).toBe(
            403
        )

        expect(
            (await generateScoreSheetsPdf(NIGHT, "no-such-user")).status
        ).toBe(403)
    })

    it("produces one page per court for an admin", async () => {
        await seedRegularNight()
        const admin = await createUserWithRoles([{ role: "admin" }])

        const response = await generateScoreSheetsPdf(NIGHT, admin.id)
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toContain(
            "application/pdf"
        )
        expect(response.headers.get("content-disposition")).toContain(
            `scoresheets-${NIGHT}.pdf`
        )
        expect(await pageCountOf(response)).toBe(2)
    })

    it("rejects a malformed date before touching the database", async () => {
        await seedRegularNight()
        const admin = await createUserWithRoles([{ role: "admin" }])
        expect(
            (await generateScoreSheetsPdf("05-10-2026", admin.id)).status
        ).toBe(400)
    })

    it("reports a night with no matches rather than an empty pdf", async () => {
        await seedRegularNight()
        const admin = await createUserWithRoles([{ role: "admin" }])
        expect(
            (await generateScoreSheetsPdf("2026-12-25", admin.id)).status
        ).toBe(404)
    })
})

describe("buildScoreSheetsPdfBytes", () => {
    it("names the file after the night", async () => {
        await seedRegularNight()
        const result = await buildScoreSheetsPdfBytes(NIGHT)

        expect(result).not.toBeNull()
        expect(result?.fileName).toBe(`scoresheets-${NIGHT}.pdf`)
        expect(result?.bytes.length).toBeGreaterThan(1000)
    })

    it("returns null for a night with no matches", async () => {
        await seedRegularNight()
        expect(await buildScoreSheetsPdfBytes("2026-12-25")).toBeNull()
        expect(await buildScoreSheetsPdfBytes("not-a-date")).toBeNull()
    })
})

describe("coverage digest attachment", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("attaches the night's score sheets for every admin", async () => {
        await seedRegularNight()
        // Two admins on purpose: the batch transport has to carry the
        // attachment, and an earlier version silently dropped the whole
        // send whenever an attachment met more than one recipient.
        await createUserWithRoles([{ role: "admin" }])
        await createUserWithRoles([{ role: "admin" }])
        logout()

        const result = await sendCoverageDigestForDate(NIGHT)
        expect(result.sent).toBe(2)
        expect(result.failed).toBe(0)
        expect(result.skipped).toBe(0)

        expect(mockedSendBatch).toHaveBeenCalledTimes(1)
        const messages = mockedSendBatch.mock.calls[0][0]
        expect(messages).toHaveLength(2)
        for (const message of messages) {
            expect(message.attachments).toHaveLength(1)
            expect(message.attachments?.[0].name).toBe(
                `scoresheets-${NIGHT}.pdf`
            )
            expect(message.attachments?.[0].contentType).toBe("application/pdf")
            expect(message.attachments?.[0].content.length).toBeGreaterThan(
                1000
            )
            expect(message.htmlBody).toContain("Attached")
        }
    })

    it("still sends the digest when the sheets cannot be built", async () => {
        await seedRegularNight()
        await createUserWithRoles([{ role: "admin" }])
        logout()

        failSheetBuild = true
        try {
            const result = await sendCoverageDigestForDate(NIGHT)
            // The coverage information is the point; the PDF is a convenience
            expect(result.sent).toBe(1)
            expect(result.failed).toBe(0)
        } finally {
            failSheetBuild = false
        }

        const messages = mockedSendBatch.mock.calls[0][0]
        expect(messages[0].attachments).toBeUndefined()
        expect(messages[0].htmlBody).not.toContain("Attached")
    })
})
