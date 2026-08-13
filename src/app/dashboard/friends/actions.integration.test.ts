import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { drafts, friendships } from "@/database/schema"
import { sentMessages } from "@/test/email"
import {
    createUser,
    createUserWithRoles,
    loginAs,
    logout
} from "@/test/session"
import {
    createDivision,
    createMatch,
    createSeason,
    createTeam
} from "@/test/factories"
import { getLastMatchResultForUser } from "@/lib/next-match"
import {
    cancelFriendRequest,
    getFriendAnalytics,
    removeFriend,
    respondToFriendRequest,
    sendFriendRequest
} from "./actions"

async function allFriendships() {
    return db.select().from(friendships)
}

describe("sendFriendRequest", () => {
    it("rejects unauthenticated callers", async () => {
        const other = await createUser()
        const result = await sendFriendRequest(other.id)
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("rejects friending yourself", async () => {
        const me = await createUserWithRoles([])
        const result = await sendFriendRequest(me.id)
        expect(result).toEqual({
            status: false,
            message: "You can't friend yourself."
        })
    })

    it("rejects a nonexistent target", async () => {
        await createUserWithRoles([])
        const result = await sendFriendRequest("no-such-user")
        expect(result).toEqual({ status: false, message: "Player not found." })
    })

    it("creates a pending request and emails the addressee", async () => {
        const target = await createUser()
        await createUserWithRoles([])

        const result = await sendFriendRequest(target.id)
        expect(result).toMatchObject({
            status: true,
            data: { autoAccepted: false }
        })

        const rows = await allFriendships()
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe("pending")
        expect(rows[0].addressee).toBe(target.id)

        const emails = sentMessages()
        expect(emails).toHaveLength(1)
        expect(emails[0].to).toBe(target.email)
        expect(emails[0].subject).toContain("friend request")
    })

    it("rejects a duplicate request in the same direction", async () => {
        const target = await createUser()
        await createUserWithRoles([])
        await sendFriendRequest(target.id)

        const result = await sendFriendRequest(target.id)
        expect(result).toEqual({
            status: false,
            message: "Request already pending."
        })
        expect(await allFriendships()).toHaveLength(1)
    })

    it("auto-accepts when the target already requested the caller", async () => {
        const alice = await createUserWithRoles([])
        const bob = await createUser()
        const sent = await sendFriendRequest(bob.id)
        expect(sent).toMatchObject({ status: true })

        loginAs(bob)
        const result = await sendFriendRequest(alice.id)
        expect(result).toMatchObject({
            status: true,
            data: { autoAccepted: true }
        })

        const rows = await allFriendships()
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe("accepted")
        expect(rows[0].requester).toBe(alice.id)
        expect(rows[0].responded_at).not.toBeNull()

        // Request email to Bob, then acceptance email back to Alice
        const emails = sentMessages()
        expect(emails).toHaveLength(2)
        expect(emails[1].to).toBe(alice.email)
        expect(emails[1].subject).toContain("accepted")
    })

    it("rejects when already friends", async () => {
        const alice = await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        loginAs(bob)
        await sendFriendRequest(alice.id)

        const result = await sendFriendRequest(alice.id)
        expect(result).toEqual({
            status: false,
            message: "You're already friends."
        })
        loginAs(alice)
        const again = await sendFriendRequest(bob.id)
        expect(again).toEqual({
            status: false,
            message: "You're already friends."
        })
    })
})

describe("respondToFriendRequest", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await respondToFriendRequest(1, "accept")
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("lets the addressee accept and emails the requester", async () => {
        const alice = await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()

        loginAs(bob)
        const result = await respondToFriendRequest(request.id, "accept")
        expect(result).toMatchObject({ status: true })

        const [row] = await allFriendships()
        expect(row.status).toBe("accepted")

        const emails = sentMessages()
        expect(emails).toHaveLength(2)
        expect(emails[1].to).toBe(alice.email)
        expect(emails[1].subject).toContain("accepted")
    })

    it("lets the addressee decline without emailing", async () => {
        await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()

        loginAs(bob)
        const result = await respondToFriendRequest(request.id, "decline")
        expect(result).toMatchObject({ status: true })

        const [row] = await allFriendships()
        expect(row.status).toBe("declined")
        // Only the original request email — declines are silent
        expect(sentMessages()).toHaveLength(1)
    })

    it("rejects a response from anyone but the addressee", async () => {
        await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()

        // Requester can't accept their own request
        const asRequester = await respondToFriendRequest(request.id, "accept")
        expect(asRequester).toEqual({
            status: false,
            message: "Request not found."
        })

        const mallory = await createUser()
        loginAs(mallory)
        const asStranger = await respondToFriendRequest(request.id, "accept")
        expect(asStranger).toEqual({
            status: false,
            message: "Request not found."
        })
    })

    it("rejects responding to an already-resolved request", async () => {
        await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()

        loginAs(bob)
        await respondToFriendRequest(request.id, "decline")
        const result = await respondToFriendRequest(request.id, "accept")
        expect(result).toEqual({
            status: false,
            message: "Request not found."
        })
    })

    it("allows a fresh request after a decline", async () => {
        await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()

        loginAs(bob)
        await respondToFriendRequest(request.id, "decline")

        const result = await sendFriendRequest(request.requester)
        expect(result).toMatchObject({
            status: true,
            data: { autoAccepted: false }
        })
        expect(await allFriendships()).toHaveLength(2)
    })
})

describe("cancelFriendRequest", () => {
    it("lets the requester cancel a pending request", async () => {
        await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()

        const result = await cancelFriendRequest(request.id)
        expect(result).toMatchObject({ status: true })
        const [row] = await allFriendships()
        expect(row.status).toBe("cancelled")
    })

    it("rejects a cancel from the addressee", async () => {
        await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()

        loginAs(bob)
        const result = await cancelFriendRequest(request.id)
        expect(result).toEqual({
            status: false,
            message: "Request not found."
        })
    })
})

describe("removeFriend", () => {
    async function makeFriends() {
        const alice = await createUserWithRoles([])
        const bob = await createUser()
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()
        loginAs(bob)
        await respondToFriendRequest(request.id, "accept")
        return { alice, bob }
    }

    it("removes for both sides regardless of who initiates", async () => {
        const { alice, bob } = await makeFriends()

        // Bob (the addressee) removes Alice (the requester)
        const result = await removeFriend(alice.id)
        expect(result).toMatchObject({ status: true })
        const [row] = await allFriendships()
        expect(row.status).toBe("removed")

        // Alice no longer passes the friendship gate either
        loginAs(alice)
        const analytics = await getFriendAnalytics(bob.id)
        expect(analytics).toEqual({
            status: false,
            message: "You can only view analytics for your friends."
        })
    })

    it("allows a fresh request after removal", async () => {
        const { alice } = await makeFriends()
        await removeFriend(alice.id)

        const result = await sendFriendRequest(alice.id)
        expect(result).toMatchObject({
            status: true,
            data: { autoAccepted: false }
        })
    })

    it("fails when there is no accepted friendship", async () => {
        await createUserWithRoles([])
        const bob = await createUser()
        const result = await removeFriend(bob.id)
        expect(result).toEqual({ status: false, message: "Friend not found." })
    })
})

describe("getFriendAnalytics", () => {
    it("rejects unauthenticated callers", async () => {
        const result = await getFriendAnalytics("anyone")
        expect(result).toEqual({
            status: false,
            message: "Not authenticated."
        })
    })

    it("rejects a non-friend", async () => {
        await createUserWithRoles([])
        const stranger = await createUser()
        const result = await getFriendAnalytics(stranger.id)
        expect(result).toEqual({
            status: false,
            message: "You can only view analytics for your friends."
        })
    })

    it("returns profile and draft history for an accepted friend", async () => {
        const alice = await createUserWithRoles([])
        const bob = await createUser({ pronouns: "they/them" })
        await sendFriendRequest(bob.id)
        const [request] = await allFriendships()
        loginAs(bob)
        await respondToFriendRequest(request.id, "accept")
        loginAs(alice)

        const season = await createSeason()
        const division = await createDivision()
        const team = await createTeam({
            season: season.id,
            captain: bob.id,
            division: division.id
        })
        await db
            .insert(drafts)
            .values({ team: team.id, user: bob.id, round: 1, overall: 1 })

        const result = await getFriendAnalytics(bob.id)
        expect(result.status).toBe(true)
        if (!result.status) return
        expect(result.data.profile.userId).toBe(bob.id)
        expect(result.data.profile.pronouns).toBe("they/them")
        expect(result.data.draftHistory).toHaveLength(1)
        expect(result.data.draftHistory[0].divisionName).toBe(division.name)
        expect(Array.isArray(result.data.eloHistory)).toBe(true)
        expect(result.data.careerStats).toBeDefined()
    })

    it("allows viewing your own analytics", async () => {
        const me = await createUserWithRoles([])
        const result = await getFriendAnalytics(me.id)
        expect(result.status).toBe(true)
    })
})

describe("getLastMatchResultForUser", () => {
    it("orients the result to the player's team on both sides", async () => {
        logout()
        const alice = await createUser()
        const bob = await createUser()
        const season = await createSeason()
        const division = await createDivision()
        const aliceTeam = await createTeam({
            season: season.id,
            captain: alice.id,
            division: division.id,
            name: "Alice Team"
        })
        const bobTeam = await createTeam({
            season: season.id,
            captain: bob.id,
            division: division.id,
            name: "Bob Team"
        })
        await db.insert(drafts).values([
            { team: aliceTeam.id, user: alice.id, round: 1, overall: 1 },
            { team: bobTeam.id, user: bob.id, round: 1, overall: 2 }
        ])
        // Alice's team (home) wins 2-1 on set scores
        await createMatch({
            season: season.id,
            division: division.id,
            week: 3,
            date: "2026-10-01",
            home_team: aliceTeam.id,
            away_team: bobTeam.id,
            home_set1_score: 25,
            away_set1_score: 20,
            home_set2_score: 18,
            away_set2_score: 25,
            home_set3_score: 15,
            away_set3_score: 10
        })

        const aliceResult = await getLastMatchResultForUser(alice.id, season.id)
        expect(aliceResult).toMatchObject({
            won: true,
            myGames: 2,
            oppGames: 1,
            week: 3
        })

        const bobResult = await getLastMatchResultForUser(bob.id, season.id)
        expect(bobResult).toMatchObject({ won: false, myGames: 1, oppGames: 2 })
    })

    it("returns null for a player with no team", async () => {
        const nobody = await createUser()
        const season = await createSeason()
        expect(await getLastMatchResultForUser(nobody.id, season.id)).toBeNull()
    })
})
