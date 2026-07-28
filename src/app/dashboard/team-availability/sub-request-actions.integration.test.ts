import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { drafts, matchSubstitutions, subRequests } from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import {
    createDivision,
    createMatch,
    createSeason,
    createTeam
} from "@/test/factories"
import {
    createUser,
    createUserWithRoles,
    loginAs,
    logout
} from "@/test/session"
import {
    cancelSubRequest,
    createSubRequest,
    getSubRequestsForTeam,
    respondToSubRequest
} from "./sub-request-actions"

const mockedSendBatch = vi.mocked(sendBatchEmails)

const FUTURE_DATE = "2099-06-01"
const PAST_DATE = "2020-06-01"

async function draftOnto(teamId: number, userId: string, overall: number) {
    await db.insert(drafts).values({
        team: teamId,
        user: userId,
        round: 1,
        overall
    })
}

/**
 * Three teams in one division: A (requesting), B (opponent), C (target).
 * coveredPlayer plays on A, candidate on C. The match is A vs B.
 */
async function seedLeague(matchDate = FUTURE_DATE) {
    const season = await createSeason()
    const division = await createDivision()
    const capA = await createUser()
    const capB = await createUser()
    const capC = await createUser()
    const teamA = await createTeam({
        season: season.id,
        division: division.id,
        captain: capA.id,
        name: "Team A"
    })
    const teamB = await createTeam({
        season: season.id,
        division: division.id,
        captain: capB.id,
        name: "Team B"
    })
    const teamC = await createTeam({
        season: season.id,
        division: division.id,
        captain: capC.id,
        name: "Team C"
    })
    const coveredPlayer = await createUser()
    const candidate = await createUser()
    await draftOnto(teamA.id, coveredPlayer.id, 1)
    await draftOnto(teamC.id, candidate.id, 2)
    const match = await createMatch({
        season: season.id,
        division: division.id,
        date: matchDate,
        time: "19:00:00",
        court: 2,
        home_team: teamA.id,
        away_team: teamB.id
    })
    return {
        season,
        division,
        capA,
        capB,
        capC,
        teamA,
        teamB,
        teamC,
        coveredPlayer,
        candidate,
        match
    }
}

function createInput(s: Awaited<ReturnType<typeof seedLeague>>) {
    return {
        teamId: s.teamA.id,
        matchId: s.match.id,
        originalUserId: s.coveredPlayer.id,
        targetUserId: s.candidate.id
    }
}

describe("createSubRequest", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("rejects unauthenticated and non-captain callers", async () => {
        const s = await seedLeague()
        logout()
        expect((await createSubRequest(createInput(s))).status).toBe(false)

        const rando = await createUser()
        loginAs(rando)
        const result = await createSubRequest(createInput(s))
        expect(result.status).toBe(false)
        expect(!result.status && result.message).toBe("Not authorized.")
    })

    it("creates the request, resolves the target team, and emails the target captain", async () => {
        const s = await seedLeague()
        loginAs(s.capA)

        const result = await createSubRequest({
            ...createInput(s),
            message: "We're down two players"
        })
        expect(result.status).toBe(true)

        const [row] = await db.select().from(subRequests)
        expect(row.target_team).toBe(s.teamC.id)
        expect(row.status).toBe("pending")
        expect(row.requested_by).toBe(s.capA.id)

        const sentTo = mockedSendBatch.mock.calls.flatMap((call) =>
            call[0].map((m) => m.to)
        )
        expect(sentTo).toEqual([s.capC.email])
        expect(mockedSendBatch.mock.calls[0][0][0].htmlBody).toContain("Team A")
    })

    it("rejects duplicates, own-team candidates, and opponents", async () => {
        const s = await seedLeague()
        loginAs(s.capA)
        expect((await createSubRequest(createInput(s))).status).toBe(true)

        const duplicate = await createSubRequest(createInput(s))
        expect(duplicate.status).toBe(false)

        const teammate = await createUser()
        await draftOnto(s.teamA.id, teammate.id, 3)
        const ownTeam = await createSubRequest({
            ...createInput(s),
            targetUserId: teammate.id
        })
        expect(ownTeam.status).toBe(false)

        const opponentPlayer = await createUser()
        await draftOnto(s.teamB.id, opponentPlayer.id, 4)
        const opponent = await createSubRequest({
            ...createInput(s),
            targetUserId: opponentPlayer.id
        })
        expect(opponent.status).toBe(false)
        expect(!opponent.status && opponent.message).toContain("opposing team")
    })

    it("rejects candidates who aren't on any roster and past matches", async () => {
        const s = await seedLeague()
        loginAs(s.capA)

        const freeAgent = await createUser()
        const noRoster = await createSubRequest({
            ...createInput(s),
            targetUserId: freeAgent.id
        })
        expect(noRoster.status).toBe(false)

        const past = await seedLeague(PAST_DATE)
        loginAs(past.capA)
        const pastResult = await createSubRequest(createInput(past))
        expect(pastResult.status).toBe(false)
        expect(!pastResult.status && pastResult.message).toContain(
            "already been played"
        )
    })
})

