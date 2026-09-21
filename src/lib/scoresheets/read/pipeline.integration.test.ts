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
import { sheetTag } from "../sheet-config"
import { cropId } from "./crops"
import { processScoreSheet } from "./pipeline"
import { labelConfirmedSamples } from "./samples"
import { distort, toJpeg } from "./testing/distort"
import { type GameTruth, synthesizeSheet } from "./testing/synthesize"
import { stubTranscriber } from "./transcriber/stub"

const NIGHT = "2026-10-05"
const SCALE = 3000 / 792
const mockedGetR2 = vi.mocked(getR2Object)

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

async function uploadPhoto(opts: {
    seasonId: number
    matchIds: number[]
    scores: GameTruth[]
    court?: number
    seed?: number
}) {
    const night = await loadScoreSheetNight(opts.seasonId, NIGHT)
    if (!night) throw new Error("night missing")

    const sheet = await synthesizeSheet({
        matchCount: opts.matchIds.length as 1 | 2 | 3 | 4,
        eventType: "regular_season",
        scale: SCALE,
        court: opts.court ?? 1,
        matchIds: opts.matchIds,
        seasonCode: night.seasonCode,
        ordinal: night.ordinal,
        date: NIGHT,
        scores: opts.scores
    })
    const { image } = distort(sheet.image, {
        seed: opts.seed ?? 1,
        perspective: 0.025,
        rotationDeg: 4,
        blurSigma: 1,
        noiseSigma: 4,
        shading: 0.25
    })

    const bytes = toJpeg(image)
    mockedGetR2.mockResolvedValue({
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(bytes)
                controller.close()
            }
        }),
        contentType: "image/jpeg",
        contentLength: bytes.length
    } as never)

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
    return { scoreSheetId: row.id, sheet }
}

/** Both games to the home side, the third left unplayed. */
function twoNil(matchId: number): GameTruth[] {
    return [
        { matchId, team: "home", game: 1, score: 25, win: true },
        { matchId, team: "away", game: 1, score: 19, win: false },
        { matchId, team: "home", game: 2, score: 25, win: true },
        { matchId, team: "away", game: 2, score: 21, win: false }
    ]
}

describe("processScoreSheet", () => {
    beforeEach(() => {
        mockedGetR2.mockReset()
    })

    it("reads an uploaded photo and files it by court", async () => {
        const { seasonId, matchIds } = await seedNight()
        const scores = matchIds.flatMap(twoNil)
        const { scoreSheetId } = await uploadPhoto({
            seasonId,
            matchIds,
            scores
        })

        const truth = new Map<string, number | null>(
            scores.map((g) => [cropId(g.matchId, g.team, g.game), g.score])
        )

        const result = await processScoreSheet({
            scoreSheetId,
            seasonId,
            transcriber: stubTranscriber({ truth })
        })

        expect(result.status).toBe("read")
        expect(result.problems).toEqual([])
        expect(result.read?.matches).toHaveLength(2)
        for (const match of result.read?.matches ?? []) {
            expect(match.homeGamesWon).toBe(2)
            expect(match.winner).toBe("home")
        }

        // The photo filed itself from its own tag
        const [stored] = await db
            .select()
            .from(scoreSheets)
            .where(eq(scoreSheets.id, scoreSheetId))
        expect(stored.court).toBe(1)
    })

    it("stores the read for the review screen", async () => {
        const { seasonId, matchIds } = await seedNight()
        const scores = twoNil(matchIds[0])
        const { scoreSheetId } = await uploadPhoto({
            seasonId,
            matchIds,
            scores
        })
        const truth = new Map<string, number | null>(
            scores.map((g) => [cropId(g.matchId, g.team, g.game), g.score])
        )

        await processScoreSheet({
            scoreSheetId,
            seasonId,
            transcriber: stubTranscriber({ truth })
        })

        const [row] = await db
            .select()
            .from(scoreSheetReads)
            .where(eq(scoreSheetReads.score_sheet_id, scoreSheetId))

        const night = await loadScoreSheetNight(seasonId, NIGHT)
        expect(row.tag).toBe(sheetTag(night as never, 1))
        expect(row.template_version).toBe(2)
        expect(row.attempts).toBe(1)
        expect(row.finished_at).not.toBeNull()
        expect(row.result).not.toBeNull()
    })

    it("reports a photo whose object has gone missing", async () => {
        const { seasonId, matchIds } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({
            seasonId,
            matchIds,
            scores: []
        })
        mockedGetR2.mockResolvedValue(null)

        const result = await processScoreSheet({ scoreSheetId, seasonId })
        expect(result.status).toBe("failed")
        expect(result.problems.join(" ")).toContain("no longer stored")
    })

    it("refuses a fourth attempt", async () => {
        const { seasonId, matchIds } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({
            seasonId,
            matchIds,
            scores: []
        })
        mockedGetR2.mockResolvedValue(null)

        for (let i = 0; i < 3; i++) {
            await processScoreSheet({ scoreSheetId, seasonId })
        }
        const fourth = await processScoreSheet({ scoreSheetId, seasonId })
        expect(fourth.problems.join(" ")).toContain("already been tried")

        const [row] = await db
            .select()
            .from(scoreSheetReads)
            .where(eq(scoreSheetReads.score_sheet_id, scoreSheetId))
        expect(row.attempts).toBe(3)
    })

    it("reads the ticks even with no transcriber configured", async () => {
        const { seasonId, matchIds } = await seedNight()
        const { scoreSheetId } = await uploadPhoto({
            seasonId,
            matchIds,
            scores: twoNil(matchIds[0])
        })

        const result = await processScoreSheet({ scoreSheetId, seasonId })
        // No digits, so it needs a human, but the sheet was still identified
        expect(result.status).toBe("needs_review")
        expect(result.read?.tag).not.toBeNull()
    })
})

