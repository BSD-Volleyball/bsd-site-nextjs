import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/database/db"
import {
    individual_divisions,
    scoreSheetReads,
    scoreSheets
} from "@/database/schema"
import { deleteR2Object, headR2Object } from "@/lib/r2"
import {
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"

import { saveScoresForDivision } from "../enter-scores/actions"

import {
    createSheetUpload,
    deleteUploadedSheet,
    finalizeSheetUpload,
    getScoringNight,
    readUploadedSheet
} from "./actions"

const NIGHT = "2026-10-05"
const mockedHeadR2 = vi.mocked(headR2Object)
const mockedDeleteR2 = vi.mocked(deleteR2Object)

/** A key shaped like the one createSheetUpload hands out. */
const sheetKey = (seasonId: number, uuid = crypto.randomUUID()) =>
    `scoresheets/${seasonId}/${NIGHT}/sheet_${uuid}.jpg`

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
        name: "Home"
    })
    await createMatch({
        season: season.id,
        division: division.id,
        week: 1,
        date: NIGHT,
        time: "19:00:00",
        court: 1,
        home_team: home.id
    })
    return { seasonId: season.id, divisionId: division.id, homeId: home.id }
}

/** Pretend the presigned PUT landed. */
function storeExists() {
    mockedHeadR2.mockResolvedValue({
        contentType: "image/jpeg",
        contentLength: 3
    })
}

