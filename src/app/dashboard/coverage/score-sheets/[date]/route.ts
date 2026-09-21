import { generateScoreSheetsPdf } from "@/lib/scoresheets/generate"
import { getSessionUserId } from "@/next/session"

export const runtime = "nodejs"

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ date: string }> }
) {
    const userId = await getSessionUserId()
    if (!userId) {
        return Response.json({ error: "Access denied" }, { status: 403 })
    }

    const { date } = await params
    return generateScoreSheetsPdf(date, userId)
}
