import { describe, expect, it } from "vitest"
import {
    expandMessageIds,
    getHeader,
    isAddressedTo,
    mergeHeaders,
    parseFromAddress,
    parseMessageIds,
    parseRawEmailHeaders,
    parseSubjectThreadRefs,
    parseTicketIdHeader,
    readInboundMessage
} from "./message-parsing"
import { postmarkInboundSchema } from "./postmark-payloads"

function base64(text: string) {
    return Buffer.from(text, "utf-8").toString("base64")
}

describe("parseFromAddress", () => {
    it("splits a display name from the address", () => {
        expect(parseFromAddress("Jane Doe <jane@example.com>")).toEqual({
            name: "Jane Doe",
            email: "jane@example.com"
        })
    })

    it("strips quotes around the display name", () => {
        expect(parseFromAddress('"Doe, Jane" <jane@example.com>')).toEqual({
            name: "Doe, Jane",
            email: "jane@example.com"
        })
    })

    it("returns a bare address with no name", () => {
        expect(parseFromAddress("  jane@example.com ")).toEqual({
            name: null,
            email: "jane@example.com"
        })
    })
})

describe("getHeader", () => {
    const headers = [
        { Name: "X-BSD-Ticket-ID", Value: "email-7" },
        { Name: "In-Reply-To", Value: "<a@b>" }
    ]

    it("matches names case-insensitively", () => {
        expect(getHeader(headers, "x-bsd-ticket-id")).toBe("email-7")
        expect(getHeader(headers, "IN-REPLY-TO")).toBe("<a@b>")
    })

    it("returns null for a missing header", () => {
        expect(getHeader(headers, "References")).toBeNull()
    })
})

describe("parseMessageIds", () => {
    it("splits on whitespace and strips angle brackets", () => {
        expect(parseMessageIds("<a@x.com>  <b@y.com>\n\t<c>")).toEqual([
            "a@x.com",
            "b@y.com",
            "c"
        ])
    })

    it("returns nothing for an absent header", () => {
        expect(parseMessageIds(null)).toEqual([])
        expect(parseMessageIds("")).toEqual([])
    })
})

describe("expandMessageIds", () => {
    it("adds the local part of each id, without duplicates", () => {
        expect(
            expandMessageIds(["abc@smtp.postmarkapp.com", "abc", "def"])
        ).toEqual(["abc@smtp.postmarkapp.com", "abc", "def"])
    })

    it("leaves an id that starts with @ alone", () => {
        expect(expandMessageIds(["@weird"])).toEqual(["@weird"])
    })
})

describe("parseRawEmailHeaders", () => {
    it("reads headers up to the first blank line and unfolds continuations", () => {
        const raw = base64(
            [
                "From: Jane <jane@example.com>",
                "References: <a@x>",
                "\t<b@y>",
                "In-Reply-To: <b@y>",
                "",
                "Body: not a header"
            ].join("\r\n")
        )
        expect(parseRawEmailHeaders(raw)).toEqual([
            { Name: "From", Value: "Jane <jane@example.com>" },
            { Name: "References", Value: "<a@x> <b@y>" },
            { Name: "In-Reply-To", Value: "<b@y>" }
        ])
    })

    it("returns nothing when the raw email is absent", () => {
        expect(parseRawEmailHeaders(undefined)).toEqual([])
        expect(parseRawEmailHeaders(null)).toEqual([])
    })
})

describe("mergeHeaders", () => {
    it("keeps JSON values and appends only headers the JSON lacks", () => {
        expect(
            mergeHeaders(
                [{ Name: "Subject", Value: "json" }],
                [
                    { Name: "subject", Value: "raw" },
                    { Name: "In-Reply-To", Value: "<a@b>" }
                ]
            )
        ).toEqual([
            { Name: "Subject", Value: "json" },
            { Name: "In-Reply-To", Value: "<a@b>" }
        ])
    })
})

describe("parseTicketIdHeader", () => {
    it("reads email and concern ids", () => {
        expect(parseTicketIdHeader("email-7")).toEqual({ type: "email", id: 7 })
        expect(parseTicketIdHeader("concern-12")).toEqual({
            type: "concern",
            id: 12
        })
    })

    it("rejects anything not exactly in the issued form", () => {
        expect(parseTicketIdHeader("email-7x")).toBeNull()
        expect(parseTicketIdHeader(" concern-12")).toBeNull()
        expect(parseTicketIdHeader("ticket-3")).toBeNull()
        expect(parseTicketIdHeader("email-")).toBeNull()
    })
})

describe("parseSubjectThreadRefs", () => {
    it("reads our reply subjects", () => {
        expect(parseSubjectThreadRefs("Re: Concern #17")).toEqual([
            { type: "concern", id: 17 }
        ])
        expect(parseSubjectThreadRefs("RE: Email # 7: Question")).toEqual([
            { type: "email", id: 7 }
        ])
    })

    it("lists a concern reference before an email reference", () => {
        expect(parseSubjectThreadRefs("Email #3 about concern #4")).toEqual([
            { type: "concern", id: 4 },
            { type: "email", id: 3 }
        ])
    })

    it("requires a word boundary around the email reference", () => {
        expect(parseSubjectThreadRefs("myemail #5")).toEqual([])
        expect(parseSubjectThreadRefs("Hello there")).toEqual([])
    })
})

describe("isAddressedTo", () => {
    it("matches the parsed recipient list", () => {
        expect(
            isAddressedTo("concerns@x.org", ["concerns@x.org"], "other@x.org")
        ).toBe(true)
    })

    it("falls back to the raw To header, case-insensitively", () => {
        expect(
            isAddressedTo("concerns@x.org", [], "League <Concerns@X.org>")
        ).toBe(true)
    })

    it("never matches an unset address", () => {
        expect(isAddressedTo("", ["a@x.org"], "a@x.org")).toBe(false)
    })

    it("does not match other recipients", () => {
        expect(
            isAddressedTo("concerns@x.org", ["info@x.org"], "info@x.org")
        ).toBe(false)
    })
})

describe("readInboundMessage", () => {
    it("prefers FromFull and treats blank names as missing", () => {
        const payload = postmarkInboundSchema.parse({
            MessageID: "m-1",
            From: "Header Name <header@example.com>",
            FromName: "",
            FromFull: { Email: "full@example.com", Name: "" },
            To: "info@example.com",
            Subject: "",
            TextBody: "",
            HtmlBody: "<p>hi</p>",
            Attachments: []
        })
        expect(readInboundMessage(payload)).toEqual({
            messageId: "m-1",
            fromEmail: "full@example.com",
            fromName: "Header Name",
            subject: "(No subject)",
            bodyText: null,
            bodyHtml: "<p>hi</p>",
            attachments: []
        })
    })

    it("falls back to the From header when FromFull is absent", () => {
        const payload = postmarkInboundSchema.parse({
            MessageID: "m-2",
            From: "bare@example.com",
            FromName: "Display",
            Subject: "Hello",
            TextBody: "text"
        })
        expect(readInboundMessage(payload)).toMatchObject({
            fromEmail: "bare@example.com",
            fromName: "Display",
            subject: "Hello",
            bodyText: "text",
            bodyHtml: null
        })
    })
})
