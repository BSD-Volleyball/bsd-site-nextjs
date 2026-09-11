import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { type AttachmentParentType, emailAttachments } from "@/database/schema"
import { attachmentContentDisposition } from "@/lib/email-attachments"
import type { Permission } from "@/lib/permissions"
import { createAttachmentDownloadPresignedUrl } from "@/lib/r2"
import { hasPermissionBySession } from "@/next/session"
import { getSeasonConfig } from "@/lib/site-config"

export const runtime = "nodejs"

const PERMISSION_FOR_PARENT: Record<AttachmentParentType, Permission> = {
    email: "admin_emails:view",
    email_received: "admin_emails:view",
    concern: "concerns:view",
    concern_received: "concerns:view"
}

function notFound(): NextResponse {
    return new NextResponse("Not found", { status: 404 })
}

/** Only raster images may be displayed in-page; everything else downloads. */
function mayInline(contentType: string): boolean {
    return contentType.startsWith("image/") && contentType !== "image/svg+xml"
}

/**
 * Hands a staff member who may view the ticket a short-lived signed R2 URL
 * for one of its attachments. The bytes go browser ↔ R2 directly: Vercel caps
 * a function response at 4.5 MB, and Postmark allows 35 MB of attachments.
 * Browsers follow the 302 for both `<a download>` and `<img src>`; R2's
 * signed Content-Disposition keeps the filename on cross-origin downloads.
 *
 * Every failure — bad id, no session, wrong role — is a bare 404 so the
 * route never confirms an attachment exists to someone who can't see it.
 *
 * The Vercel WAF challenges non-browser clients site-wide; a custom bypass
 * rule for GET /api/email-attachments/ keeps `<a download>` fetches working.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: idParam } = await params
    const id = Number(idParam)
    if (!Number.isInteger(id) || id <= 0) return notFound()

    const [row] = await db
        .select({
            parent_type: emailAttachments.parent_type,
            filename: emailAttachments.filename,
            content_type: emailAttachments.content_type,
            size_bytes: emailAttachments.size_bytes,
            r2_key: emailAttachments.r2_key
        })
        .from(emailAttachments)
        .where(eq(emailAttachments.id, id))
        .limit(1)
    if (!row) return notFound()

    const permission = PERMISSION_FOR_PARENT[row.parent_type]
    if (!permission) return notFound()
    const config = await getSeasonConfig()
    const allowed = await hasPermissionBySession(permission, {
        seasonId: config.seasonId
    })
    if (!allowed) return notFound()

    const inline =
        request.nextUrl.searchParams.get("inline") === "1" &&
        mayInline(row.content_type)

    const url = await createAttachmentDownloadPresignedUrl({
        key: row.r2_key,
        contentType: row.content_type,
        contentDisposition: attachmentContentDisposition(
            inline ? "inline" : "attachment",
            row.filename
        )
    })

    return NextResponse.redirect(url, {
        status: 302,
        headers: { "Cache-Control": "private, no-store" }
    })
}
