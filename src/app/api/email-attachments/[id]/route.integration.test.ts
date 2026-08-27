import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { type AttachmentParentType, emailAttachments } from "@/database/schema"
import { getR2Object } from "@/lib/r2"
import { createUserWithRoles, logout } from "@/test/session"
import { GET } from "./route"

async function seedAttachment(parentType: AttachmentParentType) {
    const [row] = await db
        .insert(emailAttachments)
        .values({
            parent_type: parentType,
            parent_id: 1,
            filename: "réunion notes.pdf",
            content_type: "application/pdf",
            size_bytes: 4,
            r2_key: `email-attachments/test/${parentType}.pdf`
        })
        .returning({ id: emailAttachments.id })
    return row.id
}

function stubObject() {
    vi.mocked(getR2Object).mockResolvedValueOnce({
        body: new Blob(["%PDF"]).stream(),
        contentType: "application/pdf",
        contentLength: 4
    })
}

function get(id: number | string, query = "") {
    const url = `http://localhost:3000/api/email-attachments/${id}${query}`
    return GET(new NextRequest(url), {
        params: Promise.resolve({ id: String(id) })
    })
}

describe("GET /api/email-attachments/[id]", () => {
    it("streams an email attachment to an admin as a download", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const id = await seedAttachment("email")
        stubObject()

        const res = await get(id)

        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toBe("application/pdf")
        expect(res.headers.get("content-disposition")).toBe(
            `attachment; filename="r_union notes.pdf"; filename*=UTF-8''r%C3%A9union%20notes.pdf`
        )
        expect(res.headers.get("cache-control")).toBe("private, no-store")
        expect(await res.text()).toBe("%PDF")
        expect(vi.mocked(getR2Object)).toHaveBeenCalledWith(
            "email-attachments/test/email.pdf"
        )
    })

    it("never inlines a non-image even when asked", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const id = await seedAttachment("email")
        stubObject()

        const res = await get(id, "?inline=1")

        expect(res.headers.get("content-disposition")).toMatch(/^attachment;/)
    })

    it("hides email attachments from a captain and from anonymous", async () => {
        const id = await seedAttachment("email_received")

        await createUserWithRoles([{ role: "captain" }])
        expect((await get(id)).status).toBe(404)

        logout()
        expect((await get(id)).status).toBe(404)
        expect(vi.mocked(getR2Object)).not.toHaveBeenCalled()
    })

    it("scopes concern attachments to the ombudsman role", async () => {
        const concernId = await seedAttachment("concern_received")
        const emailId = await seedAttachment("email")

        await createUserWithRoles([{ role: "ombudsman" }])
        stubObject()
        expect((await get(concernId)).status).toBe(200)
        expect((await get(emailId)).status).toBe(404)
    })

    it("404s for a bad id or a missing object", async () => {
        await createUserWithRoles([{ role: "admin" }])
        expect((await get("abc")).status).toBe(404)
        expect((await get(999999)).status).toBe(404)

        const id = await seedAttachment("email")
        // getR2Object mock resolves null by default → object missing.
        expect((await get(id)).status).toBe(404)
    })
})