describe("score sheet inbox actions", () => {
    beforeEach(() => {
        mockedHeadR2.mockReset()
        mockedDeleteR2.mockReset()
    })

    describe("authorization", () => {
        it("turns away a plain player and a stranger", async () => {
            await seedNight()
            await createUserWithRoles([])

            for (const result of [
                await getScoringNight(NIGHT),
                await createSheetUpload({ date: NIGHT, contentLength: 100 }),
                await finalizeSheetUpload({ date: NIGHT, objectKey: "x" }),
                await readUploadedSheet({ scoreSheetId: 1 }),
                await deleteUploadedSheet(1)
            ]) {
                expect(result).toEqual({
                    status: false,
                    message: "Unauthorized."
                })
            }

            logout()
            expect(await getScoringNight(NIGHT)).toEqual({
                status: false,
                message: "Unauthorized."
            })
        })

        it("lets a referee in, since they may already enter scores", async () => {
            await seedNight()
            await createUserWithRoles([{ role: "referee" }])
            const result = await getScoringNight(NIGHT)
            expect(result.status).toBe(true)
        })
    })

    describe("uploading", () => {
        it("hands back a presigned target under the night's own prefix", async () => {
            const { seasonId } = await seedNight()
            await createUserWithRoles([{ role: "admin" }])

            const ticket = await createSheetUpload({
                date: NIGHT,
                contentLength: 500_000
            })
            expect(ticket.status).toBe(true)
            if (!ticket.status) return
            expect(ticket.data.objectKey).toContain(
                `scoresheets/${seasonId}/${NIGHT}/`
            )
            expect(ticket.data.uploadUrl).toContain("presigned")
        })

        it("rejects an oversized photo and a bad date", async () => {
            await seedNight()
            await createUserWithRoles([{ role: "admin" }])

            expect(
                await createSheetUpload({
                    date: NIGHT,
                    contentLength: 50 * 1024 * 1024
                })
            ).toMatchObject({ status: false })
            expect(
                await createSheetUpload({
                    date: "05-10-2026",
                    contentLength: 100
                })
            ).toMatchObject({ status: false })
            // Shaped like a date, but not one
            expect(
                await createSheetUpload({
                    date: "2026-99-99",
                    contentLength: 100
                })
            ).toMatchObject({ status: false })
        })

        it("refuses a key belonging to another night, or not shaped like ours", async () => {
            const { seasonId } = await seedNight()
            await createUserWithRoles([{ role: "admin" }])
            storeExists()

            for (const objectKey of [
                `scoresheets/999/2020-01-01/sheet_${crypto.randomUUID()}.jpg`,
                // Right night, but a name createSheetUpload never issued
                `scoresheets/${seasonId}/${NIGHT}/sheet_x.jpg`,
                `scoresheets/${seasonId}/${NIGHT}/div3_1700000000.jpg`
            ]) {
                const result = await finalizeSheetUpload({
                    date: NIGHT,
                    objectKey
                })
                expect(result).toMatchObject({ status: false })
                expect(result.message).toContain("does not belong")
            }
        })

        it("refuses to record an upload that never arrived", async () => {
            const { seasonId } = await seedNight()
            await createUserWithRoles([{ role: "admin" }])
            mockedHeadR2.mockResolvedValue(null)

            const result = await finalizeSheetUpload({
                date: NIGHT,
                objectKey: sheetKey(seasonId)
            })
            expect(result).toMatchObject({ status: false })
            expect(result.message).toContain("did not complete")
        })

        // Every read costs two model calls and a photo gets three tries, so
        // re-filing one object must not start the count again.
        it("files each uploaded object once", async () => {
            const { seasonId } = await seedNight()
            await createUserWithRoles([{ role: "admin" }])
            storeExists()
            const objectKey = sheetKey(seasonId)

            const first = await finalizeSheetUpload({ date: NIGHT, objectKey })
            expect(first.status).toBe(true)
            const again = await finalizeSheetUpload({ date: NIGHT, objectKey })
            expect(again).toMatchObject({ status: false })
            expect(again.message).toContain("already uploaded")

            expect(
                await db
                    .select()
                    .from(scoreSheets)
                    .where(eq(scoreSheets.image_path, objectKey))
            ).toHaveLength(1)
        })

        it("records an arrived upload as pending and lists it", async () => {
            const { seasonId } = await seedNight()
            await createUserWithRoles([{ role: "admin" }], {
                first_name: "Patricia",
                last_name: "Smith",
                preferred_name: "Pat"
            })
            storeExists()

            const key = sheetKey(seasonId)
            const finalized = await finalizeSheetUpload({
                date: NIGHT,
                objectKey: key
            })
            expect(finalized.status).toBe(true)
            if (!finalized.status) return

            const [read] = await db
                .select()
                .from(scoreSheetReads)
                .where(
                    eq(
                        scoreSheetReads.score_sheet_id,
                        finalized.data.scoreSheetId
                    )
                )
            expect(read.status).toBe("pending")

            const inbox = await getScoringNight(NIGHT)
            expect(inbox.status).toBe(true)
            if (!inbox.status) return
            expect(inbox.data.rows).toHaveLength(1)
            expect(inbox.data.rows[0]).toMatchObject({
                status: "pending",
                court: null,
                imagePath: key,
                uploadedBy: "Pat Smith",
                read: null
            })
        })
    })

    describe("the night", () => {
        it("returns the matches with who saved each, and the photos", async () => {
            const { seasonId, divisionId, homeId } = await seedNight()
            await db.insert(individual_divisions).values({
                season: seasonId,
                division: divisionId,
                gender_split: "5-3",
                teams: 2
            })
            await createUserWithRoles([{ role: "admin" }], {
                first_name: "Robin",
                last_name: "Lee"
            })
            storeExists()
            await finalizeSheetUpload({
                date: NIGHT,
                objectKey: sheetKey(seasonId)
            })

            const before = await getScoringNight(NIGHT)
            expect(before.status).toBe(true)
            if (!before.status) return
            const [match] = before.data.divisions[0].matches
            expect(match.scoresEnteredBy).toBeNull()
            expect(before.data.rows[0].uploadedBy).toBe("Robin Lee")

            await saveScoresForDivision(divisionId, NIGHT, [
                {
                    matchId: match.matchId,
                    homeScore: 2,
                    awayScore: 0,
                    homeSet1Score: 25,
                    awaySet1Score: 20,
                    homeSet2Score: 25,
                    awaySet2Score: 21,
                    homeSet3Score: null,
                    awaySet3Score: null,
                    winner: homeId
                }
            ])
            const after = await getScoringNight(NIGHT)
            if (!after.status) throw new Error(after.message)
            const [saved] = after.data.divisions[0].matches
            expect(saved.scoresEnteredBy).toBe("Robin Lee")
            expect(saved.scoresEnteredAt).not.toBeNull()
        })
    })

    describe("removing", () => {
        it("deletes an upload, its read and the stored photo together", async () => {
            const { seasonId } = await seedNight()
            await createUserWithRoles([{ role: "admin" }])
            storeExists()
            const objectKey = sheetKey(seasonId)

            const finalized = await finalizeSheetUpload({
                date: NIGHT,
                objectKey
            })
            if (!finalized.status) throw new Error("upload failed")

            expect(
                await deleteUploadedSheet(finalized.data.scoreSheetId)
            ).toMatchObject({ status: true })
            // The bucket is public by key, so the object goes too
            expect(mockedDeleteR2).toHaveBeenCalledWith(objectKey)

            expect(
                await db
                    .select()
                    .from(scoreSheets)
                    .where(eq(scoreSheets.id, finalized.data.scoreSheetId))
            ).toHaveLength(0)
            // The read row is cascaded away with it
            expect(
                await db
                    .select()
                    .from(scoreSheetReads)
                    .where(
                        eq(
                            scoreSheetReads.score_sheet_id,
                            finalized.data.scoreSheetId
                        )
                    )
            ).toHaveLength(0)
        })

        it("will not delete another season's upload", async () => {
            // Created first, so the seeded night stays the current season:
            // "current" here means the highest season id.
            const other = await createSeason({ code: "OTHER", year: 2020 })
            await seedNight()
            const uploader = await createUser()
            const [foreign] = await db
                .insert(scoreSheets)
                .values({
                    season_id: other.id,
                    division_id: null,
                    match_date: "2020-01-01",
                    image_path: "scoresheets/x.jpg",
                    uploaded_by: uploader.id
                })
                .returning()

            await createUserWithRoles([{ role: "admin" }])
            expect(await deleteUploadedSheet(foreign.id)).toMatchObject({
                status: false
            })
        })
    })
})
