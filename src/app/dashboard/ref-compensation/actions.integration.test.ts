import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { matchReferees, seasonRefs } from "@/database/schema"
import { createDivision, createMatch, createSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { getRefCompensationData } from "./actions"

describe("getRefCompensationData", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getRefCompensationData()
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("returns empty data for authenticated users without schedule access", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await getRefCompensationData()

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected ok")
        expect(result.data.refs).toEqual([])
        expect(result.data.seasonLabel).toBe("")
        expect(result.data.grandTotalPay).toBe("0.00")
    })

    it("fails when no season exists", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const result = await getRefCompensationData()
        expect(result).toEqual({
            status: false,
            message: "No current season found."
        })
    })

    it("computes per-ref and grand-total payouts from rates and assignments", async () => {
        const season = await createSeason({
            certified_ref_rate: "30.00",
            uncertified_ref_rate: "20.00"
        })
        const division = await createDivision()
        const certifiedRef = await createUser({ last_name: "Alpha" })
        const uncertifiedRef = await createUser({ last_name: "Bravo" })
        const idleRef = await createUser({ last_name: "Charlie" })
        await createUserWithRoles([{ role: "admin" }])

        await db.insert(seasonRefs).values([
            {
                season_id: season.id,
                user_id: certifiedRef.id,
                is_certified: true,
                has_w9: true,
                max_division_level: 6
            },
            {
                season_id: season.id,
                user_id: uncertifiedRef.id,
                is_certified: false,
                max_division_level: 6
            },
            {
                season_id: season.id,
                user_id: idleRef.id,
                is_certified: true,
                max_division_level: 6
            }
        ])

        const match1 = await createMatch({
            season: season.id,
            division: division.id,
            date: "2026-06-01",
            time: "18:00"
        })
        const match2 = await createMatch({
            season: season.id,
            division: division.id,
            date: "2026-06-08",
            time: "19:00"
        })
        const match3 = await createMatch({
            season: season.id,
            division: division.id,
            date: "2026-06-15",
            time: "20:00"
        })
        await db.insert(matchReferees).values([
            {
                match_id: match1.id,
                referee_id: certifiedRef.id,
                season_id: season.id
            },
            {
                match_id: match2.id,
                referee_id: certifiedRef.id,
                season_id: season.id
            },
            {
                match_id: match3.id,
                referee_id: uncertifiedRef.id,
                season_id: season.id
            }
        ])

        const result = await getRefCompensationData()

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected ok")
        const data = result.data

        expect(data.seasonLabel).toBe("Fall 2026")
        expect(data.certifiedRate).toBe("30.00")
        expect(data.uncertifiedRate).toBe("20.00")
        expect(data.refs).toHaveLength(3)

        const certified = data.refs.find((r) => r.userId === certifiedRef.id)
        expect(certified?.ratePerMatch).toBe("30.00")
        expect(certified?.totalMatches).toBe(2)
        expect(certified?.totalPay).toBe("60.00")
        expect(certified?.hasW9).toBe(true)

        const uncertified = data.refs.find(
            (r) => r.userId === uncertifiedRef.id
        )
        expect(uncertified?.ratePerMatch).toBe("20.00")
        expect(uncertified?.totalMatches).toBe(1)
        expect(uncertified?.totalPay).toBe("20.00")
        // Matches without team rows render as TBD instead of being dropped.
        expect(uncertified?.matchesWorked[0].homeTeamName).toBe("TBD")

        const idle = data.refs.find((r) => r.userId === idleRef.id)
        expect(idle?.totalMatches).toBe(0)
        expect(idle?.totalPay).toBe("0.00")

        expect(data.grandTotalPay).toBe("80.00")
        expect(data.grandTotalMatches).toBe(3)
    })

    it("treats missing season rates as zero", async () => {
        const season = await createSeason()
        const division = await createDivision()
        const ref = await createUser()
        await createUserWithRoles([{ role: "admin" }])

        await db.insert(seasonRefs).values({
            season_id: season.id,
            user_id: ref.id,
            is_certified: true,
            max_division_level: 6
        })
        const match = await createMatch({
            season: season.id,
            division: division.id
        })
        await db.insert(matchReferees).values({
            match_id: match.id,
            referee_id: ref.id,
            season_id: season.id
        })

        const result = await getRefCompensationData()

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected ok")
        expect(result.data.refs[0].ratePerMatch).toBe("0.00")
        expect(result.data.refs[0].totalPay).toBe("0.00")
        expect(result.data.grandTotalPay).toBe("0.00")
        expect(result.data.grandTotalMatches).toBe(1)
    })
})
