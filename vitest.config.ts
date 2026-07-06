import { defineConfig } from "vitest/config"

// Both projects swap module aliases rather than mocking in each test file:
// - "server-only" must resolve to an empty module outside a Next server bundle
// - "@/database/db" is the seam for the db singleton imported across src/
const serverOnlyStub = new URL(
    "./src/test/mocks/server-only.ts",
    import.meta.url
).pathname
const dbGuard = new URL("./src/test/db-guard.ts", import.meta.url).pathname
const dbAlias = new URL("./src/test/pg/db-alias.ts", import.meta.url).pathname

export default defineConfig({
    resolve: {
        // Honors the "@/*" -> "./src/*" alias from tsconfig.json
        tsconfigPaths: true
    },
    test: {
        coverage: {
            provider: "v8",
            include: ["src/**"],
            exclude: ["src/components/ui/**", "src/test/**", "src/**/*.test.ts"]
        },
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    environment: "node",
                    include: ["src/**/*.test.ts"],
                    exclude: ["src/**/*.integration.test.ts"]
                },
                resolve: {
                    alias: [
                        { find: /^server-only$/, replacement: serverOnlyStub },
                        // Unit tests must never touch a database; the guard
                        // throws on any property access.
                        { find: /^@\/database\/db$/, replacement: dbGuard }
                    ]
                }
            },
            {
                extends: true,
                test: {
                    name: "integration",
                    environment: "node",
                    include: ["src/**/*.integration.test.ts"],
                    setupFiles: ["src/test/setup.integration.ts"],
                    globalSetup: ["src/test/pg/global-setup.ts"],
                    // Process isolation per worker: each fork owns a cloned
                    // test database, so parallel files never collide.
                    pool: "forks",
                    testTimeout: 20000
                },
                resolve: {
                    alias: [
                        { find: /^server-only$/, replacement: serverOnlyStub },
                        // All imports of the db singleton hit the per-worker
                        // cloned Postgres database instead.
                        { find: /^@\/database\/db$/, replacement: dbAlias }
                    ]
                }
            }
        ]
    }
})
