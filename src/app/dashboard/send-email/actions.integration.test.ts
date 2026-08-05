import { inArray } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import {
    drafts,
    emailBroadcasts,
    emailRecipientGroups,
    seasonRefs,
    tryoutVolunteerAssignments,
    tryoutVolunteerJobs,
    userRoles
} from "@/database/schema"
import type { LexicalEmailTemplateContent } from "@/lib/email-template-content"
import { normalizeEmailTemplateContent } from "@/lib/email-template-content"
import { site } from "@/config/site"
import { sendBatchEmails } from "@/lib/postmark"
import { broadcastCall } from "@/test/email"
import {
    createDivision,
    createSeason,
    createSeasonEvent,
    createSignup,
    createTeam
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { createAndSendBroadcast, previewBroadcast } from "./actions"

const EMPTY_BODY = normalizeEmailTemplateContent("")

function bodyWith(prefix: string, variableKey: string) {
    const content: LexicalEmailTemplateContent = {
        root: {
            type: "root",
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
                {
                    type: "paragraph",
                    direction: null,
                    format: "",
                    indent: 0,
                    version: 1,
                    children: [
                        {
                            type: "text",
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            text: prefix,
                            version: 1
                        },
                        {
                            type: "template-variable",
                            variableKey,
                            version: 1
                        }
                    ]
                }
            ]
        }
    }
    return content
}

async function broadcastRows() {
    return db.select().from(emailBroadcasts)
}

