import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import {
    CALENDAR_FEED_TABLES,
    CALENDAR_FEED_WRITER_MODULES
} from "./calendar-invalidation"

// Server actions live in .ts files; .tsx components only read.
// The calendar snapshot is cached for a day and only a tag revalidation
// refreshes it sooner. So every file under src/app that writes a table the
// feeds read, directly or through one of the lib helpers that do, must call
// revalidateCalendarFeeds(). This scan is the safety net: a new action that
// edits a match or a roster and forgets the call fails here, not in a
// subscriber's calendar a day later.
//
// A file whose writes are only ever reached through another file that does
// invalidate may opt out with the comment
//   // calendar-invalidation: handled by caller
// next to its imports.

const APP_ROOT = join(__dirname, "..", "app")
const OPT_OUT = "calendar-invalidation: handled by caller"

function* tsFiles(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
            yield* tsFiles(full)
        } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
            yield full
        }
    }
}

const WRITE_PATTERN = new RegExp(
    `\\.(insert|update|delete)\\((${CALENDAR_FEED_TABLES.join("|")})\\)`
)
const IMPORT_PATTERN = new RegExp(
    `from "(${CALENDAR_FEED_WRITER_MODULES.map((m) => m.replace("/", "\\/")).join("|")})(/[^"]*)?"`
)

describe("calendar feed invalidation coverage", () => {
    it("every app file that writes a feed-relevant table revalidates the feeds", () => {
        const missing: string[] = []
        for (const file of tsFiles(APP_ROOT)) {
            const source = readFileSync(file, "utf8")
            const writes =
                WRITE_PATTERN.test(source) || IMPORT_PATTERN.test(source)
            if (!writes) continue
            if (source.includes(OPT_OUT)) continue
            if (source.includes("revalidateCalendarFeeds(")) continue
            missing.push(relative(APP_ROOT, file))
        }
        expect(missing).toEqual([])
    })
})
