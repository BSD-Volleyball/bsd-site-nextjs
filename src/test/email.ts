/**
 * Test helpers for inspecting what the app tried to send.
 *
 * Since every outbound path funnels through sendMail() → sendBatchEmails or
 * sendEmail, tests assert against those two mocks rather than against a
 * per-feature transport. `broadcastCall` presents a batch send in the shape
 * the old sendBroadcastEmails assertions used, so recipient/subject/body
 * checks read the same as before the unification.
 */

import { vi } from "vitest"

import { sendBatchEmails, sendEmail } from "@/lib/postmark"

interface SentMessage {
    to: string
    subject: string
    htmlBody: string
    textBody?: string
    stream?: string
    tag?: string
    headers?: { name: string; value: string }[]
}

/** Every message handed to the batch transport, across all calls. */
export function sentBatchMessages(): SentMessage[] {
    return vi
        .mocked(sendBatchEmails)
        .mock.calls.flatMap((call) => call[0] as unknown as SentMessage[])
}

/** Every single-message send (attachments, threading, custom From). */
export function sentSingleMessages() {
    return vi.mocked(sendEmail).mock.calls.map((call) => call[0])
}

/** Addresses reached by either transport, lowercased. */
export function sentToAddresses(): string[] {
    return [
        ...sentBatchMessages().map((m) => m.to),
        ...sentSingleMessages().map((m) => m.to)
    ].map((to) => to.toLowerCase())
}

/**
 * One batch send, presented like the old BroadcastOptions object: a shared
 * subject/body plus the recipient list. Broadcasts send an identical body to
 * everyone, so reading them off the first message is faithful.
 */
export function broadcastCall(index = 0) {
    const messages = (vi.mocked(sendBatchEmails).mock.calls[index]?.[0] ??
        []) as unknown as SentMessage[]
    return {
        messages,
        recipients: messages.map((m) => ({ email: m.to })),
        subject: messages[0]?.subject ?? "",
        htmlBody: messages[0]?.htmlBody ?? "",
        textBody: messages[0]?.textBody,
        stream: messages[0]?.stream,
        tag: messages[0]?.tag,
        headers: messages[0]?.headers
    }
}

/**
 * Every message sent through either transport, in a single shape.
 *
 * Prefer this over asserting on sendEmail/sendBatchEmails directly: sendMail
 * chooses the transport from recipient count and capabilities, and most tests
 * care about who received what, not which Postmark API carried it.
 */
export function sentMessages(): SentMessage[] {
    return [
        ...sentBatchMessages(),
        ...(sentSingleMessages() as unknown as SentMessage[])
    ]
}
