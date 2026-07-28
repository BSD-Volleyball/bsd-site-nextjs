import { describe, expect, it } from "vitest"
import {
    CATEGORY_STREAM_SYNC,
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_TYPES,
    STREAM_TO_TYPE,
    isNotificationType,
    optOutableTypes,
    typesInCategory
} from "./types"

const VALID_STREAMS = [
    "outbound",
    "automated-reminders",
    "broadcast",
    "in-season-updates"
]

describe("notification type registry", () => {
    it("every type has a valid category and stream", () => {
        for (const [type, def] of Object.entries(NOTIFICATION_TYPES)) {
            expect(VALID_STREAMS, `stream of ${type}`).toContain(def.stream)
            if (def.category !== null) {
                expect(
                    NOTIFICATION_CATEGORIES,
                    `category of ${type}`
                ).toHaveProperty(def.category)
            }
            expect(def.label.length).toBeGreaterThan(0)
            expect(def.description.length).toBeGreaterThan(0)
        }
    })

    it("mandatory types are never toggleable (category null)", () => {
        for (const [type, def] of Object.entries(NOTIFICATION_TYPES)) {
            if (def.mandatory) {
                expect(
                    def.category,
                    `${type} must not render a checkbox`
                ).toBeNull()
            }
        }
    })

    it("every category contains at least one toggleable type", () => {
        for (const category of Object.keys(NOTIFICATION_CATEGORIES)) {
            const types = typesInCategory(
                category as keyof typeof NOTIFICATION_CATEGORIES
            )
            expect(types.length, `types in ${category}`).toBeGreaterThan(0)
            for (const type of types) {
                expect(NOTIFICATION_TYPES[type].mandatory).toBeFalsy()
            }
        }
    })

    it("category stream sync only targets broadcast-type streams", () => {
        for (const [category, stream] of Object.entries(CATEGORY_STREAM_SYNC)) {
            expect(NOTIFICATION_CATEGORIES).toHaveProperty(category)
            // Suppressing "outbound" at Postmark would kill password resets.
            expect(["broadcast", "in-season-updates"]).toContain(stream)
        }
    })

    it("STREAM_TO_TYPE maps streams to non-mandatory types", () => {
        for (const type of Object.values(STREAM_TO_TYPE)) {
            expect(type).toBeDefined()
            if (type) expect(NOTIFICATION_TYPES[type].mandatory).toBeFalsy()
        }
    })

    it("optOutableTypes excludes mandatory types", () => {
        const optOutable = optOutableTypes()
        expect(optOutable).not.toContain("transactional")
        expect(optOutable).not.toContain("in_season_updates")
        expect(optOutable).toContain("league_announcements")
    })

    it("isNotificationType guards unknown values", () => {
        expect(isNotificationType("draft_results")).toBe(true)
        expect(isNotificationType("nonsense")).toBe(false)
    })
})
