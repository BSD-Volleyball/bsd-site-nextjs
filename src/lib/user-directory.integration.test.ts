import { describe, expect, it } from "vitest"
import { createSeason, createSignup } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { listUserNames } from "./user-directory"

// Sign-up needs no verified address, so the directory must not open to an
// account the moment it is created.
describe("listUserNames", () => {
    it("lists every member for a viewer with a verified address", async () => {
        const viewer = await createUser({ emailVerified: true })
        await createUser()

        const names = await listUserNames(viewer.id)
        expect(names.length).toBeGreaterThanOrEqual(2)
        expect(names.map((n) => n.id)).toContain(viewer.id)
    })

    it("lists members for an unverified viewer who has played before", async () => {
        const season = await createSeason()
        const viewer = await createUser({ emailVerified: false })
        await createSignup({ season: season.id, player: viewer.id })

        expect(await listUserNames(viewer.id)).not.toHaveLength(0)
    })

    it("lists members for a role holder, since an admin vouched for them", async () => {
        const viewer = await createUserWithRoles([{ role: "referee" }], {
            emailVerified: false
        })

        expect(await listUserNames(viewer.id)).not.toHaveLength(0)
    })

    it("shows nothing to a brand-new unverified account, or to nobody", async () => {
        const viewer = await createUser({ emailVerified: false })
        await createUser()

        expect(await listUserNames(viewer.id)).toEqual([])
        expect(await listUserNames("")).toEqual([])
    })
})
