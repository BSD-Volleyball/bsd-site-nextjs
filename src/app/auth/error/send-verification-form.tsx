"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

export function SendVerificationForm() {
    const [email, setEmail] = useState("")
    const [sending, setSending] = useState(false)
    const [sent, setSent] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSending(true)
        try {
            // The endpoint answers the same whether or not the address has an
            // account, so this page cannot be used to probe for members.
            await authClient.sendVerificationEmail({
                email: email.trim().toLowerCase(),
                callbackURL: "/dashboard"
            })
        } finally {
            setSending(false)
            setSent(true)
        }
    }

    if (sent) {
        return (
            <p className="text-sm">
                If that address belongs to an unverified account, a verification
                link is on its way. Check your inbox.
            </p>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-2">
            <Label htmlFor="verify-email">Email address</Label>
            <Input
                id="verify-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Sending…" : "Send verification link"}
            </Button>
        </form>
    )
}
