import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { drafts, matchReferees, notificationOptouts } from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import {
    createDivision,
    createMatch,
    createSeason,
    createTeam
} from "@/test/factories"
import { createUser } from "@/test/session"
import { sendGameRemindersForDate } from "./game-reminders"

const mockedSendBatch = vi.mocked(sendBatchEmails)

const TARGET_DATE = "2026-10-04"

async function seedMatchDay() {
    const season = await createSeason()
    const division = await createDivision()
    const homeCaptain = await createUser()
    const awayCaptain = await createUser()
    const homeTeam = await createTeam({
        season: season.id,
        division: division.id,
        captain: homeCaptain.id,
        name: "Home Heroes"
    })
    const awayTeam = await createTeam({
        season: season.id,
        division: division.id,
        captain: awayCaptain.id,
        name: "Away Aces"
    })
    const homePlayer = await createUser()
    const awayPlayer = await createUser()
    await db.insert(drafts).values([
        { team: homeTeam.id, user: homePlayer.id, round: 1, overall: 1 },
        { team: awayTeam.id, user: awayPlayer.id, round: 1, overall: 2 }
    ])
    const match = await createMatch({
        season: season.id,
        division: division.id,
        date: TARGET_DATE,
        time: "19:00:00",
        court: 3,
        home_team: homeTeam.id,
        away_team: awayTeam.id
    })
    return { season, match, homePlayer, awayPlayer, homeTeam, awayTeam }
}

describe("sendGameRemindersForDate", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("reminds both rosters and assigned referees for tomorrow's matches", async () => {
        const { season, match, homePlayer, awayPlayer } = await seedMatchDay()
        const referee = await createUser()
        await db.insert(matchReferees).values({
            match_id: match.id,
            referee_id: referee.id,
            season_id: season.id,
            role: "primary"
        })

        const result = await sendGameRemindersForDate(TARGET_DATE)
        expect(result.matches).toBe(1)
        expect(result.playersSent).toBe(2)
        expect(result.refereesSent).toBe(1)
        expect(result.failed).toBe(0)

        const sentTo = mockedSendBatch.mock.calls.flatMap((call) =>
            call[0].map((m) => m.to)
        )
        expect(new Set(sentTo)).toEqual(
            new Set([homePlayer.email, awayPlayer.email, referee.email])
        )
        const playerMessage = mockedSendBatch.mock.calls[0][0][0]
        expect(playerMessage.stream).toBe("automated-reminders")
        expect(playerMessage.htmlBody).toContain("Home Heroes")
    })

    it("ignores matches on other dates", async () => {
        await seedMatchDay()
        const result = await sendGameRemindersForDate("2026-10-11")
        expect(result.matches).toBe(0)
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("is idempotent — a second run sends nothing", async () => {
        await seedMatchDay()
        const first = await sendGameRemindersForDate(TARGET_DATE)
        expect(first.playersSent).toBe(2)
        mockedSendBatch.mockClear()

        const second = await sendGameRemindersForDate(TARGET_DATE)
        expect(second.playersSent).toBe(0)
        expect(second.playersSkipped).toBe(2)
        expect(mockedSendBatch).not.toHaveBeenCalled()
    })

    it("honors game-reminder opt-outs", async () => {
        const { homePlayer, awayPlayer } = await seedMatchDay()
        await db.insert(notificationOptouts).values({
            user_id: homePlayer.id,
            notification_type: "game_reminder_player"
        })

        const result = await sendGameRemindersForDate(TARGET_DATE)
        expect(result.playersSent).toBe(1)
        expect(result.playersSkipped).toBe(1)

        const sentTo = mockedSendBatch.mock.calls.flatMap((call) =>
            call[0].map((m) => m.to)
        )
        expect(sentTo).toEqual([awayPlayer.email])
    })
})
