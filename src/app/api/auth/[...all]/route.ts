import { toNextJsHandler } from "better-auth/next-js"
import { checkBotId } from "botid/server"
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const authHandler = toNextJsHandler(auth)

export const GET = authHandler.GET

export async function POST(request: NextRequest) {
    const verification = await checkBotId({
        advancedOptions: {
            checkLevel: "basic",
            headers: Object.fromEntries(request.headers.entries())
        }
    })

    if (verification.isBot) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    return authHandler.POST(request)
}
