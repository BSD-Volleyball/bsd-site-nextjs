# bsd-postmark-inbound

Cloudflare Worker that fronts Postmark's inbound-email webhook for the BSD
site. Postmark inlines every attachment as base64 (up to 35 MB per message,
about 50 MB of JSON); Vercel rejects request bodies over 4.5 MB before any
function runs. This Worker takes the POST instead, streams the body into R2,
and calls the app with a small envelope naming the object.

```
Postmark ──POST JSON──▶ hooks.bumpsetdrink.com/postmark/inbound
                          1. verify Basic auth (same creds Postmark sends)
                          2. stream body → R2  inbound-spool/<uuid>.json
                          3. POST { RecordType: "BSDSpooledInbound", SpoolKey, ContentLength }
                             → https://www.bumpsetdrink.com/api/webhooks/postmark
                          4. answer Postmark with the app's verdict
```

The app (`src/app/api/webhooks/postmark/route.ts`) fetches the object, runs
the unchanged inbound handling, and deletes it. Failures leave the object in
place for the bucket lifecycle rule (3 days) and for debugging. Postmark
retries non-2xx answers up to 10 times; each retry is spooled under a fresh
key and the app dedupes by MessageID.

## Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `pnpm worker:install` | install this package's dev dependencies |
| `pnpm worker:test` | Vitest inside the Workers runtime with a local R2 bucket |
| `pnpm worker:check-types` | `wrangler types` + `tsc` |
| `pnpm worker:deploy` | `wrangler deploy` (needs `wrangler login`) |
| `pnpm --dir workers/postmark-inbound tail` | live logs |

## First deploy / runbook

1. Cloudflare account must be on **Workers Paid** (the Free plan's 10 ms CPU
   budget is too small to stream a 50 MB body). R2 bucket `bsd` must exist
   (it does; the app uses it via the S3 API).
2. Secrets — the same values as the app's `POSTMARK_WEBHOOK_USER` /
   `POSTMARK_WEBHOOK_PASSWORD` on Vercel; rotate both places together:
   ```bash
   cd workers/postmark-inbound
   pnpm exec wrangler secret put WEBHOOK_USER
   pnpm exec wrangler secret put WEBHOOK_PASSWORD
   ```
3. Lifecycle rule so abandoned spool objects expire:
   ```bash
   pnpm exec wrangler r2 bucket lifecycle add bsd --prefix inbound-spool/ --expire-days 3
   ```
4. Vercel WAF: Bot Protection runs in challenge mode. A custom rule
   `path eq /api/webhooks/postmark AND method eq POST → bypass` must exist or
   the relayed POST gets a 429 challenge (the Worker logs
   "origin challenged by Vercel WAF" and answers Postmark 502).
5. `pnpm worker:deploy` — creates the `hooks.bumpsetdrink.com` DNS record on
   the zone and publishes the Worker.
6. Smoke test with a Postmark-shaped JSON body (any `MessageID`/`From`/`To`)
   and the Basic credentials; expect 200, a ticket in Manage Emails, and no
   object left under `inbound-spool/`
   (`pnpm exec wrangler r2 object list bsd --prefix inbound-spool/`).
7. Point Postmark at the Worker: `PUT https://api.postmarkapp.com/server`
   with `InboundHookUrl` =
   `https://<user>:<password>@hooks.bumpsetdrink.com/postmark/inbound`.
   Postmark sends the URL's userinfo as HTTP Basic.

**Rollback:** set `InboundHookUrl` back to
`https://<user>:<password>@www.bumpsetdrink.com/api/webhooks/postmark`. The
app still accepts inline payloads (attachments over ~3 MB will 413 again).

## Failure map

| Worker answer to Postmark | Meaning | Spool object |
| --- | --- | --- |
| 401 | credentials wrong (Postmark side) or Worker secrets differ from the app's | not written / kept |
| 413 | body over 90 MB — "Include raw email" was re-enabled on the Postmark server | not written |
| 502 `Origin blocked the relay` | Vercel WAF challenged the relay; add the bypass rule | kept |
| 502 `Origin redirected` | `ORIGIN_WEBHOOK_URL` is not the final URL | kept |
| 502 `Origin unreachable` | fetch to Vercel failed | kept |
| 504 | app took longer than 90 s | kept (app may still finish; retry dedupes) |
| 4xx/5xx passthrough | the app rejected the message; see Vercel logs for the `spoolKey` | kept |

Every log line is JSON with `worker: "postmark-inbound"` and, once written,
the `spoolKey`, so a message can be traced Postmark → Worker → Vercel.
