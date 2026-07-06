import { generateTryoutSheetsPdf } from "@/lib/pdf/tryout-sheets"

export const runtime = "nodejs"

export async function GET() {
    return generateTryoutSheetsPdf(2)
}
