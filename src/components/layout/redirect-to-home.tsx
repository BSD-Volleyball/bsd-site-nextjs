"use client"

import { useEffect } from "react"
import { authClient } from "@/lib/auth-client"

export function RedirectToHome() {
    const { data: session, isPending } = authClient.useSession()

    useEffect(() => {
        if (!isPending && !session) {
            window.location.href = "/"
        }
    }, [isPending, session])

    return null
}
