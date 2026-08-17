import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts } from "@/database/schema"
import { createDivision, createSeason, createTeam } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getLegacyAccounts, getMergeTargets } from "./actions"

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
