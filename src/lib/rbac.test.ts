import { beforeEach, describe, expect, it, vi } from "vitest"

// rbac transitively imports @/lib/auth (boots better-auth at module load) and
// @/database/db. Stub both so these tests exercise the pure decision logic of
// commissionerCanWriteDivision over a controlled user_roles read.
const { whereMock } = vi.hoisted(() => ({ whereMock: vi.fn() }))

vi.mock("@/lib/auth", () => ({
    auth: { api: { getSession: vi.fn(async () => null) } }
}))
vi.mock("@/database/db", () => ({
    db: {
        select: () => ({ from: () => ({ where: whereMock }) })
    }
}))

import { commissionerCanWriteDivision } from "@/lib/rbac"

// Each call to commissionerCanWriteDivision reads user_roles at most twice:
//   1. isAdminOrDirector -> getUserRoleRows (all role rows for the user)
//   2. getCommissionerDivisionScope -> commissioner rows ({ divisionId } shape)
// Queue results in that order. A unique userId per test avoids the React
// cache() memoization on getUserRoleRows leaking across tests.
describe("commissionerCanWriteDivision", () => {
    beforeEach(() => {
        whereMock.mockReset()
    })

    it("allows admins to write any division (league-wide)", async () => {
        whereMock.mockResolvedValueOnce([
            { role: "admin", season_id: null, division_id: null }
        ])
        expect(await commissionerCanWriteDivision("admin-user", 10, 3)).toBe(
            true
        )
    })

    it("allows league-wide commissioners to write any division", async () => {
        whereMock
            .mockResolvedValueOnce([]) // not an admin
            .mockResolvedValueOnce([{ divisionId: null }]) // league-wide comm row
        expect(await commissionerCanWriteDivision("league-comm", 10, 3)).toBe(
            true
        )
    })

    it("allows a division-scoped commissioner only for divisions they hold", async () => {
        whereMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ divisionId: 3 }, { divisionId: 7 }])
        expect(await commissionerCanWriteDivision("div-comm", 10, 3)).toBe(true)
    })

    it("denies a division-scoped commissioner for a division they do not hold", async () => {
        whereMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ divisionId: 7 }])
        expect(await commissionerCanWriteDivision("div-comm-2", 10, 3)).toBe(
            false
        )
    })

    it("denies a user with no commissioner role", async () => {
        whereMock.mockResolvedValueOnce([]).mockResolvedValueOnce([])
        expect(await commissionerCanWriteDivision("nobody", 10, 3)).toBe(false)
    })
})
