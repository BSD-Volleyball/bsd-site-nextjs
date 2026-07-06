import { generateWeekNametagsPdf } from "@/lib/pdf/nametags"

export const runtime = "nodejs"

export async function GET() {
    return generateWeekNametagsPdf(2)
}
