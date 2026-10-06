import { describe, expect, it } from "vitest"
import { createSeason } from "@/test/factories"
import { createUserWithRoles } from "@/test/session"
import { hasPermission } from "./rbac"

// A season-bound role grants its permissions for that season only. Before
// hasPermission defaulted to the current season, a check made without a
// seasonId matched season-bound rows from any season, so last year's
// referee coordinator still held schedule:manage.
describe("hasPermission season scoping", () => {
    it("ignores a season-bound role from a past season when no season is given", async () => {
        const past = await createSeason({ year: 2024 })
        await createSeason({ year: 2026 })
        const user = await createUserWithRoles([
            { role: "referee_coordinator", seasonId: past.id }
        ])

        expect(await hasPermission(user.id, "schedule:manage")).toBe(false)
        // Asking about that season explicitly still answers for it.
        expect(
            await hasPermission(user.id, "schedule:manage", {
                seasonId: past.id
            })
        ).toBe(true)
    })

    it("honors a season-bound role for the current season", async () => {
        await createSeason({ year: 2024 })
        const current = await createSeason({ year: 2026 })
        const user = await createUserWithRoles([
            { role: "referee_coordinator", seasonId: current.id }
        ])

        expect(await hasPermission(user.id, "schedule:manage")).toBe(true)
    })

    it("always honors a global role", async () => {
        await createSeason()
        const user = await createUserWithRoles([{ role: "admin" }])

        expect(await hasPermission(user.id, "schedule:manage")).toBe(true)
    })
})
