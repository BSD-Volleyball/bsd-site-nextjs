import { describe, expect, it } from "vitest"
import {
    buildInboundEmailNotificationHtml,
    buildThreadReplyNotificationHtml
} from "./email-html"

const APP_URL = "https://www.test.local"

describe("buildInboundEmailNotificationHtml", () => {
    it("links directly to the new ticket on the manage-emails page", () => {
        const html = buildInboundEmailNotificationHtml({
            appUrl: APP_URL,
            ticketId: 42
        })
        expect(html).toContain(`${APP_URL}/dashboard/manage-emails?email=42`)
    })

    it("shows the sender's name, address, and subject", () => {
        const html = buildInboundEmailNotificationHtml({
            appUrl: APP_URL,
            ticketId: 42,
            fromName: "Jane Doe",
            fromAddress: "jane@example.test",
            subject: "Question about the league"
        })
        expect(html).toContain("Jane Doe")
        expect(html).toContain("jane@example.test")
        expect(html).toContain("Question about the league")
    })

    it("falls back to the address when the sender has no display name", () => {
        const html = buildInboundEmailNotificationHtml({
            appUrl: APP_URL,
            ticketId: 42,
            fromName: null,
            fromAddress: "jane@example.test",
            subject: "Hello"
        })
        expect(html).toContain("jane@example.test")
        expect(html).not.toContain("null")
    })

    it("escapes sender-controlled fields", () => {
        const html = buildInboundEmailNotificationHtml({
            appUrl: APP_URL,
            ticketId: 42,
            fromName: "<script>alert(1)</script>",
            fromAddress: "x@example.test",
            subject: "<img src=x onerror=alert(1)>"
        })
        expect(html).not.toContain("<script>")
        expect(html).not.toContain("<img src=x")
        expect(html).toContain("&lt;script&gt;")
    })
})

describe("buildThreadReplyNotificationHtml", () => {
    it("links directly to the email thread that received the reply", () => {
        const html = buildThreadReplyNotificationHtml({
            appUrl: APP_URL,
            ticketType: "email",
            ticketId: 7
        })
        expect(html).toContain(`${APP_URL}/dashboard/manage-emails?email=7`)
    })

    it("shows the sender and subject for email-thread replies", () => {
        const html = buildThreadReplyNotificationHtml({
            appUrl: APP_URL,
            ticketType: "email",
            ticketId: 7,
            fromName: "Jane Doe",
            fromAddress: "jane@example.test",
            subject: "Re: Question about the league"
        })
        expect(html).toContain("Jane Doe")
        expect(html).toContain("jane@example.test")
        expect(html).toContain("Re: Question about the league")
    })

    it("links to the manage-concerns page for concern threads", () => {
        const html = buildThreadReplyNotificationHtml({
            appUrl: APP_URL,
            ticketType: "concern",
            ticketId: 9
        })
        expect(html).toContain(`${APP_URL}/dashboard/manage-concerns`)
    })

    it("never reveals sender or subject for concern threads", () => {
        const html = buildThreadReplyNotificationHtml({
            appUrl: APP_URL,
            ticketType: "concern",
            ticketId: 9,
            fromName: "Jane Doe",
            fromAddress: "jane@example.test",
            subject: "Re: sensitive matter"
        })
        expect(html).not.toContain("Jane Doe")
        expect(html).not.toContain("jane@example.test")
        expect(html).not.toContain("sensitive matter")
    })
})
