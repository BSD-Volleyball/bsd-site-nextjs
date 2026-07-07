import path from "node:path"
import { defineConfig, devices } from "@playwright/test"
import dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, ".env.test.local") })

const dbUrl = process.env.E2E_DATABASE_URL ?? ""
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100"

// Hard guard: e2e runs drop and reseed their database. Refuse anything that
// is not the dedicated local bsd_e2e database.
if (!dbUrl.includes("localhost") || !dbUrl.includes("bsd_e2e")) {
    throw new Error(
        "E2E_DATABASE_URL must point at the local bsd_e2e database " +
            "(set it in .env.test.local — see the Testing section in README.md)."
    )
}

// The setup project and specs import app modules (schema, factories) that
// read DATABASE_URL through the db singleton; point them at the e2e db too.
process.env.DATABASE_URL = dbUrl

export default defineConfig({
    testDir: "e2e",
    outputDir: "test-results",
    fullyParallel: false,
    // Mutating flows share one database; keep runs deterministic
    workers: 1,
    forbidOnly: !!process.env.CI,
    reporter: [["list"]],
    // Generous ceilings: turbopack cold-compiles routes on first visit
    timeout: 60_000,
    expect: { timeout: 10_000 },
    use: {
        baseURL,
        trace: "retain-on-failure",
        navigationTimeout: 30_000
    },
    projects: [
        {
            name: "setup",
            testMatch: /setup\/.*\.setup\.ts/
        },
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
            dependencies: ["setup"]
        }
    ],
    webServer: {
        command: "pnpm dev --port 3100",
        // Readiness probe must not touch the database — the e2e database is
        // migrated/seeded by the setup project after the server is up
        url: `${baseURL}/robots.txt`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
            ...(process.env as Record<string, string>),
            DATABASE_URL: dbUrl,
            BETTER_AUTH_BASE_URL: baseURL,
            NEXT_PUBLIC_APP_URL: baseURL
        }
    }
})
