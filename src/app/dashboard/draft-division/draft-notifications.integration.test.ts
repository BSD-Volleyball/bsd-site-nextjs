import { beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { drafts } from "@/database/schema"
import { sendBatchEmails } from "@/lib/postmark"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { submitDraft } from "./actions"

const mockedSendBatch = vi.mocked(sendBatchEmails)

describe("submitDraft draft-result notifications", () => {
    beforeEach(() => {
        process.env.NOTIFICATION_UNSUB_SECRET = "test-secret"
    })

    it("emails each drafted player their team and captain", async () => {
        const season = await createSeason()
        const division = await createDivision({ name: "AA", level: 1 })
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            division: division.id,
            captain: captain.id,
            name: "Sets on the Beach",
            number: 4
        })
        const playerA = await createUser()
        const playerB = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await submitDraft(1, [
            { teamId: team.id, teamNumber: 1, userId: playerA.id, round: 1 },
            { teamId: team.id, teamNumber: 1, userId: playerB.id, round: 2 }
        ])
        expect(result.status).toBe(true)

        const draftRows = await db.select().from(drafts)
        expect(draftRows).toHaveLength(2)

        expect(mockedSendBatch).toHaveBeenCalledTimes(1)
        const messages = mockedSendBatch.mock.calls[0][0]
        expect(new Set(messages.map((m) => m.to))).toEqual(
            new Set([playerA.email, playerB.email])
        )
        expect(messages[0].tag).toBe("draft-results")
        expect(messages[0].htmlBody).toContain("Sets on the Beach")
    })

    it("draft submission succeeds even when email dispatch blows up", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const captain = await createUser()
        const team = await createTeam({
            season: season.id,
            division: division.id,
            captain: captain.id
        })
        const player = await createUser()
        await createUserWithRoles([{ role: "admin" }])
        mockedSendBatch.mockRejectedValueOnce(new Error("postmark down"))

        const result = await submitDraft(1, [
            { teamId: team.id, teamNumber: 1, userId: player.id, round: 1 }
        ])
        expect(result.status).toBe(true)

        const draftRows = await db.select().from(drafts)
        expect(draftRows).toHaveLength(1)
    })
})
