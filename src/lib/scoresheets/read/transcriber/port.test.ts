import { describe, expect, it } from "vitest"

import type { ScoreCrop } from "../crops"
import { TranscriberError, validateReadings } from "./port"

function crop(id: string): ScoreCrop {
    const [matchId, team, game] = id.split(":")
    return {
        id,
        matchId: Number(matchId),
        team: team as "home" | "away",
        game: Number(game) as 1 | 2 | 3,
        png: new Uint8Array([137, 80, 78, 71]),
        width: 110,
        height: 65,
        legalValues: [0, 19, 21, 25, 26, 27],
        inkRatio: 0.2,
        digitsWritten: 2
    }
}

const CROPS = [crop("1:home:1"), crop("1:away:1"), crop("1:home:2")]

describe("validateReadings", () => {
    const answer = (id: string) => ({
        id,
        value: 25,
        confidence: 0.9,
        alternatives: []
    })

    it("refuses a short reply within one request", () => {
        expect(() => validateReadings(CROPS, [answer("1:home:1")])).toThrow(
            TranscriberError
        )
    })

    it("accepts a short reply when a sheet spans several requests", () => {
        // One request out of several failed. Its boxes go unread, which the
        // reader shows as unreadable; the boxes that did come back are still
        // worth having, and throwing here would discard them.
        const kept = validateReadings(CROPS, [answer("1:home:1")], {
            allowMissing: true
        })
        expect(kept).toHaveLength(1)
        expect(kept[0].id).toBe("1:home:1")
    })

    it("still refuses an invented box, however the sheet was split", () => {
        expect(() =>
            validateReadings(CROPS, [answer("9:home:1")], {
                allowMissing: true
            })
        ).toThrow(/unknown box/i)
    })

    it("still refuses a box answered twice", () => {
        expect(() =>
            validateReadings(CROPS, [answer("1:home:1"), answer("1:home:1")], {
                allowMissing: true
            })
        ).toThrow(/twice/i)
    })
})
