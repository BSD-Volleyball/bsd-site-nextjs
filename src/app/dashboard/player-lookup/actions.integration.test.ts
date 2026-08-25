import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    drafts,
    emailSuppressions,
    matchReferees,
    matchSubstitutions,
    substitutions,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
    userRoles,
    week1Rosters,
    week2Rosters
} from "@/database/schema"
import { getLeagueDateString } from "@/lib/date-utils"
import {
    createDivision,
    createEventTimeSlot,
    createMatch,
    createSeason,
    createSeasonEvent,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import {
    getPlayerAnalytics,
    getPlayerDetails,
    getPlayerRoles,
    getPlayerSchedule
} from "./actions"

// One recorded match: the target player's team sweeps 2-0, so career stats
// should read 1-0 in matches, 2-0 in sets, and the player should pick up an
// ELO history point.
async function seedOneMatch() {
    const season = await createSeason()
    const division = await createDivision({ name: "A", level: 2 })
    const winner = await createUser()
    const loser = await createUser()
    const captain = await createUser()

    const homeTeam = await createTeam({
        season: season.id,
        division: division.id,
        captain: captain.id,
        name: "Home"
    })
    const awayTeam = await createTeam({
        season: season.id,
        division: division.id,
        captain: captain.id,
        name: "Away"
    })
    await db.insert(drafts).values([
        { team: homeTeam.id, user: winner.id, round: 1, overall: 1 },
        { team: awayTeam.id, user: loser.id, round: 1, overall: 2 }
    ])
    await createMatch({
        season: season.id,
        division: division.id,
        week: 1,
        home_team: homeTeam.id,
        away_team: awayTeam.id,
        winner: homeTeam.id,
        home_set1_score: 25,
        away_set1_score: 18,
        home_set2_score: 25,
        away_set2_score: 20
    })

    return { winner, loser }
}

describe("getPlayerAnalytics", () => {
    it("returns career stats and rating history for an admin", async () => {
        const { winner } = await seedOneMatch()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerAnalytics(winner.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.careerStats.matchWins).toBe(1)
        expect(result.data.careerStats.matchLosses).toBe(0)
        expect(result.data.careerStats.setWins).toBe(2)
        expect(result.data.careerStats.setLosses).toBe(0)
        expect(result.data.eloHistory).toHaveLength(1)
        expect(result.data.currentRating).not.toBeNull()
        expect(result.data.allSeasons.length).toBeGreaterThan(0)
    })

    it("counts the losing side's record too", async () => {
        const { loser } = await seedOneMatch()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerAnalytics(loser.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.careerStats.matchWins).toBe(0)
        expect(result.data.careerStats.matchLosses).toBe(1)
        expect(result.data.careerStats.setLosses).toBe(2)
    })

    it("rejects an authenticated non-admin", async () => {
        const player = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerAnalytics(player.id)

        expect(result.status).toBe(false)
    })

    it("rejects an unauthenticated caller", async () => {
        const player = await createUser()
        logout()

        const result = await getPlayerAnalytics(player.id)

        expect(result.status).toBe(false)
    })
})

describe("getPlayerRoles", () => {
    it("returns role assignments with scope labels, global roles first", async () => {
        const season = await createSeason({ code: "F26" })
        await createUserWithRoles([{ role: "admin" }])
        const player = await createUser()
        await db.insert(userRoles).values([
            {
                user_id: player.id,
                role: "commissioner",
                season_id: season.id
            },
            { user_id: player.id, role: "leadership_group" }
        ])

        const roles = await getPlayerRoles(player.id)

        expect(roles).toHaveLength(2)
        expect(roles[0]).toMatchObject({
            role: "leadership_group",
            season_id: null,
            season_label: null,
            division_label: null
        })
        expect(roles[1]).toMatchObject({
            role: "commissioner",
            season_id: season.id,
            season_label: "F26 2026 fall"
        })
    })

    it("returns [] for commissioners (admin-only data)", async () => {
        const season = await createSeason()
        const player = await createUser()
        await db
            .insert(userRoles)
            .values([{ user_id: player.id, role: "leadership_group" }])
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        expect(await getPlayerRoles(player.id)).toEqual([])
    })

    it("returns [] for unauthenticated callers", async () => {
        const player = await createUser()
        await db
            .insert(userRoles)
            .values([{ user_id: player.id, role: "leadership_group" }])
        logout()

        expect(await getPlayerRoles(player.id)).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// Email deliverability — surfaced to admins so they can tell "never got the
// email" from "we stopped sending to them".
// ---------------------------------------------------------------------------

describe("getPlayerDetails — email suppressions", () => {
    async function seedSuppressedPlayer() {
        const player = await createUser({ email_status: "bounced" })
        await db.insert(emailSuppressions).values({
            user_id: player.id,
            email: player.email.toLowerCase(),
            stream_id: "outbound",
            reason: "HardBounce",
            origin: "Recipient"
        })
        return player
    }

    it("returns the player's suppressions to an admin", async () => {
        const player = await seedSuppressedPlayer()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.email_status).toBe("bounced")
        expect(result.data.emailSuppressions).toHaveLength(1)
        expect(result.data.emailSuppressions[0]).toMatchObject({
            streamId: "outbound",
            reason: "HardBounce",
            origin: "Recipient",
            canReactivate: true
        })
    })

    it("marks a spam complaint as non-reactivatable", async () => {
        const player = await createUser({ email_status: "spam_complaint" })
        await db.insert(emailSuppressions).values({
            user_id: player.id,
            email: player.email.toLowerCase(),
            stream_id: "broadcast",
            reason: "SpamComplaint",
            origin: "Recipient"
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.emailSuppressions[0].canReactivate).toBe(false)
    })

    it("reports every suppressed stream separately", async () => {
        const player = await createUser({ email_status: "unsubscribed" })
        await db.insert(emailSuppressions).values([
            {
                user_id: player.id,
                email: player.email.toLowerCase(),
                stream_id: "broadcast",
                reason: "ManualSuppression",
                origin: "Customer"
            },
            {
                user_id: player.id,
                email: player.email.toLowerCase(),
                stream_id: "automated-reminders",
                reason: "ManualSuppression",
                origin: "Recipient"
            }
        ])
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(
            new Set(result.data.emailSuppressions.map((s) => s.streamId))
        ).toEqual(new Set(["broadcast", "automated-reminders"]))
    })

    it("returns an empty list for a deliverable address", async () => {
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.email_status).toBe("valid")
        expect(result.data.emailSuppressions).toEqual([])
    })

    // Commissioners see contact info (email/phone) but deliverability state
    // and suppression history stay admin-only.
    it("hides suppressions and status from a non-admin commissioner", async () => {
        const season = await createSeason()
        const player = await seedSuppressedPlayer()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.email).toBe(player.email)
        expect(result.data.player.email_status).toBe("")
        expect(result.data.emailSuppressions).toEqual([])
    })

    it("returns phone and email to a current-season commissioner but keeps emergency contact redacted", async () => {
        const season = await createSeason()
        const player = await createUser({
            phone: "555-123-4567",
            emergency_contact: "Jane Doe 555-999-0000"
        })
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        const result = await getPlayerDetails(player.id)

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.player.phone).toBe("555-123-4567")
        expect(result.data.player.email).toBe(player.email)
        expect(result.data.player.emergency_contact).toBeNull()
    })

    it("rejects callers with no commissioner access", async () => {
        const player = await seedSuppressedPlayer()
        await createUserWithRoles([{ role: "referee" }])

        const result = await getPlayerDetails(player.id)
        expect(result.status).toBe(false)
    })

    it("rejects unauthenticated callers", async () => {
        const player = await seedSuppressedPlayer()
        logout()

        const result = await getPlayerDetails(player.id)
        expect(result.status).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Player schedule — the pop-ups' "Schedule" section. Upcoming is date-based
// (league-local today or later), so today's entries stay even after their
// start time / final whistle.
// ---------------------------------------------------------------------------

describe("getPlayerSchedule", () => {
    const future = (days: number) => getLeagueDateString(days)

    async function seedTeamsWithDraftedPlayer() {
        const season = await createSeason()
        const division = await createDivision({ name: "A", level: 2 })
        const captain = await createUser()
        const player = await createUser()
        const homeTeam = await createTeam({
            season: season.id,
            division: division.id,
            captain: captain.id,
            name: "Home"
        })
        const awayTeam = await createTeam({
            season: season.id,
            division: division.id,
            captain: captain.id,
            name: "Away"
        })
        const [draftRow] = await db
            .insert(drafts)
            .values({
                team: homeTeam.id,
                user: player.id,
                round: 1,
                overall: 1
            })
            .returning()
        return {
            season,
            division,
            captain,
            player,
            homeTeam,
            awayTeam,
            draftRow
        }
    }

    it("returns tryout assignments with explicit and derived sessions/courts", async () => {
        const season = await createSeason()
        const divisionA = await createDivision({ name: "A", level: 2 })
        const tryout1 = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: future(3),
            sort_order: 0
        })
        const tryout2 = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: future(10),
            sort_order: 1
        })
        await createEventTimeSlot(tryout1.id, {
            start_time: "18:00",
            sort_order: 0
        })
        await createEventTimeSlot(tryout1.id, {
            start_time: "19:30",
            sort_order: 1
        })
        await createEventTimeSlot(tryout2.id, {
            start_time: "18:15",
            sort_order: 0
        })
        await createEventTimeSlot(tryout2.id, {
            start_time: "19:45",
            sort_order: 1
        })

        const player = await createUser()
        await db.insert(week1Rosters).values({
            season: season.id,
            user: player.id,
            session_number: 2,
            court_number: 5
        })
        // Team 3 derives session 2; division "A" derives court 2.
        await db.insert(week2Rosters).values({
            season: season.id,
            user: player.id,
            division: divisionA.id,
            team_number: 3,
            is_captain: true
        })
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerSchedule(player.id)

        expect(result.tryouts).toHaveLength(2)
        expect(result.tryouts[0]).toMatchObject({
            date: tryout1.event_date,
            timeLabel: "7:30 PM",
            court: 5,
            label: "Tryout 1 — Session 2",
            sublabel: null
        })
        expect(result.tryouts[1]).toMatchObject({
            date: tryout2.event_date,
            timeLabel: "7:45 PM",
            court: 2,
            label: "Tryout 2 — Session 2",
            sublabel: "IPA (A-3) (captain)"
        })
    })

    it("excludes past tryout nights", async () => {
        const season = await createSeason()
        await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: getLeagueDateString(-7),
            sort_order: 0
        })
        const player = await createUser()
        await db.insert(week1Rosters).values({
            season: season.id,
            user: player.id,
            session_number: 1,
            court_number: 1
        })
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerSchedule(player.id)
        expect(result.tryouts).toEqual([])
    })

    it("lists upcoming team games, resolving date-less matches via season events", async () => {
        const { season, division, player, homeTeam, awayTeam } =
            await seedTeamsWithDraftedPlayer()
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: future(2),
            sort_order: 0
        })
        await createSeasonEvent(season.id, {
            event_type: "regular_season",
            event_date: future(9),
            sort_order: 1
        })
        // Dated future match.
        await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: future(5),
            time: "18:30",
            court: 3,
            home_team: homeTeam.id,
            away_team: awayTeam.id
        })
        // Date-less match resolved via the week-2 regular_season event.
        await createMatch({
            season: season.id,
            division: division.id,
            week: 2,
            home_team: awayTeam.id,
            away_team: homeTeam.id
        })
        // Past match: excluded.
        await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: getLeagueDateString(-7),
            home_team: homeTeam.id,
            away_team: awayTeam.id
        })
        // Today's match stays even though it already has a score.
        await createMatch({
            season: season.id,
            division: division.id,
            week: 3,
            date: getLeagueDateString(),
            home_team: homeTeam.id,
            away_team: awayTeam.id,
            winner: homeTeam.id,
            home_set1_score: 25,
            away_set1_score: 18
        })
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerSchedule(player.id)

        expect(result.games).toHaveLength(3)
        expect(result.games[0]).toMatchObject({
            date: getLeagueDateString(),
            label: "vs Away (A, Week 3)"
        })
        expect(result.games[1]).toMatchObject({
            date: future(5),
            timeLabel: "6:30 PM",
            court: 3,
            label: "vs Away (A, Week 1)"
        })
        expect(result.games[2]).toMatchObject({
            date: future(9),
            timeLabel: null,
            label: "vs Away (A, Week 2)"
        })
    })

    it("excludes matches the player is subbed out of and shows the pickup for the sub", async () => {
        const { season, division, player, homeTeam, awayTeam } =
            await seedTeamsWithDraftedPlayer()
        const subPlayer = await createUser({
            first_name: "Sana",
            last_name: "Sub"
        })
        const admin = await createUser()
        const match = await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: future(4),
            time: "19:00",
            home_team: homeTeam.id,
            away_team: awayTeam.id
        })
        await db.insert(matchSubstitutions).values({
            match: match.id,
            team: homeTeam.id,
            season: season.id,
            original_user: player.id,
            sub_user: subPlayer.id,
            performed_by: admin.id
        })
        await createUserWithRoles([{ role: "captain" }])

        const originalResult = await getPlayerSchedule(player.id)
        expect(originalResult.games).toEqual([])

        const subResult = await getPlayerSchedule(subPlayer.id)
        expect(subResult.games).toHaveLength(1)
        expect(subResult.games[0]).toMatchObject({
            date: future(4),
            timeLabel: "7:00 PM",
            label: "vs Away (A, Week 1)",
            sublabel: `Subbing for ${player.first_name} ${player.last_name}`
        })
    })

    it("follows permanent substitutions when resolving the player's team", async () => {
        const { season, division, player, homeTeam, awayTeam, draftRow } =
            await seedTeamsWithDraftedPlayer()
        const permSub = await createUser()
        const admin = await createUser()
        await db.insert(substitutions).values({
            team: homeTeam.id,
            season: season.id,
            original_draft: draftRow.id,
            original_user: player.id,
            sub_user: permSub.id,
            performed_by: admin.id
        })
        await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: future(6),
            home_team: homeTeam.id,
            away_team: awayTeam.id
        })
        await createUserWithRoles([{ role: "captain" }])

        const subbedOut = await getPlayerSchedule(player.id)
        expect(subbedOut.games).toEqual([])

        const subbedIn = await getPlayerSchedule(permSub.id)
        expect(subbedIn.games).toHaveLength(1)
        expect(subbedIn.games[0].label).toBe("vs Away (A, Week 1)")
    })

    it("returns reffing assignments for future matches only", async () => {
        const { season, division, player, homeTeam, awayTeam } =
            await seedTeamsWithDraftedPlayer()
        const futureMatch = await createMatch({
            season: season.id,
            division: division.id,
            week: 4,
            date: future(7),
            time: "20:15",
            court: 2,
            home_team: homeTeam.id,
            away_team: awayTeam.id
        })
        const pastMatch = await createMatch({
            season: season.id,
            division: division.id,
            week: 1,
            date: getLeagueDateString(-3),
            home_team: homeTeam.id,
            away_team: awayTeam.id
        })
        await db.insert(matchReferees).values([
            {
                match_id: futureMatch.id,
                referee_id: player.id,
                season_id: season.id
            },
            {
                match_id: pastMatch.id,
                referee_id: player.id,
                season_id: season.id,
                role: "secondary"
            }
        ])
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerSchedule(player.id)

        expect(result.reffing).toHaveLength(1)
        expect(result.reffing[0]).toMatchObject({
            date: future(7),
            timeLabel: "8:15 PM",
            court: 2,
            label: "Ref: Home vs Away (A)"
        })
    })

    it("returns volunteering assignments with whole-night and per-session times", async () => {
        const season = await createSeason()
        const tryout = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: future(3),
            sort_order: 0
        })
        const slot = await createEventTimeSlot(tryout.id, {
            start_time: "18:00",
            sort_order: 0
        })
        const player = await createUser()
        const [wholeNightJob] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: tryout.id,
                name: "Check-in",
                scope: "whole_night"
            })
            .returning()
        const [sessionJob] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: tryout.id,
                name: "Scorekeeper",
                scope: "per_session",
                sort_order: 1
            })
            .returning()
        await db.insert(tryoutVolunteerAssignments).values([
            { job_id: wholeNightJob.id, user_id: player.id },
            {
                job_id: sessionJob.id,
                user_id: player.id,
                time_slot_id: slot.id
            }
        ])
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerSchedule(player.id)

        expect(result.volunteering).toHaveLength(2)
        expect(result.volunteering.map((v) => [v.label, v.timeLabel])).toEqual([
            ["Check-in — Tryout 1", "All night"],
            ["Scorekeeper — Tryout 1", "6:00 PM"]
        ])
    })

    it("keeps a whole-night job first even when a time slot is attached", async () => {
        const season = await createSeason()
        const tryout = await createSeasonEvent(season.id, {
            event_type: "tryout",
            event_date: future(3),
            sort_order: 0
        })
        const early = await createEventTimeSlot(tryout.id, {
            start_time: "18:00",
            sort_order: 0
        })
        const late = await createEventTimeSlot(tryout.id, {
            start_time: "20:00",
            sort_order: 1
        })
        const player = await createUser()
        const [wholeNightJob] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: tryout.id,
                name: "Check-in",
                scope: "whole_night"
            })
            .returning()
        const [sessionJob] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: tryout.id,
                name: "Scorekeeper",
                scope: "per_session",
                sort_order: 1
            })
            .returning()
        // A whole-night job carrying a slot is a data anomaly, but it must
        // still read and sort as all-night rather than at the slot time.
        await db.insert(tryoutVolunteerAssignments).values([
            {
                job_id: wholeNightJob.id,
                user_id: player.id,
                time_slot_id: late.id
            },
            {
                job_id: sessionJob.id,
                user_id: player.id,
                time_slot_id: early.id
            }
        ])
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerSchedule(player.id)

        expect(result.volunteering.map((v) => [v.label, v.timeLabel])).toEqual([
            ["Check-in — Tryout 1", "All night"],
            ["Scorekeeper — Tryout 1", "6:00 PM"]
        ])
    })

    it("returns an empty schedule to viewers without captain access", async () => {
        const season = await createSeason()
        const player = await createUser()
        await db.insert(week1Rosters).values({
            season: season.id,
            user: player.id,
            session_number: 1,
            court_number: 1
        })
        await createUserWithRoles([{ role: "referee" }])

        expect(await getPlayerSchedule(player.id)).toEqual({
            tryouts: [],
            games: [],
            reffing: [],
            volunteering: []
        })

        logout()
        expect(await getPlayerSchedule(player.id)).toEqual({
            tryouts: [],
            games: [],
            reffing: [],
            volunteering: []
        })
    })

    it("returns empty categories for a player with nothing scheduled", async () => {
        await createSeason()
        const player = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        expect(await getPlayerSchedule(player.id)).toEqual({
            tryouts: [],
            games: [],
            reffing: [],
            volunteering: []
        })
    })
})
