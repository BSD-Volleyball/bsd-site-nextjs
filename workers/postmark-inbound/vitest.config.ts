import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
    plugins: [
        cloudflareTest({
            main: "./src/index.ts",
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
                // Stand-ins for the production secrets.
                bindings: {
                    WEBHOOK_USER: "postmark-hook",
                    WEBHOOK_PASSWORD: "hook-secret"
                }
            }
        })
    ]
})
