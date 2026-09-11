// Secrets are set with `wrangler secret put` and never appear in
// wrangler.jsonc, so `wrangler types` cannot know about them. Everything
// that IS in the config (bindings, vars) comes from the generated
// worker-configuration.d.ts; this only adds the two secrets.
declare namespace Cloudflare {
    interface Env {
        WEBHOOK_USER: string
        WEBHOOK_PASSWORD: string
    }
}
