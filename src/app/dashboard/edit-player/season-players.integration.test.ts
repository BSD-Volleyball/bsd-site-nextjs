import { describe, expect, it } from "vitest"
import { createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles, logout } from "@/test/session"
import { getCurrentSeasonPlayers } from "./actions"

describe("getCurrentSeasonPlayers", () => {
    it("lists this season's signups by name, alphabetically", async () => {
        const oldSeason = await createSeason()
        const season = await createSeason()
        const zed = await createUser({
            first_name: "Zed",
            last_name: "Zeta",
            preferred_name: null
        })
        const amy = await createUser({
            first_name: "Amy",
            last_name: "Alpha",
            preferred_name: "Ames"
        })
        const stale = await createUser()
        await createSignup({ season: season.id, player: zed.id })
        await createSignup({ season: season.id, player: amy.id })
        await createSignup({ season: oldSeason.id, player: stale.id })
        await createUserWithRoles([{ role: "admin" }])

        const result = await getCurrentSeasonPlayers()

        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.map((p) => p.id)).toEqual([amy.id, zed.id])
        expect(result.data[0].name).toBe("Amy (Ames) Alpha")
    })

    it("refuses non-admins and anonymous callers", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])
        expect(await getCurrentSeasonPlayers()).toEqual({
            status: false,
            message: "Unauthorized."
        })
        logout()
        expect(await getCurrentSeasonPlayers()).toEqual({
            status: false,
            message: "Unauthorized."
        })
    })
})
