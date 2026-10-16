import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/database/db"
import {
    matches,
    scoreSheetReads,
    scoreSheetScoreSamples,
    scoreSheets
} from "@/database/schema"
import { getR2Object } from "@/lib/r2"
import {
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { createUser, logout } from "@/test/session"

import { buildScoreSheetsPdfBytes } from "../generate"
import { loadScoreSheetNight } from "../load"
import { sheetTag, TEMPLATE_VERSION } from "../sheet-config"
import type { GameReading, PageReader } from "./page-reader"
import { processScoreSheet } from "./pipeline"
import {
    confirmReadsForMatches,
    labelConfirmedSamples,
    sampleId
} from "./samples"
import { tagPhoto } from "./testing/tag-photo"

const NIGHT = "2026-10-05"
const mockedGetR2 = vi.mocked(getR2Object)

const won = (home: number, away: number): GameReading => ({
    home,
    away,
    confidence: "high",
    note: ""
})
const unplayed: GameReading = {
    home: null,
    away: null,
    confidence: "high",
    note: ""
}
/** Both games to the home side, the third left unplayed. */
const TWO_NIL = [won(25, 19), won(25, 21), unplayed]

/**
 * A reader that answers like a model would, and records what it was asked so
 * a test can see the team names the pipeline sent.
 */
function fakeReader(
    name: string,
    opts: { code?: string | null; fail?: boolean } = {}
): PageReader & { asked: string[][] } {
    const asked: string[][] = []
    return {
        name,
        asked,
        async read({ matches }) {
            asked.push(matches.map((m) => `${m.home} v ${m.away}`))
            if (opts.fail) throw new Error("returned 429")
            return {
                model: name,
                sheetCode: opts.code ?? null,
                matches: matches.map(() => TWO_NIL)
            }
        },
        async readCode() {
            return opts.code ?? null
        }
    }
}

const pair = (code?: string | null) => [
    fakeReader("google/gemini-4-argon", { code }),
    fakeReader("openai/gpt-6.1-sol", { code })
]

async function seedNight() {
    const season = await createSeason({ phase: "in_season" })
    const division = await createDivision({ name: "AA", level: 1 })
    await createSeasonEvent(season.id, {
        event_type: "regular_season",
        event_date: NIGHT,
        sort_order: 0
    })

    const captain = await createUser()
    const home = await createTeam({
        season: season.id,
        captain: captain.id,
        division: division.id,
        name: "Home",
        number: 1
    })
    const away = await createTeam({
        season: season.id,
        captain: captain.id,
        division: division.id,
        name: "Away",
        number: 2
    })

    const matchIds: number[] = []
    for (const time of ["19:00:00", "20:10:00"]) {
        const match = await createMatch({
            season: season.id,
            division: division.id,
            week: 3,
            date: NIGHT,
            time,
            court: 1,
            home_team: home.id,
            away_team: away.id
        })
        matchIds.push(match.id)
    }

    // Recording the print is what makes the geometry reproducible
    await buildScoreSheetsPdfBytes(NIGHT)
    logout()
    return { seasonId: season.id, matchIds }
}

async function uploadPhoto(opts: { seasonId: number; court?: number | null }) {
    const night = await loadScoreSheetNight(opts.seasonId, NIGHT)
    if (!night) throw new Error("night missing")

    const court = opts.court === undefined ? 1 : opts.court
    const bytes = tagPhoto(court === null ? null : sheetTag(night, court))
    // A fresh stream per fetch, so a retried read can get the photo again
    mockedGetR2.mockImplementation(
        async () =>
            ({
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(bytes)
                        controller.close()
                    }
                }),
                contentType: "image/jpeg",
                contentLength: bytes.length
            }) as never
    )

    const uploader = await createUser()
    const [row] = await db
        .insert(scoreSheets)
        .values({
            season_id: opts.seasonId,
            division_id: null,
            court: null,
            match_date: NIGHT,
            image_path: `scoresheets/${opts.seasonId}/${NIGHT}/test.jpg`,
            uploaded_by: uploader.id
        })
        .returning()
    logout()
    return { scoreSheetId: row.id }
}

async function storedCourt(scoreSheetId: number) {
    const [stored] = await db
        .select()
        .from(scoreSheets)
        .where(eq(scoreSheets.id, scoreSheetId))
    return stored.court
}

