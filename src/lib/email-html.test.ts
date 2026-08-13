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

    it("links to the manage-concerns page for concern threads", () => {
        const html = buildThreadReplyNotificationHtml({
            appUrl: APP_URL,
            ticketType: "concern",
            ticketId: 9
        })
        expect(html).toContain(`${APP_URL}/dashboard/manage-concerns`)
    })
})
