import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    drafts,
    individual_divisions,
    seasonRefs,
    signupDrops,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
    userRoles
} from "@/database/schema"
import { GHOST_CAPTAIN_ID } from "@/lib/ghost-captain"
import {
    addToWaitlist,
    createDivision,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser } from "@/test/session"
import { computeRecipientSegments } from "./role-tags"

async function makeIndividualDivision(
    seasonId: number,
    divisionId: number,
    coaches: boolean
) {
    await db.insert(individual_divisions).values({
        season: seasonId,
        division: divisionId,
        coaches,
        gender_split: "coed",
        teams: 4
    })
}

/** Assigns a user to a tryout job for the season (creating the night + job). */
async function assignTryoutJob(seasonId: number, userId: string) {
    const event = await createSeasonEvent(seasonId)
    const [job] = await db
        .insert(tryoutVolunteerJobs)
        .values({
            season_id: seasonId,
            event_id: event.id,
            name: "Scorekeeper",
            scope: "whole_night"
        })
        .returning()
    await db
        .insert(tryoutVolunteerAssignments)
        .values({ job_id: job.id, user_id: userId })
}

async function draftOnto(teamId: number, userId: string, overall = 1) {
    await db
        .insert(drafts)
        .values({ team: teamId, user: userId, round: 1, overall })
}

