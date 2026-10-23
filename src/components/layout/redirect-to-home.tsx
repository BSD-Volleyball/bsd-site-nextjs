"use client"

import { useEffect } from "react"
import { authClient } from "@/lib/auth-client"

// ?stay=1 because the proxy sends "/" to /dashboard on cookie presence alone.
// A cookie better-auth refuses without clearing it (bad signature, or a name
// variant the proxy accepts but the server never reads) would otherwise
// bounce the browser between "/" and here forever.
export const SIGNED_OUT_LANDING = "/?stay=1"

export function RedirectToHome() {
    const { data: session, isPending } = authClient.useSession()

    useEffect(() => {
        if (!isPending && !session) {
            window.location.href = SIGNED_OUT_LANDING
        }
    }, [isPending, session])

    return null
}