describe("the training corpus", () => {
    it("keeps each cropped box and what the reader thought", async () => {
        const { seasonId, matchIds } = await seedNight()
        const scores = twoNil(matchIds[0])
        const { scoreSheetId } = await uploadPhoto({
            seasonId,
            matchIds,
            scores
        })
        const truth = new Map<string, number | null>(
            scores.map((g) => [cropId(g.matchId, g.team, g.game), g.score])
        )

        await processScoreSheet({
            scoreSheetId,
            seasonId,
            transcriber: stubTranscriber({ truth })
        })

        const samples = await db.select().from(scoreSheetScoreSamples)
        // The four boxes that were written in
        expect(samples).toHaveLength(4)
        for (const sample of samples) {
            expect(sample.image_path).toContain("scoresheet-samples/")
            expect(sample.confirmed).toBeNull()
        }
        const first = samples.find(
            (s) => s.crop_id === cropId(matchIds[0], "home", 1)
        )
        expect(first?.predicted).toBe(25)
    })

    it("labels them with the scores that were actually saved", async () => {
        const { seasonId, matchIds } = await seedNight()
        const scores = twoNil(matchIds[0])
        const { scoreSheetId } = await uploadPhoto({
            seasonId,
            matchIds,
            scores
        })
        const truth = new Map<string, number | null>(
            scores.map((g) => [cropId(g.matchId, g.team, g.game), g.score])
        )
        await processScoreSheet({
            scoreSheetId,
            seasonId,
            transcriber: stubTranscriber({ truth })
        })

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

        const labelled = await labelConfirmedSamples([matchIds[0]])
        expect(labelled).toBe(4)

        const samples = await db.select().from(scoreSheetScoreSamples)
        const corrected = samples.find(
            (s) => s.crop_id === cropId(matchIds[0], "home", 1)
        )
        // The label follows what the league believes, not what was predicted
        expect(corrected?.predicted).toBe(25)
        expect(corrected?.confirmed).toBe(27)
    })

    it("leaves a sample unlabelled until its match has a score", async () => {
        const { seasonId, matchIds } = await seedNight()
        const scores = twoNil(matchIds[0])
        const { scoreSheetId } = await uploadPhoto({
            seasonId,
            matchIds,
            scores
        })
        const truth = new Map<string, number | null>(
            scores.map((g) => [cropId(g.matchId, g.team, g.game), g.score])
        )
        await processScoreSheet({
            scoreSheetId,
            seasonId,
            transcriber: stubTranscriber({ truth })
        })

        expect(await labelConfirmedSamples([matchIds[0]])).toBe(0)
        const samples = await db.select().from(scoreSheetScoreSamples)
        expect(samples.every((s) => s.confirmed === null)).toBe(true)
    })
})
