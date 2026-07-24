import { describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { emailBroadcasts } from "@/database/schema"
import type { LexicalEmailTemplateContent } from "@/lib/email-template-content"
import { normalizeEmailTemplateContent } from "@/lib/email-template-content"
import { sendBroadcastEmails } from "@/lib/postmark"
import {
    createDivision,
    createSeason,
    createSeasonEvent
} from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { createAndSendBroadcast, previewBroadcast } from "./actions"

const EMPTY_BODY = normalizeEmailTemplateContent("")

function bodyWith(prefix: string, variableKey: string) {
    const content: LexicalEmailTemplateContent = {
        root: {
            type: "root",
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
                {
                    type: "paragraph",
                    direction: null,
                    format: "",
                    indent: 0,
                    version: 1,
                    children: [
                        {
                            type: "text",
                            detail: 0,
                            format: 0,
                            mode: "normal",
                            style: "",
                            text: prefix,
                            version: 1
                        },
                        {
                            type: "template-variable",
                            variableKey,
                            version: 1
                        }
                    ]
                }
            ]
        }
    }
    return content
}

async function broadcastRows() {
    return db.select().from(emailBroadcasts)
}

describe("createAndSendBroadcast", () => {
    it("resolves template variables in subject and body before sending", async () => {
        const season = await createSeason() // fall 2026, registration_open
        await createSeasonEvent(season.id) // tryout on 2026-09-05
        await createUserWithRoles([{ role: "admin" }])
        await createUser()

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject:
                "BSD [season_name] Registration is Open — tryouts [tryout_1_date]!",
            lexicalContent: bodyWith("Welcome to ", "season_name")
        })

        expect(result.status).toBe(true)
        expect(sendBroadcastEmails).toHaveBeenCalledOnce()
        const call = vi.mocked(sendBroadcastEmails).mock.calls[0][0]
        expect(call.subject).toContain("BSD Fall 2026 Registration is Open")
        expect(call.subject).toContain("September 5, 2026")
        expect(call.subject).not.toContain("[")
        expect(call.htmlBody).toContain("Welcome to Fall 2026")

        // The stored broadcast records what was actually sent
        const [row] = await broadcastRows()
        expect(row.subject).toContain("Fall 2026")
        expect(row.subject).not.toContain("[season_name]")
        expect(row.html_content).toContain("Welcome to Fall 2026")
    })

    it("resolves division variables for division sends", async () => {
        const season = await createSeason()
        const division = await createDivision({ name: "AA", level: 2 })
        await createSeasonEvent(season.id, {
            event_type: "draft",
            event_date: "2026-09-14",
            sort_order: 0
        })
        await createSeasonEvent(season.id, {
            event_type: "draft",
            event_date: "2026-09-15",
            sort_order: 1
        })
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "division",
            divisionId: division.id,
            subject: "[division_name] draft is [division_draft_date]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const [row] = await broadcastRows()
        expect(row.subject).toContain("AA draft is")
        expect(row.subject).toContain("September 15, 2026")
    })

    it("leaves bracketed text that is not a known variable untouched", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "[BSD] fun in [season_name]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        const [row] = await broadcastRows()
        expect(row.subject).toBe("[BSD] fun in Fall 2026")
    })

    it("refuses to send when the subject has a variable it cannot resolve", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "A note from [captain_names]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(false)
        expect(result.message).toContain("captain_names")
        expect(sendBroadcastEmails).not.toHaveBeenCalled()
        expect(await broadcastRows()).toHaveLength(0)
    })

    it("refuses to send when the body has a variable it cannot resolve", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "Hello",
            lexicalContent: bodyWith("Rounds: ", "captain_rounds")
        })

        expect(result.status).toBe(false)
        expect(result.message).toContain("captain_rounds")
        expect(sendBroadcastEmails).not.toHaveBeenCalled()
        expect(await broadcastRows()).toHaveLength(0)
    })

    it("sends only to the signed-in user for just_me", async () => {
        const season = await createSeason()
        await createSeasonEvent(season.id)
        const admin = await createUserWithRoles([{ role: "admin" }])
        await createUser() // bystander who must NOT receive the test email
        await createUser()

        const result = await createAndSendBroadcast({
            sendToType: "just_me",
            subject: "Test: BSD [season_name] Registration is Open!!",
            lexicalContent: bodyWith("Welcome to ", "season_name")
        })

        expect(result.status).toBe(true)
        expect(sendBroadcastEmails).toHaveBeenCalledOnce()
        const call = vi.mocked(sendBroadcastEmails).mock.calls[0][0]
        expect(call.recipients).toEqual([{ email: admin.email }])
        expect(call.subject).toBe("Test: BSD Fall 2026 Registration is Open!!")

        const [row] = await broadcastRows()
        expect(row.sent_count).toBe(1)
    })

    it("allows commissioners to send just_me", async () => {
        const season = await createSeason()
        const commissioner = await createUserWithRoles([
            { role: "commissioner", seasonId: season.id }
        ])
        await createUser()

        const result = await createAndSendBroadcast({
            sendToType: "just_me",
            subject: "Testing [season_name]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        expect(sendBroadcastEmails).toHaveBeenCalledOnce()
        const call = vi.mocked(sendBroadcastEmails).mock.calls[0][0]
        expect(call.recipients).toEqual([{ email: commissioner.email }])
    })

    it("returns Unauthorized for an authenticated non-admin", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "Hi",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Unauthorized."
        })
    })

    it("rejects unauthenticated calls", async () => {
        await createSeason()

        const result = await createAndSendBroadcast({
            sendToType: "everyone",
            subject: "Hi",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Not authenticated."
        })
    })
})

