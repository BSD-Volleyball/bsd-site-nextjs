import { describe, expect, it } from "vitest"
import {
    buildInboundEmailNotificationHtml,
    buildSponsorshipPaidHtml,
    buildSponsorshipPaymentDueHtml,
    buildSponsorshipReceiptHtml,
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

describe("sponsorship emails", () => {
    it("payment-due email names the amount, season, and pay link", () => {
        const html = buildSponsorshipPaymentDueHtml({
            firstName: "Pat",
            sponsorName: "Bravo Bakery",
            amount: "500.00",
            seasonLabel: "Fall 2026",
            payUrl: `${APP_URL}/dashboard/sponsorship`
        })
        expect(html).toContain("Pat")
        expect(html).toContain("Bravo Bakery")
        expect(html).toContain("$500.00")
        expect(html).toContain("Fall 2026")
        expect(html).toContain(`${APP_URL}/dashboard/sponsorship`)
    })

    it("admin paid email describes the payment method and note", () => {
        const html = buildSponsorshipPaidHtml({
            adminFirstName: "Casey",
            sponsorName: "Bravo Bakery",
            contactName: "Pat Player",
            amount: "500.00",
            method: "manual",
            note: "check #1042",
            manageUrl: `${APP_URL}/dashboard/manage-sponsors`
        })
        expect(html).toContain("Casey")
        expect(html).toContain("Bravo Bakery")
        expect(html).toContain("Pat Player")
        expect(html).toContain("$500.00")
        expect(html).toContain("check #1042")
        expect(html).toContain(`${APP_URL}/dashboard/manage-sponsors`)
    })

    it("admin paid email escapes sponsor-supplied text", () => {
        const html = buildSponsorshipPaidHtml({
            adminFirstName: "Casey",
            sponsorName: "<script>alert(1)</script>",
            contactName: "Pat",
            amount: "1.00",
            method: "square",
            manageUrl: APP_URL
        })
        expect(html).not.toContain("<script>")
        expect(html).toContain("&lt;script&gt;")
    })

    it("sponsor receipt links to the Square receipt when present", () => {
        const html = buildSponsorshipReceiptHtml({
            firstName: "Pat",
            sponsorName: "Bravo Bakery",
            seasonLabel: "Fall 2026",
            amountPaid: "500.00",
            receiptUrl: "https://square.test/r/1"
        })
        expect(html).toContain("$500.00")
        expect(html).toContain("https://square.test/r/1")
    })
})
