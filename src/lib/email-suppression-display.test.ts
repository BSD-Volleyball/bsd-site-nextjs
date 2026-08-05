import { describe, expect, it } from "vitest"

import {
    emailStatusLabel,
    isEmailStatusBlocking,
    suppressionExplanation,
    suppressionOriginLabel,
    suppressionReasonLabel
} from "@/lib/email-suppression-display"

describe("emailStatusLabel", () => {
    it("labels every value recomputeEmailStatus can produce", () => {
        expect(emailStatusLabel("valid")).toBe("Deliverable")
        expect(emailStatusLabel("unsubscribed")).toBe("Unsubscribed")
        expect(emailStatusLabel("bounced")).toBe("Bounced")
        expect(emailStatusLabel("spam_complaint")).toBe("Spam complaint")
    })

    it("falls back to the raw value for anything unrecognised", () => {
        expect(emailStatusLabel("something_new")).toBe("something_new")
    })
})

describe("isEmailStatusBlocking", () => {
    // Only bounced/spam_complaint stop delivery on every stream —
    // 'unsubscribed' is per-stream, so it must not read as fully blocked.
    it("is true only for the statuses that block all streams", () => {
        expect(isEmailStatusBlocking("bounced")).toBe(true)
        expect(isEmailStatusBlocking("spam_complaint")).toBe(true)
        expect(isEmailStatusBlocking("unsubscribed")).toBe(false)
        expect(isEmailStatusBlocking("valid")).toBe(false)
    })
})

describe("suppressionReasonLabel", () => {
    it("translates Postmark's reason vocabulary", () => {
        expect(suppressionReasonLabel("HardBounce")).toBe("Hard bounce")
        expect(suppressionReasonLabel("SpamComplaint")).toBe("Spam complaint")
        expect(suppressionReasonLabel("ManualSuppression")).toBe("Unsubscribed")
    })

    it("passes through an unknown reason", () => {
        expect(suppressionReasonLabel("Whatever")).toBe("Whatever")
    })
})

describe("suppressionOriginLabel", () => {
    it("rewrites Postmark's 'Customer' to mean our own app", () => {
        expect(suppressionOriginLabel("Customer")).toBe(
            "via their notification preferences"
        )
        expect(suppressionOriginLabel("Recipient")).toBe("by the recipient")
        expect(suppressionOriginLabel("Admin")).toBe("by an admin")
    })
})

describe("suppressionExplanation", () => {
    it("explains each reason", () => {
        expect(suppressionExplanation("HardBounce")).toContain("permanently")
        expect(suppressionExplanation("SpamComplaint")).toContain(
            "not allow reactivation"
        )
        expect(suppressionExplanation("ManualSuppression")).toContain(
            "Notifications page"
        )
    })

    it("returns an empty string rather than filler for unknown reasons", () => {
        expect(suppressionExplanation("Mystery")).toBe("")
    })
})