describe("previewBroadcast", () => {
    it("returns the resolved subject, body html, and recipient count without sending", async () => {
        const season = await createSeason()
        await createSeasonEvent(season.id)
        await createUserWithRoles([{ role: "admin" }])
        await createUser()

        const result = await previewBroadcast({
            sendToType: "everyone",
            subject: "BSD [season_name] Registration is Open!!",
            lexicalContent: bodyWith("Welcome to ", "season_name")
        })

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected success")
        expect(result.data.subject).toBe("BSD Fall 2026 Registration is Open!!")
        expect(result.data.html).toContain("Welcome to Fall 2026")
        expect(result.data.groupName).toBe("All Users")
        expect(result.data.recipientCount).toBe(2)

        expect(sendBroadcastEmails).not.toHaveBeenCalled()
        expect(await broadcastRows()).toHaveLength(0)
    })

    it("previews a just_me send as one recipient", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])
        await createUser()

        const result = await previewBroadcast({
            sendToType: "just_me",
            subject: "Test: [season_name]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(true)
        if (!result.status) throw new Error("expected success")
        expect(result.data.subject).toBe("Test: Fall 2026")
        expect(result.data.groupName).toBe("Just Me")
        expect(result.data.recipientCount).toBe(1)
        expect(sendBroadcastEmails).not.toHaveBeenCalled()
    })

    it("reports unresolved variables instead of previewing", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "admin" }])

        const result = await previewBroadcast({
            sendToType: "everyone",
            subject: "A note from [captain_names]",
            lexicalContent: EMPTY_BODY
        })

        expect(result.status).toBe(false)
        expect(result.message).toContain("captain_names")
    })

    it("returns Unauthorized for an authenticated non-admin", async () => {
        await createSeason()
        await createUserWithRoles([{ role: "captain" }])

        const result = await previewBroadcast({
            sendToType: "everyone",
            subject: "Hi",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Unauthorized."
        })
    })

    it("rejects unauthenticated calls", async () => {
        await createSeason()

        const result = await previewBroadcast({
            sendToType: "everyone",
            subject: "Hi",
            lexicalContent: EMPTY_BODY
        })

        expect(result).toMatchObject({
            status: false,
            message: "Not authenticated."
        })
    })
})