describe("processScoreSheet", () => {
    beforeEach(() => {
        mockedGetR2.mockReset()
    })

    it("reads an uploaded photo and files it by court", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        const night = await loadScoreSheetNight(seasonId, NIGHT)
        // Both readers see the code this court's sheet was printed with
        const readers = pair(`${night?.seasonCode}-W${night?.ordinal}-C1`)

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers
        })

        expect(result.problems).toEqual([])
        expect(result.status).toBe("read")
        expect(result.read?.matches).toHaveLength(2)
        for (const match of result.read?.matches ?? []) {
            expect(match.homeGamesWon).toBe(2)
            expect(match.winner).toBe("home")
        }
        // The readers were told who played, in printed order
        expect(readers[0].asked[0]).toEqual(["Home v Away", "Home v Away"])
        // The photo filed itself from its own tag
        expect(await storedCourt(scoreSheetId)).toBe(1)
    })

    it("stores the read for the review screen", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })

        await processScoreSheet({ scoreSheetId, seasonId, readers: pair() })

        const [row] = await db
            .select()
            .from(scoreSheetReads)
            .where(eq(scoreSheetReads.score_sheet_id, scoreSheetId))

        const night = await loadScoreSheetNight(seasonId, NIGHT)
        expect(row.tag).toBe(sheetTag(night as never, 1))
        expect(row.template_version).toBe(TEMPLATE_VERSION)
        expect(row.transcriber).toBe(
            "google/gemini-4-argon + openai/gpt-6.1-sol"
        )
        expect(row.attempts).toBe(1)
        expect(row.finished_at).not.toBeNull()
        expect(row.result).not.toBeNull()
    })

    it("reads a photo whose QR will not decode from its printed code", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId, court: null })
        const night = await loadScoreSheetNight(seasonId, NIGHT)
        const code = `${night?.seasonCode}-W${night?.ordinal}-C1`

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: pair(code)
        })

        expect(result.problems).toEqual([])
        expect(result.status).toBe("read")
        expect(await storedCourt(scoreSheetId)).toBe(1)
    })

    it("refuses a printed code from some other night", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId, court: null })

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: pair("X99-W9-C1")
        })

        expect(result.status).toBe("unidentified")
        expect(result.problems[0]).toContain("not from this night")
    })

    it("asks which court when neither the QR nor the code can be read", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId, court: null })

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: pair(null)
        })
        expect(result.status).toBe("unidentified")

        // Once an admin names the court, the read goes ahead
        const retry = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: pair(null),
            courtHint: 1
        })
        expect(retry.status).toBe("read")
        expect(await storedCourt(scoreSheetId)).toBe(1)
    })

    it("flags a sheet only one reader could read", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: [
                fakeReader("google/gemini-4-argon"),
                fakeReader("openai/gpt-6.1-sol", { fail: true })
            ]
        })
        expect(result.status).toBe("needs_review")
        expect(result.read?.matches[0].games[0]).toMatchObject({
            home: 25,
            level: "low"
        })
    })

    it("reports a photo whose object has gone missing", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        mockedGetR2.mockResolvedValue(null)

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: pair()
        })
        expect(result.status).toBe("failed")
        expect(result.problems.join(" ")).toContain("no longer stored")
    })

    it("refuses a fourth attempt", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        mockedGetR2.mockResolvedValue(null)

        for (let i = 0; i < 3; i++) {
            await processScoreSheet({ scoreSheetId, seasonId, readers: [] })
        }
        const fourth = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: []
        })
        expect(fourth.problems.join(" ")).toContain("already been tried")

        const [row] = await db
            .select()
            .from(scoreSheetReads)
            .where(eq(scoreSheetReads.score_sheet_id, scoreSheetId))
        expect(row.attempts).toBe(3)
    })

    // Each attempt costs two model calls. Requests that arrive together must
    // share the three attempts, not take three each.
    it("shares the attempts between concurrent reads", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        mockedGetR2.mockResolvedValue(null)

        const results = await Promise.all(
            Array.from({ length: 6 }, () =>
                processScoreSheet({ scoreSheetId, seasonId, readers: [] })
            )
        )

        const [row] = await db
            .select()
            .from(scoreSheetReads)
            .where(eq(scoreSheetReads.score_sheet_id, scoreSheetId))
        // One read in flight at a time, and never more than three in all
        expect(row.attempts).toBeGreaterThanOrEqual(1)
        expect(row.attempts).toBeLessThanOrEqual(3)
        const refused = results.filter((r) =>
            /already been tried|being read right now/.test(r.problems.join(" "))
        )
        expect(refused.length + row.attempts).toBe(results.length)
    })

    it("refuses a photo whose QR names some other night", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        const night = await loadScoreSheetNight(seasonId, NIGHT)
        if (!night) throw new Error("night missing")
        // Last week's court-1 sheet, uploaded under tonight
        const stale = sheetTag(night, 1).replace(NIGHT, "2026-09-28")
        const bytes = tagPhoto(stale)
        mockedGetR2.mockImplementation(
            async () =>
                ({
                    body: new ReadableStream({
                        start(controller) {
                            controller.enqueue(bytes)
                            controller.close()
                        }
                    }),
                    contentType: "image/jpeg",
                    contentLength: bytes.length
                }) as never
        )

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: pair()
        })

        expect(result.status).toBe("unidentified")
        expect(result.problems[0]).toContain("2026-09-28")
        expect(await storedCourt(scoreSheetId)).toBeNull()
    })

    it("still identifies the sheet with no readers configured", async () => {
        const { seasonId } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            readers: []
        })
        // No scores, so it needs a human, but the sheet was still filed
        expect(result.status).toBe("needs_review")
        expect(result.read?.tag).not.toBeNull()
        expect(await storedCourt(scoreSheetId)).toBe(1)
    })
})

