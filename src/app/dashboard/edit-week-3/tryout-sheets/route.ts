import { getSessionUserId } from "@/lib/rbac"
import { generateTryoutSheetsPdf } from "@/lib/pdf/tryout-sheets"

export const runtime = "nodejs"

export async function GET() {
    const userId = await getSessionUserId()
    if (!userId) {
        return Response.json({ error: "Access denied" }, { status: 403 })
    }
    return generateTryoutSheetsPdf(3, userId)
}