describe("respondToSubRequest", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    async function seedWithPendingRequest() {
        const s = await seedLeague()
        loginAs(s.capA)
        const created = await createSubRequest(createInput(s))
        expect(created.status).toBe(true)
        const requestId = created.status ? created.data.requestId : 0
        mockedSendBatch.mockClear()
        return { ...s, requestId }
    }

    it("requesting captain cannot approve their own request", async () => {
        const s = await seedWithPendingRequest()
        loginAs(s.capA)
        const result = await respondToSubRequest({
            requestId: s.requestId,
            decision: "approve"
        })
        expect(result.status).toBe(false)
        expect(!result.status && result.message).toBe("Not authorized.")
    })

    it("approval locks in the sub, cancels siblings, and notifies everyone", async () => {
        const s = await seedWithPendingRequest()

        // Sibling ask to a different candidate on a fourth team.
        const capD = await createUser()
        const teamD = await createTeam({
            season: s.season.id,
            division: s.division.id,
            captain: capD.id,
            name: "Team D"
        })
        const otherCandidate = await createUser()
        await draftOnto(teamD.id, otherCandidate.id, 9)
        loginAs(s.capA)
        const sibling = await createSubRequest({
            ...createInput(s),
            targetUserId: otherCandidate.id
        })
        expect(sibling.status).toBe(true)
        mockedSendBatch.mockClear()

        loginAs(s.capC)
        const result = await respondToSubRequest({
            requestId: s.requestId,
            decision: "approve",
            responseNote: "Happy to help"
        })
        expect(result.status).toBe(true)

        const [request] = await db
            .select()
            .from(subRequests)
            .where(eq(subRequests.id, s.requestId))
        expect(request.status).toBe("approved")
        expect(request.responded_by).toBe(s.capC.id)

        const [subRow] = await db.select().from(matchSubstitutions)
        expect(subRow.match).toBe(s.match.id)
        expect(subRow.original_user).toBe(s.coveredPlayer.id)
        expect(subRow.sub_user).toBe(s.candidate.id)

        const siblingId = sibling.status ? sibling.data.requestId : 0
        const [siblingRow] = await db
            .select()
            .from(subRequests)
            .where(eq(subRequests.id, siblingId))
        expect(siblingRow.status).toBe("cancelled")

        const sentTo = mockedSendBatch.mock.calls.flatMap((call) =>
            call[0].map((m) => m.to)
        )
        // Approval → requesting captain; lock-in → candidate; withdrawal →
        // sibling target captain.
        expect(new Set(sentTo)).toEqual(
            new Set([s.capA.email, s.candidate.email, capD.email])
        )
    })

    it("approval rolls back entirely when the slot is already covered", async () => {
        const s = await seedWithPendingRequest()
        // Someone recorded a sub for the slot out-of-band.
        await db.insert(matchSubstitutions).values({
            match: s.match.id,
            team: s.teamA.id,
            season: s.season.id,
            original_user: s.coveredPlayer.id,
            sub_user: (await createUser()).id,
            performed_by: s.capA.id
        })

        loginAs(s.capC)
        const result = await respondToSubRequest({
            requestId: s.requestId,
            decision: "approve"
        })
        expect(result.status).toBe(false)

        const [request] = await db
            .select()
            .from(subRequests)
            .where(eq(subRequests.id, s.requestId))
        expect(request.status).toBe("pending")
    })

    it("decline notifies the requesting captain and is terminal", async () => {
        const s = await seedWithPendingRequest()
        loginAs(s.capC)

        const result = await respondToSubRequest({
            requestId: s.requestId,
            decision: "decline",
            responseNote: "He's out of town"
        })
        expect(result.status).toBe(true)

        const [request] = await db
            .select()
            .from(subRequests)
            .where(eq(subRequests.id, s.requestId))
        expect(request.status).toBe("declined")
        expect(request.response_note).toBe("He's out of town")

        const sentTo = mockedSendBatch.mock.calls.flatMap((call) =>
            call[0].map((m) => m.to)
        )
        expect(sentTo).toEqual([s.capA.email])

        const again = await respondToSubRequest({
            requestId: s.requestId,
            decision: "approve"
        })
        expect(again.status).toBe(false)
    })

    it("admins can respond on behalf of the target team", async () => {
        const s = await seedWithPendingRequest()
        await createUserWithRoles([{ role: "admin" }])
        const result = await respondToSubRequest({
            requestId: s.requestId,
            decision: "decline"
        })
        expect(result.status).toBe(true)
    })
})

