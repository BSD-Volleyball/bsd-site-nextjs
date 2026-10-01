import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"

// Cookie-only decisions, no database. Pages re-check the real session.
//
// "/" is here so the homepage can stay a static (ISR) page: reading
// headers() or searchParams inside the page made every crawler hit render
// live and query Postgres, which kept the Neon compute from scaling to zero.
export async function proxy(request: NextRequest) {
    const sessionCookie = getSessionCookie(request)
    const { pathname, search, searchParams } = request.nextUrl

    if (pathname === "/") {
        // Signed-in users land on their dashboard instead of the marketing
        // page. Brand/logo links pass ?stay=1 so they can still view it.
        if (sessionCookie && searchParams.get("stay") !== "1") {
            return NextResponse.redirect(new URL("/dashboard", request.url))
        }
        return NextResponse.next()
    }

    // Protected routes: optimistic redirect when there is no session cookie.
    if (!sessionCookie) {
        const redirectTo = pathname + search
        return NextResponse.redirect(
            new URL(`/auth/sign-in?redirectTo=${redirectTo}`, request.url)
        )
    }

    return NextResponse.next()
}

export const config = {
    // "/" for the signed-in redirect; dashboard routes and auth settings
    // are protected.
    matcher: ["/", "/dashboard/:path*", "/auth/settings"]
}
