import { getSessionUserId } from "@/next/session"
import { generateWeek1TryoutSheetsPdf } from "@/lib/pdf/tryout-sheets-week1"

export const runtime = "nodejs"

export async function GET() {
    const userId = await getSessionUserId()
    if (!userId) {
        return Response.json({ error: "Access denied" }, { status: 403 })
    }
    return generateWeek1TryoutSheetsPdf(userId)
}
