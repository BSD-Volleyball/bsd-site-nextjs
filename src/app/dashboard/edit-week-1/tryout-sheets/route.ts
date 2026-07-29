import { generateWeek1TryoutSheetsPdf } from "@/lib/pdf/tryout-sheets-week1"

export const runtime = "nodejs"

export async function GET() {
    return generateWeek1TryoutSheetsPdf()
}