describe("cancel and listing", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("requesting captain can cancel a pending request", async () => {
        const s = await seedLeague()
        loginAs(s.capA)
        const created = await createSubRequest(createInput(s))
        const requestId = created.status ? created.data.requestId : 0
        mockedSendBatch.mockClear()

        // Target captain cannot cancel the other side's request.
        loginAs(s.capC)
        expect((await cancelSubRequest(requestId)).status).toBe(false)

        loginAs(s.capA)
        expect((await cancelSubRequest(requestId)).status).toBe(true)

        const [request] = await db
            .select()
            .from(subRequests)
            .where(eq(subRequests.id, requestId))
        expect(request.status).toBe("cancelled")

        const sentTo = mockedSendBatch.mock.calls.flatMap((call) =>
            call[0].map((m) => m.to)
        )
        expect(sentTo).toEqual([s.capC.email])
    })

    it("lists incoming/outgoing and lazily expires past-dated pendings", async () => {
        const s = await seedLeague()
        loginAs(s.capA)
        await createSubRequest(createInput(s))

        // Outgoing for team A
        loginAs(s.capA)
        const forA = await getSubRequestsForTeam(s.teamA.id)
        expect(forA.status).toBe(true)
        if (forA.status) {
            expect(forA.data.outgoing).toHaveLength(1)
            expect(forA.data.incoming).toHaveLength(0)
            expect(forA.data.outgoing[0].targetTeamName).toBe("Team C")
            expect(forA.data.outgoing[0].candidateName).toBeTruthy()
        }

        // Incoming for team C
        loginAs(s.capC)
        const forC = await getSubRequestsForTeam(s.teamC.id)
        expect(forC.status).toBe(true)
        if (forC.status) {
            expect(forC.data.incoming).toHaveLength(1)
            expect(forC.data.outgoing).toHaveLength(0)
        }

        // Force the request's match into the past → listing expires it.
        const { matches } = await import("@/database/schema")
        await db
            .update(matches)
            .set({ date: PAST_DATE })
            .where(eq(matches.id, s.match.id))
        const expired = await getSubRequestsForTeam(s.teamC.id)
        expect(expired.status).toBe(true)
        if (expired.status) {
            expect(expired.data.incoming[0].status).toBe("expired")
        }
    })
})