describe("computeRecipientSegments", () => {
    it("tags each season-scoped source", async () => {
        const season = await createSeason()
        const division = await createDivision()
        await makeIndividualDivision(season.id, division.id, false)

        const signedUp = await createUser({ male: true })
        const rostered = await createUser({ male: false })
        const captain = await createUser()
        const commissioner = await createUser()
        const referee = await createUser()
        const refCoordinator = await createUser()
        const volunteer = await createUser()
        const volunteerRoleOnly = await createUser()
        const waitlisted = await createUser()
        const dropped = await createUser()
        const admin = await createUser()
        const leader = await createUser()

        await createSignup({ season: season.id, player: signedUp.id })

        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id
        })
        await draftOnto(team.id, rostered.id)

        await db.insert(userRoles).values([
            {
                user_id: commissioner.id,
                role: "commissioner",
                season_id: season.id,
                division_id: division.id
            },
            {
                user_id: refCoordinator.id,
                role: "referee_coordinator",
                season_id: season.id
            },
            {
                user_id: volunteerRoleOnly.id,
                role: "tryout_volunteer",
                season_id: season.id
            },
            { user_id: admin.id, role: "admin" },
            { user_id: leader.id, role: "leadership_group" }
        ])

        // The tag follows the actual job assignment, not the role grant.
        await assignTryoutJob(season.id, volunteer.id)

        await db.insert(seasonRefs).values({
            season_id: season.id,
            user_id: referee.id,
            is_active: true,
            max_division_level: 3
        })

        await addToWaitlist({ season: season.id, user: waitlisted.id })

        await db.insert(signupDrops).values({
            signup_id: 9999,
            stage: "pre_draft",
            season: season.id,
            player: dropped.id,
            reason_category: "injury",
            dropped_by: admin.id
        })

        const segments = await computeRecipientSegments(season.id, [
            signedUp.id,
            rostered.id,
            captain.id,
            commissioner.id,
            referee.id,
            refCoordinator.id,
            volunteer.id,
            volunteerRoleOnly.id,
            waitlisted.id,
            dropped.id,
            admin.id,
            leader.id
        ])

        expect(segments.get(signedUp.id)?.roleTags).toEqual([
            "signed_up",
            "first_season"
        ])
        expect(segments.get(signedUp.id)?.gender).toBe("male")
        expect(segments.get(rostered.id)?.roleTags).toEqual([
            "rostered",
            "first_season"
        ])
        expect(segments.get(rostered.id)?.divisionId).toBe(division.id)
        expect(segments.get(rostered.id)?.gender).toBe("non_male")
        // No signup and no drafts row, so this captain has no season history
        // at all and gets neither first_season nor returning.
        expect(segments.get(captain.id)?.roleTags).toEqual(["captain"])
        expect(segments.get(captain.id)?.divisionId).toBe(division.id)
        expect(segments.get(captain.id)?.gender).toBeNull()
        expect(segments.get(commissioner.id)?.roleTags).toEqual([
            "commissioner"
        ])
        expect(segments.get(commissioner.id)?.divisionId).toBe(division.id)
        expect(segments.get(referee.id)?.roleTags).toEqual(["referee"])
        expect(segments.get(refCoordinator.id)?.roleTags).toEqual([
            "ref_coordinator"
        ])
        expect(segments.get(volunteer.id)?.roleTags).toEqual([
            "tryout_volunteer"
        ])
        // The tryout_volunteer role row alone only opens the scheduling UI.
        expect(segments.get(volunteerRoleOnly.id)?.roleTags).toEqual([])
        expect(segments.get(waitlisted.id)?.roleTags).toEqual(["waitlisted"])
        // The drop row is this season's history, so the player is a rookie too.
        expect(segments.get(dropped.id)?.roleTags).toEqual([
            "dropped",
            "first_season"
        ])
        expect(segments.get(admin.id)?.roleTags).toEqual(["admin"])
        expect(segments.get(leader.id)?.roleTags).toEqual(["leadership_group"])
    })

    it("treats a legacy director row as admin and skips inactive refs", async () => {
        const season = await createSeason()
        const director = await createUser()
        const formerRef = await createUser()

        await db
            .insert(userRoles)
            .values({ user_id: director.id, role: "director" })
        await db.insert(seasonRefs).values({
            season_id: season.id,
            user_id: formerRef.id,
            is_active: false,
            max_division_level: 3
        })

        const segments = await computeRecipientSegments(season.id, [
            director.id,
            formerRef.id
        ])

        expect(segments.get(director.id)?.roleTags).toEqual(["admin"])
        expect(segments.get(formerRef.id)?.roleTags).toEqual([])
    })

    it("tags the head of a coaches-division team as coach, not captain", async () => {
        const season = await createSeason()
        const coachDivision = await createDivision({ name: "Coached" })
        const playerDivision = await createDivision({ name: "Played" })
        await makeIndividualDivision(season.id, coachDivision.id, true)
        await makeIndividualDivision(season.id, playerDivision.id, false)

        const coach = await createUser()
        const coCoach = await createUser()
        const captain = await createUser()

        await createTeam({
            season: season.id,
            captain: coach.id,
            captain2: coCoach.id,
            division: coachDivision.id
        })
        await createTeam({
            season: season.id,
            captain: captain.id,
            division: playerDivision.id
        })

        const segments = await computeRecipientSegments(season.id, [
            coach.id,
            coCoach.id,
            captain.id
        ])

        expect(segments.get(coach.id)?.roleTags).toEqual(["coach"])
        expect(segments.get(coach.id)?.divisionId).toBe(coachDivision.id)
        expect(segments.get(coCoach.id)?.roleTags).toEqual(["coach"])
        expect(segments.get(captain.id)?.roleTags).toContain("captain")
        expect(segments.get(captain.id)?.roleTags).not.toContain("coach")
    })

    it("treats a team in a division with no individual_divisions row as captain", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const captain = await createUser()
        await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id
        })

        const segments = await computeRecipientSegments(season.id, [captain.id])
        expect(segments.get(captain.id)?.roleTags).toContain("captain")
    })

    it("separates first_season from returning using prior-season history", async () => {
        const prior = await createSeason({ year: 2025, season: "spring" })
        const season = await createSeason({ year: 2026, season: "fall" })
        const division = await createDivision()

        const rookie = await createUser()
        const veteran = await createUser()
        const priorSignupOnly = await createUser()
        const noHistory = await createUser()

        await createSignup({ season: season.id, player: rookie.id })
        await createSignup({ season: season.id, player: veteran.id })

        // Veteran's history is a prior-season drafts row (no signup row).
        const priorTeam = await createTeam({
            season: prior.id,
            captain: priorSignupOnly.id,
            division: division.id
        })
        await draftOnto(priorTeam.id, veteran.id)
        await createSignup({ season: prior.id, player: priorSignupOnly.id })
        await createSignup({ season: season.id, player: priorSignupOnly.id })

        const segments = await computeRecipientSegments(season.id, [
            rookie.id,
            veteran.id,
            priorSignupOnly.id,
            noHistory.id
        ])

        expect(segments.get(rookie.id)?.roleTags).toContain("first_season")
        expect(segments.get(rookie.id)?.roleTags).not.toContain("returning")
        expect(segments.get(veteran.id)?.roleTags).toContain("returning")
        expect(segments.get(veteran.id)?.roleTags).not.toContain("first_season")
        expect(segments.get(priorSignupOnly.id)?.roleTags).toContain(
            "returning"
        )
        expect(segments.get(noHistory.id)?.roleTags).toEqual([])
    })

    it("counts signup_drops seasons as history", async () => {
        // A pre-draft drop deletes the signups row, so signup_drops is the only
        // record that the player was ever in that season.
        const prior = await createSeason({ year: 2025, season: "spring" })
        const season = await createSeason({ year: 2026, season: "fall" })

        const droppedLastTime = await createUser()
        const droppedThisTime = await createUser()
        const dropper = await createUser()

        await db.insert(signupDrops).values([
            {
                signup_id: 101,
                stage: "pre_draft",
                season: prior.id,
                player: droppedLastTime.id,
                reason_category: "injury",
                dropped_by: dropper.id
            },
            {
                signup_id: 102,
                stage: "pre_draft",
                season: season.id,
                player: droppedThisTime.id,
                reason_category: "moved",
                dropped_by: dropper.id
            }
        ])
        await createSignup({ season: season.id, player: droppedLastTime.id })

        const segments = await computeRecipientSegments(season.id, [
            droppedLastTime.id,
            droppedThisTime.id
        ])

        // Only prior-season record is the drop row, so they are returning.
        expect(segments.get(droppedLastTime.id)?.roleTags).toEqual([
            "signed_up",
            "returning"
        ])
        // Only record at all is this season's drop row.
        expect(segments.get(droppedThisTime.id)?.roleTags).toEqual([
            "dropped",
            "first_season"
        ])
    })

    it("computes only global tags and gender when the season is null", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const admin = await createUser({ male: true })
        const player = await createUser({ male: false })

        await db.insert(userRoles).values({ user_id: admin.id, role: "admin" })
        await createSignup({ season: season.id, player: player.id })
        const team = await createTeam({
            season: season.id,
            captain: admin.id,
            division: division.id
        })
        await draftOnto(team.id, player.id)

        const segments = await computeRecipientSegments(null, [
            admin.id,
            player.id
        ])

        expect(segments.get(admin.id)?.roleTags).toEqual(["admin"])
        expect(segments.get(admin.id)?.divisionId).toBeNull()
        expect(segments.get(admin.id)?.gender).toBe("male")
        expect(segments.get(player.id)?.roleTags).toEqual([])
        expect(segments.get(player.id)?.gender).toBe("non_male")
    })

    it("returns an empty entry for every requested id, including unknowns", async () => {
        const season = await createSeason()
        const known = await createUser()

        const segments = await computeRecipientSegments(season.id, [
            known.id,
            "no-such-user",
            GHOST_CAPTAIN_ID
        ])

        expect(segments.size).toBe(3)
        expect(segments.get("no-such-user")).toEqual({
            roleTags: [],
            divisionId: null,
            gender: null
        })
        expect(segments.get(GHOST_CAPTAIN_ID)).toEqual({
            roleTags: [],
            divisionId: null,
            gender: null
        })
        expect(segments.get(known.id)?.roleTags).toEqual([])
    })

    it("never tags the ghost captain and returns an empty map for no ids", async () => {
        const season = await createSeason()
        const division = await createDivision()
        await makeIndividualDivision(season.id, division.id, false)
        const ghost = await createUser({ id: GHOST_CAPTAIN_ID })
        await createTeam({
            season: season.id,
            captain: ghost.id,
            division: division.id
        })

        const withGhost = await computeRecipientSegments(season.id, [ghost.id])
        expect(withGhost.get(GHOST_CAPTAIN_ID)).toEqual({
            roleTags: [],
            divisionId: null,
            gender: null
        })

        const empty = await computeRecipientSegments(season.id, [])
        expect(empty.size).toBe(0)
    })

    it("returns tags in SURVEY_ROLE_TAGS order without duplicates", async () => {
        const season = await createSeason()
        const division = await createDivision()
        await makeIndividualDivision(season.id, division.id, false)

        const user = await createUser()
        await createSignup({ season: season.id, player: user.id })
        const team = await createTeam({
            season: season.id,
            captain: user.id,
            division: division.id
        })
        await draftOnto(team.id, user.id)
        await db.insert(userRoles).values([
            { user_id: user.id, role: "admin" },
            {
                user_id: user.id,
                role: "commissioner",
                season_id: season.id,
                division_id: division.id
            }
        ])

        const segments = await computeRecipientSegments(season.id, [user.id])

        expect(segments.get(user.id)?.roleTags).toEqual([
            "signed_up",
            "rostered",
            "captain",
            "commissioner",
            "first_season",
            "admin"
        ])
        expect(segments.get(user.id)?.divisionId).toBe(division.id)
    })
})
