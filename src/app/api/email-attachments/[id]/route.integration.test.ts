import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"
import { db } from "@/database/db"
import { type AttachmentParentType, emailAttachments } from "@/database/schema"
import { createAttachmentDownloadPresignedUrl } from "@/lib/r2"
import { createUserWithRoles, logout } from "@/test/session"
import { GET } from "./route"

const PRESIGNED_URL = "https://r2.test/presigned-download"

async function seedAttachment(
    parentType: AttachmentParentType,
    overrides: { filename?: string; content_type?: string } = {}
) {
    const [row] = await db
        .insert(emailAttachments)
        .values({
            parent_type: parentType,
            parent_id: 1,
            filename: overrides.filename ?? "réunion notes.pdf",
            content_type: overrides.content_type ?? "application/pdf",
            size_bytes: 4,
            r2_key: `email-attachments/test/${parentType}-${overrides.filename ?? "notes"}`
        })
        .returning({ id: emailAttachments.id })
    return row.id
}

function get(id: number | string, query = "") {
    const url = `http://localhost:3000/api/email-attachments/${id}${query}`
    return GET(new NextRequest(url), {
        params: Promise.resolve({ id: String(id) })
    })
}

describe("GET /api/email-attachments/[id]", () => {
    it("redirects an admin to a signed R2 download", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const id = await seedAttachment("email")

        const res = await get(id)

        expect(res.status).toBe(302)
        expect(res.headers.get("location")).toBe(PRESIGNED_URL)
        expect(res.headers.get("cache-control")).toBe("private, no-store")
        expect(
            vi.mocked(createAttachmentDownloadPresignedUrl)
        ).toHaveBeenCalledWith({
            key: "email-attachments/test/email-notes",
            contentType: "application/pdf",
            contentDisposition: `attachment; filename="r_union notes.pdf"; filename*=UTF-8''r%C3%A9union%20notes.pdf`
        })
    })

    it("inlines a raster image when asked", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const id = await seedAttachment("email", {
            filename: "map.png",
            content_type: "image/png"
        })

        const res = await get(id, "?inline=1")

        expect(res.status).toBe(302)
        expect(
            vi.mocked(createAttachmentDownloadPresignedUrl)
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                contentType: "image/png",
                contentDisposition: expect.stringMatching(/^inline;/)
            })
        )
    })

    it("never inlines a non-image even when asked", async () => {
        await createUserWithRoles([{ role: "admin" }])
        const id = await seedAttachment("email")

        await get(id, "?inline=1")

        expect(
            vi.mocked(createAttachmentDownloadPresignedUrl)
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                contentDisposition: expect.stringMatching(/^attachment;/)
            })
        )
    })

    it("hides email attachments from a captain and from anonymous", async () => {
        const id = await seedAttachment("email_received")

        await createUserWithRoles([{ role: "captain" }])
        expect((await get(id)).status).toBe(404)

        logout()
        expect((await get(id)).status).toBe(404)
        expect(
            vi.mocked(createAttachmentDownloadPresignedUrl)
        ).not.toHaveBeenCalled()
    })

    it("scopes concern attachments to the ombudsman role", async () => {
        const concernId = await seedAttachment("concern_received")
        const emailId = await seedAttachment("email", { filename: "other.pdf" })

        await createUserWithRoles([{ role: "ombudsman" }])
        expect((await get(concernId)).status).toBe(302)
        expect((await get(emailId)).status).toBe(404)
        expect(
            vi.mocked(createAttachmentDownloadPresignedUrl)
        ).toHaveBeenCalledTimes(1)
    })

    it("404s for a bad id or a missing row", async () => {
        await createUserWithRoles([{ role: "admin" }])
        expect((await get("abc")).status).toBe(404)
        expect((await get(999999)).status).toBe(404)
        expect(
            vi.mocked(createAttachmentDownloadPresignedUrl)
        ).not.toHaveBeenCalled()
    })
})
