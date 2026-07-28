/**
 * unsubscribe-token.ts — Signed tokens for RFC 8058 one-click unsubscribe.
 *
 * The List-Unsubscribe URL must work with no session (mail providers POST it
 * server-to-server), so the HMAC-signed token is the entire authorization: it
 * names exactly one user and one notification type and grants nothing else.
 * Tokens don't expire — a years-old email's unsubscribe link should still
 * work.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import { logger } from "@/lib/logger"
import { type NotificationType, isNotificationType } from "./types"

function secret(): string | null {
    return process.env.NOTIFICATION_UNSUB_SECRET || null
}

function sign(payload: string, key: string): string {
    return createHmac("sha256", key).update(payload).digest("base64url")
}

/**
 * Returns null (and logs once per process) when NOTIFICATION_UNSUB_SECRET is
 * unset, so the dispatcher can skip the headers rather than fail the send.
 */
let warnedMissingSecret = false
export function createUnsubscribeToken(
    userId: string,
    type: NotificationType
): string | null {
    const key = secret()
    if (!key) {
        if (!warnedMissingSecret) {
            warnedMissingSecret = true
            logger.error(
                "[notifications] NOTIFICATION_UNSUB_SECRET is not set; emails will be sent without List-Unsubscribe headers"
            )
        }
        return null
    }
    const payload = Buffer.from(
        JSON.stringify({ u: userId, t: type })
    ).toString("base64url")
    return `${payload}.${sign(payload, key)}`
}

export function verifyUnsubscribeToken(
    token: string
): { userId: string; type: NotificationType } | null {
    const key = secret()
    if (!key) return null

    const dot = token.indexOf(".")
    if (dot <= 0) return null
    const payload = token.slice(0, dot)
    const signature = token.slice(dot + 1)

    const expected = Buffer.from(sign(payload, key))
    const provided = Buffer.from(signature)
    if (
        expected.length !== provided.length ||
        !timingSafeEqual(expected, provided)
    ) {
        return null
    }

    try {
        const parsed = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8")
        ) as { u?: unknown; t?: unknown }
        if (
            typeof parsed.u !== "string" ||
            typeof parsed.t !== "string" ||
            !isNotificationType(parsed.t)
        ) {
            return null
        }
        return { userId: parsed.u, type: parsed.t }
    } catch {
        return null
    }
}