describe("the accuracy record", () => {
    beforeEach(() => {
        mockedGetR2.mockReset()
    })

    it("keeps what the readers concluded for each played game", async () => {
        const { seasonId, matchIds } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        await processScoreSheet({ scoreSheetId, seasonId, readers: pair() })

        const samples = await db.select().from(scoreSheetScoreSamples)
        // Two matches, two played games each, both teams; the blank game is left out
        expect(samples).toHaveLength(8)
        for (const sample of samples) {
            expect(sample.image_path).toBe(
                `scoresheets/${seasonId}/${NIGHT}/test.jpg`
            )
            expect(sample.confirmed).toBeNull()
        }
        const first = samples.find(
            (s) => s.crop_id === sampleId(matchIds[0], "home", 1)
        )
        expect(first?.predicted).toBe(25)
    })

    it("labels them with the scores that were actually saved", async () => {
        const { seasonId, matchIds } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        await processScoreSheet({ scoreSheetId, seasonId, readers: pair() })

        // An admin saves a different game-1 score than the reader proposed
        await db
            .update(matches)
            .set({
                home_set1_score: 27,
                away_set1_score: 25,
                home_set2_score: 25,
                away_set2_score: 21
            })
            .where(eq(matches.id, matchIds[0]))

        expect(await labelConfirmedSamples([matchIds[0]])).toBe(4)

        const samples = await db.select().from(scoreSheetScoreSamples)
        const corrected = samples.find(
            (s) => s.crop_id === sampleId(matchIds[0], "home", 1)
        )
        // The label follows what the league believes, not what was predicted
        expect(corrected?.predicted).toBe(25)
        expect(corrected?.confirmed).toBe(27)
    })

    it("confirms the read once its matches' scores are saved", async () => {
        const { seasonId, matchIds } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        await processScoreSheet({ scoreSheetId, seasonId, readers: pair() })
        const admin = await createUser()

        expect(await confirmReadsForMatches([matchIds[0]], admin.id)).toBe(1)
        const [read] = await db
            .select()
            .from(scoreSheetReads)
            .where(eq(scoreSheetReads.score_sheet_id, scoreSheetId))
        expect(read.status).toBe("confirmed")
        expect(read.confirmed_by).toBe(admin.id)

        // Saving again leaves an already-confirmed read alone.
        expect(await confirmReadsForMatches([matchIds[0]], admin.id)).toBe(0)
    })

    it("leaves a sample unlabelled until its match has a score", async () => {
        const { seasonId, matchIds } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({ seasonId })
        await processScoreSheet({ scoreSheetId, seasonId, readers: pair() })

        expect(await labelConfirmedSamples([matchIds[0]])).toBe(0)
        const samples = await db.select().from(scoreSheetScoreSamples)
        expect(samples.every((s) => s.confirmed === null)).toBe(true)
    })
})
