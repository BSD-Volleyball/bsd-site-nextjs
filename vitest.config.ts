import { defineConfig } from "vitest/config"

// Both projects swap module aliases rather than mocking in each test file:
// - "server-only" must resolve to an empty module outside a Next server bundle
// - "@/database/db" is the seam for the db singleton imported across src/
const serverOnlyStub = new URL(
    "./src/test/mocks/server-only.ts",
    import.meta.url
).pathname
const dbGuard = new URL("./src/test/db-guard.ts", import.meta.url).pathname

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
            }
        ]
    }
})
