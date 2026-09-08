import { describe, expect, it, vi } from "vitest"
import { GET } from "./route"

// The unit project aliases "@/database/db" to a guard that throws on any
// access, so a 200 here proves the default health check never touches the
// database (an external monitor polls it once a minute, and a DB query on
// every poll keeps the Neon compute from ever suspending).

describe("GET /api/health", () => {
    it("reports ok without touching the database by default", async () => {
        const response = await GET(new Request("http://localhost/api/health"))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ status: "ok" })
    })

    it("runs the database check only when ?db=1 is passed", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const response = await GET(
            new Request("http://localhost/api/health?db=1")
        )
        // Under the unit db guard the query throws, so the deep check reports
        // the failure instead of masking it.
        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({ status: "error" })
    })
})
