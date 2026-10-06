import { describe, expect, it } from "vitest"
import { parseSpooledEnvelope, SPOOL_MAX_BYTES } from "./spool-envelope"

const KEY = "inbound-spool/0f8fad5b-d9cb-469f-a165-70867728950e.json"

describe("parseSpooledEnvelope", () => {
    it("accepts a well-formed envelope", () => {
        expect(
            parseSpooledEnvelope({
                RecordType: "BSDSpooledInbound",
                SpoolKey: KEY,
                ContentLength: 1234
            })
        ).toEqual({
            RecordType: "BSDSpooledInbound",
            SpoolKey: KEY,
            ContentLength: 1234
        })
    })

    it("pins the key to the spool prefix and uuid shape", () => {
        for (const key of [
            "email-attachments/0f8fad5b-d9cb-469f-a165-70867728950e.json",
            "inbound-spool/../secret.json",
            "inbound-spool/0F8FAD5B-D9CB-469F-A165-70867728950E.json",
            `${KEY}.bak`,
            42
        ]) {
            expect(
                parseSpooledEnvelope({ SpoolKey: key, ContentLength: 10 })
            ).toBeNull()
        }
    })

    it("rejects a missing, non-integer, non-positive or oversized length", () => {
        for (const length of [
            undefined,
            "10",
            1.5,
            0,
            -1,
            SPOOL_MAX_BYTES + 1
        ]) {
            expect(
                parseSpooledEnvelope({ SpoolKey: KEY, ContentLength: length })
            ).toBeNull()
        }
    })

    it("accepts the maximum length", () => {
        expect(
            parseSpooledEnvelope({
                SpoolKey: KEY,
                ContentLength: SPOOL_MAX_BYTES
            })?.ContentLength
        ).toBe(SPOOL_MAX_BYTES)
    })
})
