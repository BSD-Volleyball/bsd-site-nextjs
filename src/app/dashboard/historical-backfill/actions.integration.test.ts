import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { auditLog, drafts, teams, users } from "@/database/schema"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import {
    getLegacyAccounts,
    getMergeTargets,
    mergeLegacyAccount
} from "./actions"

let legacyCounter = 0

function legacyEmail(kind: "roster" | "hoc" = "roster") {
    legacyCounter++
    return `legacy-${kind}-test-${legacyCounter}-${crypto
        .randomUUID()
        .slice(0, 8)}@bumpsetdrink.com`
}

async function createLegacyUser(
    firstName: string,
    lastName: string,
    kind: "roster" | "hoc" = "roster"
) {
    return createUser({
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`,
        email: legacyEmail(kind)
    })
}

async function userExists(id: string): Promise<boolean> {
    const rows = await db.select().from(users).where(eq(users.id, id))
    return rows.length === 1
}

describe("mergeLegacyAccount", () => {
    it("rejects unauthenticated callers", async () => {
        const legacy = await createLegacyUser("Bill", "Smith")
        const member = await createUser()

        const result = await mergeLegacyAccount(legacy.id, member.id)

        expect(result).toEqual({ status: false, message: "Not authenticated." })
        expect(await userExists(legacy.id)).toBe(true)
    })

    it("rejects authenticated non-admins", async () => {
        const legacy = await createLegacyUser("Bill", "Smith")
        const member = await createUser()
        await createUserWithRoles([{ role: "captain" }])

        const result = await mergeLegacyAccount(legacy.id, member.id)

        expect(result).toEqual({ status: false, message: "Unauthorized." })
        expect(await userExists(legacy.id)).toBe(true)
    })

    it("refuses when the source is a real member account", async () => {
        // The safety rail: whatever ids arrive, this action can only ever
        // delete a placeholder, never a member's account.
        const realSource = await createUser()
        const member = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeLegacyAccount(realSource.id, member.id)

        expect(result.status).toBe(false)
        expect(result.message).toContain("real member")
        expect(await userExists(realSource.id)).toBe(true)
    })

    it("refuses to merge one placeholder into another", async () => {
        const legacyA = await createLegacyUser("Bill", "Smith")
        const legacyB = await createLegacyUser("William", "Smith")
        await createUserWithRoles([{ role: "admin" }])

        const result = await mergeLegacyAccount(legacyA.id, legacyB.id)

        expect(result).toEqual({
            status: false,
            message: "Cannot merge one legacy placeholder into another."
        })
        expect(await userExists(legacyA.id)).toBe(true)
    })

    it("fails cleanly on a missing account", async () => {
        const member = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        expect(
            await mergeLegacyAccount(crypto.randomUUID(), member.id)
        ).toEqual({ status: false, message: "Legacy account not found." })
    })

    it("moves history to the member, leaves their identity alone, and deletes the placeholder", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const legacy = await createLegacyUser("Bill", "Smith")
        const member = await createUser({
            first_name: "William",
            last_name: "Smith",
            old_id: 1234,
            picture: "member-pic.jpg"
        })
        const admin = await createUserWithRoles([{ role: "admin" }])

        const captainedTeam = await createTeam({
            season: season.id,
            captain: legacy.id,
            division: division.id
        })
        const [draft] = await db
            .insert(drafts)
            .values({
                team: captainedTeam.id,
                user: legacy.id,
                round: 4,
                overall: 1
            })
            .returning()

        const result = await mergeLegacyAccount(legacy.id, member.id)

        expect(result.status).toBe(true)
        expect(result.message).toBe("Legacy account merged.")
        expect(await userExists(legacy.id)).toBe(false)

        const [draftRow] = await db
            .select()
            .from(drafts)
            .where(eq(drafts.id, draft.id))
        expect(draftRow.user).toBe(member.id)
        const [teamRow] = await db
            .select()
            .from(teams)
            .where(eq(teams.id, captainedTeam.id))
        expect(teamRow.captain).toBe(member.id)

        // copyIdentity: false — a placeholder's freshly-issued old_id and null
        // picture must not overwrite the member's own.
        const [after] = await db
            .select()
            .from(users)
            .where(eq(users.id, member.id))
        expect(after.old_id).toBe(1234)
        expect(after.picture).toBe("member-pic.jpg")

        const audit = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.user, admin.id))
        expect(audit).toHaveLength(1)
        expect(audit[0].action).toBe("merge")
        expect(audit[0].entity_id).toBe(member.id)
    })
})

describe("getLegacyAccounts", () => {
    it("rejects unauthenticated and non-admin callers", async () => {
        expect(await getLegacyAccounts()).toEqual({
            status: false,
            message: "Unauthorized."
        })
        await createUserWithRoles([{ role: "captain" }])
        expect(await getLegacyAccounts()).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })

    it("lists placeholders with their history and a suggested member", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const member = await createUser({
            first_name: "William",
            last_name: "Smithers"
        })
        const legacy = await createLegacyUser("Bill", "Smithers")
        await createUserWithRoles([{ role: "admin" }])

        const team = await createTeam({
            season: season.id,
            captain: member.id,
            division: division.id
        })
        await db
            .insert(drafts)
            .values({ team: team.id, user: legacy.id, round: 4, overall: 1 })

        const result = await getLegacyAccounts()

        expect(result.status).toBe(true)
        if (!result.status) return
        const row = result.data.find((r) => r.id === legacy.id)
        expect(row).toBeDefined()
        expect(row?.kind).toBe("roster")
        expect(row?.draftCount).toBe(1)
        expect(row?.seasonCodes).toEqual([season.code])
        expect(row?.suggestion?.id).toBe(member.id)
        expect(row?.suggestion?.reason).toBe("nickname")
        // Real members are never listed as placeholders.
        expect(result.data.some((r) => r.id === member.id)).toBe(false)
    })

    it("withholds a suggestion from someone who played on the same team", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const captain = await createUser()
        const member = await createUser({
            first_name: "James",
            last_name: "Jimenez"
        })
        const legacy = await createLegacyUser("Jimmy", "Jimenez")
        await createUserWithRoles([{ role: "admin" }])

        const team = await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id
        })
        await db.insert(drafts).values([
            { team: team.id, user: legacy.id, round: 4, overall: 1 },
            { team: team.id, user: member.id, round: 4, overall: 2 }
        ])

        const result = await getLegacyAccounts()

        expect(result.status).toBe(true)
        if (!result.status) return
        const row = result.data.find((r) => r.id === legacy.id)
        expect(row?.suggestion).toBeNull()
        expect(row?.sameTeamIds).toContain(member.id)
    })
})

describe("getMergeTargets", () => {
    it("rejects non-admins and excludes placeholders for admins", async () => {
        expect(await getMergeTargets()).toEqual({
            status: false,
            message: "Unauthorized."
        })

        const legacy = await createLegacyUser("Bill", "Smith")
        const member = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getMergeTargets()

        expect(result.status).toBe(true)
        if (!result.status) return
        const ids = result.data.map((t) => t.id)
        expect(ids).toContain(member.id)
        expect(ids).not.toContain(legacy.id)
    })
})
