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
        console.warn(
            `BotID denied POST ${request.nextUrl.pathname} ua="${request.headers.get("user-agent") ?? "unknown"}"`
        )
        // better-auth-ui surfaces the top-level `message` field as the form's
        // error toast, so this text is what a misclassified human will see.
        return NextResponse.json(
            {
                code: "BOT_DETECTED",
                message:
                    "We couldn't verify your browser. Please disable content blockers for this site or try a different browser, then try again."
            },
            { status: 403 }
        )
    }

    return authHandler.POST(request)
}
