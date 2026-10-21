import { beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import {
    drafts,
    matchReferees,
    matchSubstitutions,
    matches,
    notificationOptouts,
    playoffMatchesMeta,
    userUnavailability
} from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import {
    createDivision,
    createMatch,
    createSeason,
    createSeasonEvent,
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

/**
 * A playoff night shaped like the real bracket's opening: match 1 is seed 2
 * vs seed 3, worked by seed 1; match 2 is seed 1 vs the winner of match 1,
 * worked by its loser. Match 2's teams are unknown the day before.
 */
async function seedPlayoffNight() {
    const season = await createSeason()
    const division = await createDivision()
    const seeds = []
    for (const [rank, name] of [
        [1, "Top Seeds"],
        [2, "Middle Seeds"],
        [3, "Low Seeds"]
    ] as const) {
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            division: division.id,
            captain: captain.id,
            name,
            number: rank,
            rank
        })
        const player = await createUser()
        await db
            .insert(drafts)
            .values({ team: team.id, user: player.id, round: 1, overall: rank })
        seeds.push({ team, player })
    }
    const [s1, s2, s3] = seeds
    const m1 = await createMatch({
        season: season.id,
        division: division.id,
        playoff: true,
        date: TARGET_DATE,
        time: "19:00:00",
        court: 2,
        home_team: s2.team.id,
        away_team: s3.team.id
    })
    const m2 = await createMatch({
        season: season.id,
        division: division.id,
        playoff: true,
        date: TARGET_DATE,
        time: "19:50:00",
        court: 2
    })
    await db.insert(playoffMatchesMeta).values([
        {
            season: season.id,
            division: division.id,
            week: 1,
            match_num: 1,
            match_id: m1.id,
            home_source: "S2",
            away_source: "S3",
            work_source: "S1"
        },
        {
            season: season.id,
            division: division.id,
            week: 1,
            match_num: 2,
            match_id: m2.id,
            home_source: "S1",
            away_source: "W1",
            work_source: "L1"
        }
    ])
    return { season, m2, s1, s2, s3 }
}

