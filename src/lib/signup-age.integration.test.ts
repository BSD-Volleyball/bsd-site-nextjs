import { beforeEach, describe, expect, it } from "vitest"
import { createSeason, createSignup } from "@/test/factories"
import { createUser } from "@/test/session"
import { hasRecordedAdultAge } from "./signup-age"

describe("hasRecordedAdultAge", () => {
    let seasonId: number

    beforeEach(async () => {
        seasonId = (await createSeason()).id
    })

    it("is false for a player with no signups", async () => {
        const player = await createUser()
        expect(await hasRecordedAdultAge(player.id)).toBe(false)
    })

    it("is true once any signup recorded the adult age group", async () => {
        const player = await createUser()
        await createSignup({
            season: seasonId,
            player: player.id,
            age: "20+"
        })
        expect(await hasRecordedAdultAge(player.id)).toBe(true)
    })

    it("is false for a player only ever recorded as a minor", async () => {
        const player = await createUser()
        await createSignup({
            season: seasonId,
            player: player.id,
            age: "17-16"
        })
        expect(await hasRecordedAdultAge(player.id)).toBe(false)
    })

    it("is false when the age was never recorded", async () => {
        const player = await createUser()
        await createSignup({
            season: seasonId,
            player: player.id,
            age: null
        })
        expect(await hasRecordedAdultAge(player.id)).toBe(false)
    })

    it("does not leak another player's recorded age", async () => {
        const adult = await createUser()
        const other = await createUser()
        await createSignup({
            season: seasonId,
            player: adult.id,
            age: "20+"
        })
        expect(await hasRecordedAdultAge(other.id)).toBe(false)
    })
})