describe("createAndSendBroadcast", () => {
    it("resolves template variables in subject and body before sending", async () => {
        const season = await createSeason() // fall 2026, registration_open
        await createSeasonEvent(season.id) // tryout on 2026-09-05
        await createUserWithRoles([{ role: "admin" }])
        await createUser()

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject:
                "BSD [season_name] Registration is Open — tryouts [tryout_1_date]!",
            lexicalContent: bodyWith("Welcome to ", "season_name")
        })

        expect(result.status).toBe(true)
        expect(sendBatchEmails).toHaveBeenCalledOnce()
        const call = broadcastCall(0)
        expect(call.subject).toContain("BSD Fall 2026 Registration is Open")
        expect(call.subject).toContain("September 5, 2026")
        // No unresolved [variable] markers survive past the "[BSD] " prefix.
        expect(call.subject.slice("[BSD] ".length)).not.toContain("[")
        expect(call.htmlBody).toContain("Welcome to Fall 2026")

        // The stored broadcast records what was actually sent
        const [row] = await broadcastRows()
        expect(row.subject).toContain("Fall 2026")
        expect(row.subject).not.toContain("[season_name]")
        expect(row.html_content).toContain("Welcome to Fall 2026")
    })

    it("resolves division variables for division sends", async () => {
        const season = await createSeason()
        const division = await createDivision({ name: "AA", level: 2 })
        await createSeasonEvent(season.id, {
            event_type: "draft",
            event_date: "2026-09-14",
            sort_order: 0
        })
        await createSeasonEvent(season.id, {
            event_type: "draft",
            event_date: "2026-09-15",
            sort_order: 1
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "division",
            divisionId: division.id,
            subject: "[division_name] draft is [division_draft_date]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const [row] = await broadcastRows()
        expect(row.subject).toContain("AA draft is")
        expect(row.subject).toContain("September 15, 2026")
    })

    it("leaves bracketed text that is not a known variable untouched", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "[BSD] fun in [season_name]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const [row] = await broadcastRows()
        expect(row.subject).toBe("[BSD] fun in Fall 2026")
    })

    it("refuses to send when the subject has a variable it cannot resolve", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "A note from [captain_names]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(false)
        expect(result.message).toContain("captain_names")
        expect(sendBatchEmails).not.toHaveBeenCalled()
        expect(await broadcastRows()).toHaveLength(0)
    })

    it("refuses to send when the body has a variable it cannot resolve", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "Hello",
            lexicalContent: bodyWith("Rounds: ", "captain_rounds")
        })

        expect(result.status).toBe(false)
        expect(result.message).toContain("captain_rounds")
        expect(sendBatchEmails).not.toHaveBeenCalled()
        expect(await broadcastRows()).toHaveLength(0)
    })

    it("sends only to the signed-in user for just_me", async () => {
        const season = await createSeason()
        await createSeasonEvent(season.id)
        const admin = await createUserWithRoles([{ role: "admin" }])
        await createUser() // bystander who must NOT receive the test email
        await createUser()

        const result = await createAndSendBroadcast({
            sendToType: "just_me",
            subject: "Test: BSD [season_name] Registration is Open!!",
            lexicalContent: bodyWith("Welcome to ", "season_name")
        })

        expect(result.status).toBe(true)
        expect(sendBatchEmails).toHaveBeenCalledOnce()
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: admin.email }])
        expect(call.subject).toBe(
            "[BSD] Test: BSD Fall 2026 Registration is Open!!"
        )

        const [row] = await broadcastRows()
        expect(row.sent_count).toBe(1)
    })

    it("allows commissioners to send just_me", async () => {
        const season = await createSeason()
        const commissioner = await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])
        await createUser()

        const result = await createAndSendBroadcast({
            sendToType: "just_me",
            subject: "Testing [season_name]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        expect(sendBatchEmails).toHaveBeenCalledOnce()
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: commissioner.email }])
    })

    it("prefixes the subject with [BSD]", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "just_me",
            subject: "Week 3 schedule",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.subject).toBe("[BSD] Week 3 schedule")
    })

    it("does not double a prefix the admin typed themselves", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "just_me",
            subject: "[bsd]  Week 3 schedule",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.subject).toBe("[BSD] Week 3 schedule")

        const [row] = await broadcastRows()
        expect(row.subject).toBe("[BSD] Week 3 schedule")
    })

    it("sends season_refs to the current season's active ref pool only", async () => {
        const season = await createSeason()
        await createUserWithRoles([{ role: "admin" }])
        const activeRef = await createUser()
        const inactiveRef = await createUser()
        await createUser() // never a ref

        await db.insert(seasonRefs).values([
            {
                season_id: season.id,
                user_id: activeRef.id,
                is_active: true,
                max_division_level: 3
            },
            {
                season_id: season.id,
                user_id: inactiveRef.id,
                is_active: false,
                max_division_level: 3
            }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "season_refs",
            subject: "Ref meeting",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: activeRef.email }])
    })

    it("sends season_ref_interest to signups that opted into reffing", async () => {
        const season = await createSeason()
        await createUserWithRoles([{ role: "admin" }])
        const interested = await createUser()
        const declined = await createUser()
        const neverAsked = await createUser()
        const tryoutsOnly = await createUser()

        await createSignup({
            season: season.id,
            player: interested.id,
            ref_interest: true
        })
        await createSignup({
            season: season.id,
            player: declined.id,
            ref_interest: false
        })
        // Signed up before the question existed
        await createSignup({ season: season.id, player: neverAsked.id })
        await createSignup({
            season: season.id,
            player: tryoutsOnly.id,
            ref_interest: false,
            tryout_help: true
        })

        const result = await createAndSendBroadcast({
            sendToType: "season_ref_interest",
            subject: "Want to ref?",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: interested.email }])
    })

    it("sends season_tryout_help to signups willing to help with tryouts", async () => {
        const season = await createSeason()
        await createUserWithRoles([{ role: "admin" }])
        const helper = await createUser()
        const declined = await createUser()

        await createSignup({
            season: season.id,
            player: helper.id,
            tryout_help: true
        })
        await createSignup({
            season: season.id,
            player: declined.id,
            tryout_help: false
        })

        const result = await createAndSendBroadcast({
            sendToType: "season_tryout_help",
            subject: "Tryout help needed",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: helper.email }])
    })

    it("scopes the volunteer audiences to the current season's signups", async () => {
        const oldSeason = await createSeason()
        const pastVolunteer = await createUser()
        await createSignup({
            season: oldSeason.id,
            player: pastVolunteer.id,
            ref_interest: true,
            tryout_help: true
        })

        // A later season becomes current; nobody has answered yes in it yet.
        const currentSeason = await createSeason()
        await createUserWithRoles([{ role: "admin" }])
        const currentVolunteer = await createUser()
        await createSignup({
            season: currentSeason.id,
            player: currentVolunteer.id,
            ref_interest: true
        })

        const result = await createAndSendBroadcast({
            sendToType: "season_ref_interest",
            subject: "Want to ref?",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: currentVolunteer.email }])
    })

    it("sends all_refs to anyone who has ever reffed, in any season", async () => {
        const oldSeason = await createSeason()
        const currentSeason = await createSeason()
        await createUserWithRoles([{ role: "admin" }])
        const pastRef = await createUser()
        const currentRef = await createUser()
        await createUser() // never a ref

        await db.insert(seasonRefs).values([
            {
                season_id: oldSeason.id,
                user_id: pastRef.id,
                // Deactivated long ago, but they have still "ever been a ref".
                is_active: false,
                max_division_level: 3
            },
            {
                season_id: currentSeason.id,
                user_id: currentRef.id,
                is_active: true,
                max_division_level: 3
            }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "all_refs",
            subject: "Ref clinic",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients.map((r) => r.email).sort()).toEqual(
            [pastRef.email, currentRef.email].sort()
        )
    })

    it("counts a ref in two seasons once", async () => {
        const oldSeason = await createSeason()
        const currentSeason = await createSeason()
        await createUserWithRoles([{ role: "admin" }])
        const ref = await createUser()

        await db.insert(seasonRefs).values([
            {
                season_id: oldSeason.id,
                user_id: ref.id,
                is_active: true,
                max_division_level: 3
            },
            {
                season_id: currentSeason.id,
                user_id: ref.id,
                is_active: true,
                max_division_level: 3
            }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "all_refs",
            subject: "Ref clinic",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: ref.email }])
    })

    it("sends leadership_group to leadership members plus all admins", async () => {
        await createSeason()
        const admin = await createUserWithRoles([{ role: "admin" }])
        const leader = await createUser()
        const legacyDirector = await createUser()
        await createUser() // bystander with no roles

        await db.insert(userRoles).values([
            { user_id: leader.id, role: "leadership_group" },
            // Legacy spelling still present in prod user_roles data.
            { user_id: legacyDirector.id, role: "director" }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "leadership_group",
            subject: "Leadership meeting",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients.map((r) => r.email).sort()).toEqual(
            [admin.email, leader.email, legacyDirector.email].sort()
        )
    })

    it("counts a user who is both admin and leadership once", async () => {
        await createSeason()
        const admin = await createUserWithRoles([
            { role: "admin" },
            { role: "leadership_group" }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "leadership_group",
            subject: "Leadership meeting",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: admin.email }])
    })

    it("blocks commissioners from sending to the leadership group", async () => {
        const season = await createSeason()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "leadership_group",
            subject: "Leadership meeting",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Unauthorized: only admins can send league-wide emails."
        })
        expect(sendBatchEmails).not.toHaveBeenCalled()
    })

    it("blocks commissioners from sending to either ref group", async () => {
        const season = await createSeason()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        for (const sendToType of ["all_refs", "season_refs"] as const) {
            const result = await createAndSendBroadcast({
                sendToType,
                subject: "Ref clinic",
                lexicalContent: EMPTY_BODY
            })
            expect(result).toMatchObject({
                status: false,
                message:
                    "Unauthorized: only admins can send league-wide emails."
            })
        }
        expect(sendBatchEmails).not.toHaveBeenCalled()
    })

    it("returns Unauthorized for an authenticated non-admin", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "Hi",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Unauthorized."
        })
    })

    it("rejects unauthenticated calls", async () => {
        await createSeason()

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "Hi",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Not authenticated."
        })
    })
})

