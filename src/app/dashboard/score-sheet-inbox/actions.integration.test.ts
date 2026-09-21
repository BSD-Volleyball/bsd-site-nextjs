import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/database/db"
import { scoreSheetReads, scoreSheets } from "@/database/schema"
import { getR2Object } from "@/lib/r2"
import {
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"

import {
    createSheetUpload,
    deleteUploadedSheet,
    finalizeSheetUpload,
    getSheetInbox,
    peekSheetRead,
    readUploadedSheet
} from "./actions"

const NIGHT = "2026-10-05"
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
    return season.id
}

/** Pretend the presigned PUT landed. */
function storeExists() {
    mockedGetR2.mockResolvedValue({
        body: new ReadableStream({
            start(c) {
                c.enqueue(new Uint8Array([1, 2, 3]))
                c.close()
            }
        }),
        contentType: "image/jpeg",
        contentLength: 3
    } as never)
}

describe("score sheet inbox actions", () => {
    beforeEach(() => {
        mockedGetR2.mockReset()
    })

    describe("authorization", () => {
        it("turns away a plain player and a stranger", async () => {
            await seedNight()
            await createUserWithRoles([])

            for (const result of [
                await getSheetInbox(NIGHT),
                await createSheetUpload({ date: NIGHT, contentLength: 100 }),
                await finalizeSheetUpload({ date: NIGHT, objectKey: "x" }),
                await readUploadedSheet({ scoreSheetId: 1 }),
                await peekSheetRead(1),
                await deleteUploadedSheet(1)
            ]) {
                expect(result).toEqual({
                    status: false,
                    message: "Unauthorized."
                })
            }

            logout()
            expect(await getSheetInbox(NIGHT)).toEqual({
                status: false,
                message: "Unauthorized."
            })
        })

        it("lets a referee in, since they may already enter scores", async () => {
            await seedNight()
            await createUserWithRoles([{ role: "referee" }])
            const result = await getSheetInbox(NIGHT)
            expect(result.status).toBe(true)
        })
    })

    describe("uploading", () => {
        it("hands back a presigned target under the night's own prefix", async () => {
            const seasonId = await seedNight()
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
        })

        it("refuses a key belonging to another night", async () => {
            await seedNight()
            await createUserWithRoles([{ role: "admin" }])
            storeExists()

            const result = await finalizeSheetUpload({
                date: NIGHT,
                objectKey: "scoresheets/999/2020-01-01/sheet_x.jpg"
            })
            expect(result).toMatchObject({ status: false })
            expect(result.message).toContain("does not belong")
        })

        it("refuses to record an upload that never arrived", async () => {
            const seasonId = await seedNight()
            await createUserWithRoles([{ role: "admin" }])
            mockedGetR2.mockResolvedValue(null)

            const result = await finalizeSheetUpload({
                date: NIGHT,
                objectKey: `scoresheets/${seasonId}/${NIGHT}/sheet_a.jpg`
            })
            expect(result).toMatchObject({ status: false })
            expect(result.message).toContain("did not complete")
        })

        it("records an arrived upload as pending and lists it", async () => {
            const seasonId = await seedNight()
            await createUserWithRoles([{ role: "admin" }])
            storeExists()

            const key = `scoresheets/${seasonId}/${NIGHT}/sheet_b.jpg`
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

            const inbox = await getSheetInbox(NIGHT)
            expect(inbox.status).toBe(true)
            if (!inbox.status) return
            expect(inbox.data).toHaveLength(1)
            expect(inbox.data[0]).toMatchObject({
                status: "pending",
                court: null,
                imagePath: key
            })
        })
    })

    describe("removing", () => {
        it("deletes an upload and its read together", async () => {
            const seasonId = await seedNight()
            await createUserWithRoles([{ role: "admin" }])
            storeExists()

            const finalized = await finalizeSheetUpload({
                date: NIGHT,
                objectKey: `scoresheets/${seasonId}/${NIGHT}/sheet_c.jpg`
            })
            if (!finalized.status) throw new Error("upload failed")

            expect(
                await deleteUploadedSheet(finalized.data.scoreSheetId)
            ).toMatchObject({ status: true })

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
