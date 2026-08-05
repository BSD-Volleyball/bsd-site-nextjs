import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { userRoles } from "@/database/schema"
import { createDivision, createSeason } from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import { getUsersWithRole } from "./actions"

describe("getUsersWithRole", () => {
    it("returns all holders of a role with scope labels, ordered by name", async () => {
        const season = await createSeason({ code: "F26" })
        const division = await createDivision({ name: "AA", level: 2 })
        await createUserWithRoles([{ role: "admin" }])
        const globalLeader = await createUser({
            first_name: "Zoe",
            last_name: "Adams",
            name: "Zoe Adams"
        })
        const scopedCommissioner = await createUser({
            first_name: "Amy",
            last_name: "Baker",
            name: "Amy Baker"
        })
        await createUser() // holds no roles

        await db.insert(userRoles).values([
            { user_id: globalLeader.id, role: "leadership_group" },
            {
                user_id: scopedCommissioner.id,
                role: "commissioner",
                season_id: season.id,
                division_id: division.id
            },
            {
                user_id: globalLeader.id,
                role: "commissioner",
                season_id: season.id
            }
        ])

        const leaders = await getUsersWithRole("leadership_group")
        expect(leaders).toHaveLength(1)
        expect(leaders[0]).toMatchObject({
            user_id: globalLeader.id,
            name: "Zoe Adams",
            season_id: null,
            season_label: null,
            division_label: null
        })

        const commissioners = await getUsersWithRole("commissioner")
        expect(commissioners.map((c) => c.user_id)).toEqual([
            globalLeader.id,
            scopedCommissioner.id
        ])
        expect(commissioners[0]).toMatchObject({
            season_label: "F26 2026 fall",
            division_label: null
        })
        expect(commissioners[1]).toMatchObject({
            season_label: "F26 2026 fall",
            division_label: "AA"
        })
    })

    it("returns [] for an unknown role string", async () => {
        await createUserWithRoles([{ role: "admin" }])
        expect(await getUsersWithRole("director; DROP TABLE users")).toEqual([])
    })

    it("returns [] for authenticated non-admins", async () => {
        const leader = await createUser()
        await db
            .insert(userRoles)
            .values([{ user_id: leader.id, role: "leadership_group" }])
        await createUserWithRoles([{ role: "captain" }])

        expect(await getUsersWithRole("leadership_group")).toEqual([])
    })

    it("returns [] for unauthenticated callers", async () => {
        const leader = await createUser()
        await db
            .insert(userRoles)
            .values([{ user_id: leader.id, role: "leadership_group" }])
        logout()

        expect(await getUsersWithRole("leadership_group")).toEqual([])
    })
})