describe("previewBroadcast", () => {
    it("returns the resolved subject, body html, and recipient count without sending", async () => {
        const season = await createSeason()
        await createSeasonEvent(season.id)
        await createUserWithRoles([{ role: "admin" }])
        await createUser()

        const result = await previewBroadcast({
            sendToType: "everyone",
            subject: "BSD [season_name] Registration is Open!!",
            lexicalContent: bodyWith("Welcome to ", "season_name")
        })

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected success")
        expect(result.data.subject).toBe(
            "[BSD] BSD Fall 2026 Registration is Open!!"
        )
        expect(result.data.html).toContain("Welcome to Fall 2026")
        expect(result.data.groupName).toBe("All Users")
        expect(result.data.recipientCount).toBe(2)

        expect(sendBatchEmails).not.toHaveBeenCalled()
        expect(await broadcastRows()).toHaveLength(0)
    })

    it("previews a just_me send as one recipient", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])
        await createUser()

        const result = await previewBroadcast({
            sendToType: "just_me",
            subject: "Test: [season_name]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected success")
        expect(result.data.subject).toBe("[BSD] Test: Fall 2026")
        expect(result.data.groupName).toBe("Just Me")
        expect(result.data.recipientCount).toBe(1)
        expect(sendBatchEmails).not.toHaveBeenCalled()
    })

    it("reports unresolved variables instead of previewing", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await previewBroadcast({
            sendToType: "everyone",
            subject: "A note from [captain_names]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(false)
        expect(result.message).toContain("captain_names")
    })

    it("returns Unauthorized for an authenticated non-admin", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await previewBroadcast({
            sendToType: "everyone",
            subject: "Hi",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Unauthorized."
        })
    })

    it("rejects unauthenticated calls", async () => {
        await createSeason()

        const result = await previewBroadcast({
            sendToType: "everyone",
            subject: "Hi",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Not authenticated."
        })
    })
})

