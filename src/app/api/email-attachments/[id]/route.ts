import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/database/db"
import { type AttachmentParentType, emailAttachments } from "@/database/schema"
import type { Permission } from "@/lib/permissions"
import { getR2Object } from "@/lib/r2"
import { hasPermissionBySession } from "@/lib/rbac"
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

/** RFC 6266 Content-Disposition with an ASCII fallback plus UTF-8 filename*. */
function contentDisposition(type: "inline" | "attachment", filename: string) {
    const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'")
    return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/**
 * Streams an inbound-email attachment from R2 to a staff member who may view
 * the ticket it belongs to. Every failure — bad id, no session, wrong role,
 * missing object — is a bare 404 so the route never confirms an attachment
 * exists to someone who can't see it.
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

    const object = await getR2Object(row.r2_key)
    if (!object) return notFound()

    const inline =
        request.nextUrl.searchParams.get("inline") === "1" &&
        mayInline(row.content_type)

    // Buffer rather than stream: attachments are small (Postmark caps a
    // message at 35 MB) and a fully materialised body lets the platform set
    // Content-Length/encoding itself, so nothing can disagree about length.
    const bytes = await new Response(object.body).arrayBuffer()

    return new NextResponse(bytes, {
        status: 200,
        headers: {
            "Content-Type": row.content_type,
            "Content-Disposition": contentDisposition(
                inline ? "inline" : "attachment",
                row.filename
            ),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
        }
    })
}
