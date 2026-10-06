import { getSessionUserId } from "@/next/session"
import { generateWeekNametagsPdf } from "@/lib/pdf/nametags"

export async function GET() {
    const userId = await getSessionUserId()
    if (!userId) {
        return Response.json({ error: "Access denied" }, { status: 403 })
    }
    return generateWeekNametagsPdf(3, userId)
}