function messagesTo(email: string) {
    return mockedSendBatch.mock.calls
        .flatMap((call) => call[0])
        .filter((m) => m.to === email)
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

    it("sends each player one email covering every playoff match they may play or work", async () => {
        const { season, m2, s1, s2, s3 } = await seedPlayoffNight()
        const referee = await createUser()
        await db.insert(matchReferees).values({
            match_id: m2.id,
            referee_id: referee.id,
            season_id: season.id,
            role: "primary"
        })

        const result = await sendGameRemindersForDate(TARGET_DATE)
        expect(result.matches).toBe(2)
        expect(result.playersSent).toBe(3)
        expect(result.refereesSent).toBe(1)
        expect(result.failed).toBe(0)

        // Seed 2 plays match 1, then plays or works match 2 on the result.
        const [middle] = messagesTo(s2.player.email)
        expect(messagesTo(s2.player.email)).toHaveLength(1)
        expect(middle.subject).toContain("7:00")
        expect(middle.htmlBody).toContain("Match #1")
        expect(middle.htmlBody).toContain("If you win match 1")
        expect(middle.htmlBody).toContain("If you lose match 1")
        expect(middle.htmlBody).toContain("#1 Top Seeds")

        // Seed 1 works match 1 and plays match 2 whatever happens.
        const [top] = messagesTo(s1.player.email)
        expect(top.htmlBody).toContain("Work:")
        expect(top.htmlBody).toContain("Winner of #1")
        expect(top.htmlBody).not.toContain("If you")

        expect(messagesTo(s3.player.email)[0].htmlBody).toContain(
            "If you win match 1"
        )
        // Match 2's teams are unknown, but its referee is still reminded.
        expect(messagesTo(referee.email)[0].htmlBody).toContain(
            "#1 Top Seeds vs Winner of #1"
        )
    })

    it("leaves out a team already knocked out of the bracket", async () => {
        const { s2, s3 } = await seedPlayoffNight()
        // Match 1 already decided (seed 3 won): seed 2 only works match 2.
        await db
            .update(matches)
            .set({ winner: s3.team.id, home_score: 0, away_score: 2 })
            .where(eq(matches.home_team, s2.team.id))

        await sendGameRemindersForDate(TARGET_DATE)
        const [middle] = messagesTo(s2.player.email)
        expect(middle.htmlBody).toContain("Work:")
        expect(middle.htmlBody).not.toContain("Play:")
        expect(middle.htmlBody).not.toContain("If you")
    })

    it("sends a referee one email for all their matches that night", async () => {
        const { season, match } = await seedMatchDay()
        const late = await createMatch({
            season: season.id,
            division: match.division,
            date: TARGET_DATE,
            time: "20:40:00",
            court: 3,
            home_team: match.away_team,
            away_team: match.home_team
        })
        const referee = await createUser()
        await db.insert(matchReferees).values(
            [late, match].map((m) => ({
                match_id: m.id,
                referee_id: referee.id,
                season_id: season.id,
                role: "primary"
            }))
        )

        const result = await sendGameRemindersForDate(TARGET_DATE)
        expect(result.refereesSent).toBe(1)
        const sent = messagesTo(referee.email)
        expect(sent).toHaveLength(1)
        expect(sent[0].subject).toContain("7:00")
        expect(sent[0].htmlBody).toContain("referee 2 matches")
        expect(sent[0].htmlBody.indexOf("7:00 PM")).toBeLessThan(
            sent[0].htmlBody.indexOf("8:40 PM")
        )

        // Re-running the night sends nothing more.
        mockedSendBatch.mockClear()
        const again = await sendGameRemindersForDate(TARGET_DATE)
        expect(again.refereesSkipped).toBe(1)
        expect(messagesTo(referee.email)).toHaveLength(0)
    })

    it("shows each player their own and their team's availability for the night", async () => {
        const { season, homePlayer, homeTeam, match } = await seedMatchDay()
        const away = await createUser({
            first_name: "Avery",
            last_name: "Away"
        })
        const covered = await createUser({
            first_name: "Casey",
            last_name: "Covered"
        })
        const sub = await createUser({
            first_name: "Sam",
            last_name: "Sub",
            male: false
        })
        await db.insert(drafts).values([
            { team: homeTeam.id, user: away.id, round: 2, overall: 3 },
            { team: homeTeam.id, user: covered.id, round: 3, overall: 5 }
        ])
        const night = await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: TARGET_DATE
        })
        await db
            .insert(userUnavailability)
            .values({ user_id: away.id, event_id: night.id })
        await db.insert(matchSubstitutions).values({
            match: match.id,
            team: homeTeam.id,
            season: season.id,
            original_user: covered.id,
            sub_user: sub.id,
            performed_by: homePlayer.id
        })

        await sendGameRemindersForDate(TARGET_DATE)

        const [toHome] = messagesTo(homePlayer.email)
        expect(toHome.htmlBody).toContain(
            "marked as <strong>available</strong>"
        )
        expect(toHome.htmlBody).toContain("Who's coming — Home Heroes")
        expect(toHome.htmlBody).toContain("Sam Sub (for Casey Covered)")
        expect(toHome.htmlBody).toMatch(/Not available \(2\)/)
        expect(toHome.htmlBody).toContain("Avery Away")
        expect(toHome.htmlBody).toContain("2 expected")

        expect(messagesTo(away.email)[0].htmlBody).toContain(
            "marked as <strong>not available</strong>"
        )
        expect(messagesTo(covered.email)[0].htmlBody).toContain(
            "Sam Sub is subbing in for you"
        )

        // The sub, who has no team of their own, gets the same night.
        const toSub = messagesTo(sub.email)
        expect(toSub).toHaveLength(1)
        expect(toSub[0].subject).toContain("7:00")
        expect(toSub[0].htmlBody).toContain("subbing in for a match tomorrow")
        expect(toSub[0].htmlBody).toContain(
            "subbing in for <strong>Casey Covered</strong> on Home Heroes"
        )
        expect(toSub[0].htmlBody).toContain("the captain, Test User")
        expect(toSub[0].htmlBody).toContain("Casey Covered (Home Heroes)")
        expect(toSub[0].htmlBody).toContain("Who's coming — Home Heroes")
    })

    it("gives a playoff sub every bracket match the covered team may have", async () => {
        const { season, s2 } = await seedPlayoffNight()
        const [m1] = await db
            .select({ id: matches.id })
            .from(matches)
            .where(eq(matches.home_team, s2.team.id))
        const sub = await createUser()
        await db.insert(matchSubstitutions).values({
            match: m1.id,
            team: s2.team.id,
            season: season.id,
            original_user: s2.player.id,
            sub_user: sub.id,
            performed_by: s2.player.id
        })

        const result = await sendGameRemindersForDate(TARGET_DATE)
        expect(result.playersSent).toBe(4)
        const [toSub] = messagesTo(sub.email)
        expect(toSub.htmlBody).toContain("Match #1")
        expect(toSub.htmlBody).toContain("If you win match 1")
        expect(toSub.htmlBody).toContain("If you lose match 1")
        expect(toSub.htmlBody).toContain("Subbing for:")
    })
})