// ---------------------------------------------------------------------------
// Tryout volunteers — people actually assigned to a job, not everyone who
// offered to help and not everyone holding the tryout_volunteer role.
// ---------------------------------------------------------------------------

describe("createAndSendBroadcast — tryout volunteers", () => {
    /**
     * Two tryout nights, each with one whole-night job. Returns the jobs so
     * tests can assign whoever they need.
     */
    async function seedTryoutJobs() {
        const season = await createSeason()
        const nightOne = await createSeasonEvent(season.id, {
            sort_order: 0,
            event_date: "2026-09-10"
        })
        const nightTwo = await createSeasonEvent(season.id, {
            sort_order: 1,
            event_date: "2026-09-17"
        })

        const [jobOne] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: nightOne.id,
                name: "Check-in Table",
                needed: 2,
                scope: "whole_night",
                sort_order: 0
            })
            .returning()
        const [jobTwo] = await db
            .insert(tryoutVolunteerJobs)
            .values({
                season_id: season.id,
                event_id: nightTwo.id,
                name: "Scorekeeper",
                needed: 2,
                scope: "whole_night",
                sort_order: 0
            })
            .returning()

        return { season, nightOne, nightTwo, jobOne, jobTwo }
    }

    async function assign(jobId: number, userId: string) {
        await db.insert(tryoutVolunteerAssignments).values({
            job_id: jobId,
            time_slot_id: null,
            user_id: userId
        })
    }

    it("sends to everyone assigned on any night when no tryout is picked", async () => {
        const { jobOne, jobTwo } = await seedTryoutJobs()
        await createUserWithRoles([{ role: "admin" }])
        const one = await createUser()
        const two = await createUser()
        await assign(jobOne.id, one.id)
        await assign(jobTwo.id, two.id)

        const result = await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            subject: "Thanks for volunteering",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(new Set(call.recipients.map((r) => r.email))).toEqual(
            new Set([one.email, two.email])
        )
    })

    it("narrows to a single tryout night when one is picked", async () => {
        const { nightTwo, jobOne, jobTwo } = await seedTryoutJobs()
        await createUserWithRoles([{ role: "admin" }])
        const nightOneVolunteer = await createUser()
        const nightTwoVolunteer = await createUser()
        await assign(jobOne.id, nightOneVolunteer.id)
        await assign(jobTwo.id, nightTwoVolunteer.id)

        const result = await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            tryoutEventId: nightTwo.id,
            subject: "See you tomorrow",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: nightTwoVolunteer.email }])
    })

    it("excludes people who only offered to help or only hold the role", async () => {
        const { season, jobOne } = await seedTryoutJobs()
        await createUserWithRoles([{ role: "admin" }])
        const assigned = await createUser()
        await assign(jobOne.id, assigned.id)

        // Offered on their signup but never given a job.
        const willing = await createUser()
        await createSignup({
            season: season.id,
            player: willing.id,
            tryout_help: true
        })
        // Holds the role but was never assigned.
        const roleOnly = await createUser()
        await db.insert(userRoles).values({
            user_id: roleOnly.id,
            role: "tryout_volunteer",
            season_id: season.id
        })

        const result = await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            subject: "Job details",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: assigned.email }])
    })

    it("sends one copy to a volunteer working several jobs", async () => {
        const { jobOne, jobTwo } = await seedTryoutJobs()
        await createUserWithRoles([{ role: "admin" }])
        const busy = await createUser()
        await assign(jobOne.id, busy.id)
        await assign(jobTwo.id, busy.id)

        const result = await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            subject: "Your jobs",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: busy.email }])
    })

    it("ignores volunteers assigned in a previous season", async () => {
        const previous = await seedTryoutJobs()
        const pastVolunteer = await createUser()
        await assign(previous.jobOne.id, pastVolunteer.id)

        // A newer season makes the one above historical.
        const current = await seedTryoutJobs()
        await createUserWithRoles([{ role: "admin" }])
        const currentVolunteer = await createUser()
        await assign(current.jobOne.id, currentVolunteer.id)

        const result = await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            subject: "Current season only",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: currentVolunteer.email }])
    })

    it("rejects a tryout date from another season", async () => {
        const other = await seedTryoutJobs()
        await seedTryoutJobs()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            tryoutEventId: other.nightOne.id,
            subject: "Wrong season",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toEqual({
            status: false,
            message: "Tryout date not found in the current season."
        })
    })

    it("reuses one recipient group per tryout night across sends", async () => {
        const { nightOne, jobOne } = await seedTryoutJobs()
        await createUserWithRoles([{ role: "admin" }])
        const volunteer = await createUser()
        await assign(jobOne.id, volunteer.id)

        await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            tryoutEventId: nightOne.id,
            subject: "First",
            lexicalContent: EMPTY_BODY
        })
        await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            tryoutEventId: nightOne.id,
            subject: "Second",
            lexicalContent: EMPTY_BODY
        })
        // The season-wide variant must not collapse into the per-night one.
        await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            subject: "All nights",
            lexicalContent: EMPTY_BODY
        })

        const groups = await db
            .select()
            .from(emailRecipientGroups)
            .where(
                inArray(emailRecipientGroups.group_type, [
                    "season_tryout_volunteers",
                    "season_tryout_volunteers_event"
                ])
            )
        expect(groups).toHaveLength(2)
        const perNight = groups.find(
            (g) => g.group_type === "season_tryout_volunteers_event"
        )
        expect(perNight?.event_id).toBe(nightOne.id)
        expect(perNight?.name).toContain("Tryout 1 Volunteers")
    })

    it("blocks commissioners from the volunteer audience", async () => {
        const { season } = await seedTryoutJobs()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "season_tryout_volunteers",
            subject: "Not allowed",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toEqual({
            status: false,
            message: "Unauthorized: only admins can send league-wide emails."
        })
        expect(sendBatchEmails).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// CC Directors — an alias appended to the distribution list. Optional for
// admins, mandatory for commissioners.
// ---------------------------------------------------------------------------

describe("createAndSendBroadcast — CC directors", () => {
    const DIRECTORS = site.mailDirectors

    async function seedDivisionAudience() {
        const season = await createSeason()
        const division = await createDivision()
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            division: division.id,
            captain: captain.id
        })
        const player = await createUser()
        await db
            .insert(drafts)
            .values({ team: team.id, user: player.id, round: 1, overall: 1 })
        // A division audience covers drafted players AND the team captain.
        return { season, division, player, captain }
    }

    it("omits directors when an admin leaves the box unchecked", async () => {
        const { season, division } = await seedDivisionAudience()
        await createUserWithRoles([{ role: "admin" }])
        expect(season.id).toBeGreaterThan(0)

        const result = await createAndSendBroadcast({
            sendToType: "division",
            divisionId: division.id,
            subject: "No CC",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients.map((r) => r.email)).not.toContain(DIRECTORS)
    })

    it("includes directors when an admin checks the box", async () => {
        const { division, player, captain } = await seedDivisionAudience()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "division",
            divisionId: division.id,
            ccDirectors: true,
            subject: "With CC",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(new Set(call.recipients.map((r) => r.email))).toEqual(
            new Set([player.email, captain.email, DIRECTORS])
        )
    })

    it("forces directors on for a commissioner", async () => {
        const { season, division, player, captain } =
            await seedDivisionAudience()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "division",
            divisionId: division.id,
            subject: "Commissioner send",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(new Set(call.recipients.map((r) => r.email))).toEqual(
            new Set([player.email, captain.email, DIRECTORS])
        )
    })

    // The disabled checkbox is only the UI half of the rule; a hand-crafted
    // payload must not be able to cut directors out of a commissioner's send.
    it("ignores ccDirectors:false from a commissioner", async () => {
        const { season, division } = await seedDivisionAudience()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])

        const result = await createAndSendBroadcast({
            sendToType: "division",
            divisionId: division.id,
            ccDirectors: false,
            subject: "Trying to hide",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients.map((r) => r.email)).toContain(DIRECTORS)
    })

    it("never CCs directors on a test send to yourself", async () => {
        const admin = await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "just_me",
            ccDirectors: true,
            subject: "Test",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: admin.email }])
    })

    it("still reaches directors when the audience is empty", async () => {
        const season = await createSeason()
        const division = await createDivision()
        await createUserWithRoles([{ role: "admin" }])
        expect(season.id).toBeGreaterThan(0)

        const result = await createAndSendBroadcast({
            sendToType: "division",
            divisionId: division.id,
            ccDirectors: true,
            subject: "Nobody but directors",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const call = broadcastCall(0)
        expect(call.recipients).toEqual([{ email: DIRECTORS }])
    })

    it("counts the directors address in the preview", async () => {
        const { division } = await seedDivisionAudience()
        await createUserWithRoles([{ role: "admin" }])

        const without = await previewBroadcast({
            sendToType: "division",
            divisionId: division.id,
            subject: "Preview",
            lexicalContent: EMPTY_BODY
        })
        const withCc = await previewBroadcast({
            sendToType: "division",
            divisionId: division.id,
            ccDirectors: true,
            subject: "Preview",
            lexicalContent: EMPTY_BODY
        })

        expect(without.status && without.data.ccDirectors).toBe(false)
        expect(withCc.status && withCc.data.ccDirectors).toBe(true)
        expect(
            (withCc.status ? withCc.data.recipientCount : 0) -
                (without.status ? without.data.recipientCount : 0)
        ).toBe(1)
    })
})
