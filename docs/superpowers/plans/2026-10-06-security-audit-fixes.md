# Security Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding from the 2026-10-06 security audit: one High (OAuth pre-account takeover), one Medium (pics-guard route bypass), and eight Low findings (scope and validation gaps, tracking-pixel bypass, CSV formula injection, forged-From thread attach).

**Architecture:** Each task is a localized fix in the file that owns the vulnerable code, pinned by a test that fails before the fix. Authorization gaps are closed inside the exported server action (so `pnpm check-authz` can see the guard) and pinned with `strictExpectations`. No schema changes; no new dependencies.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM / Postgres, better-auth 1.7.7, Vitest (unit + integration with a per-worker Postgres clone), Cloudflare Workers + `@cloudflare/vitest-plugin`, Biome.

**Spec:** The audit report delivered in the session that produced this plan; the confirmed findings are summarised in the memory file `security-audit-2026-10-06.md` and restated at the top of each task below.

## Global Constraints

- Package manager is **pnpm** only. Never `npm install`.
- Biome formatting: 4-space indent, **no semicolons**, **no trailing commas**. CI runs `pnpm lint` (biome check) and fails on unused imports. Run `pnpm lint` LAST before every commit.
- `src/lib`, `src/database`, `src/config` must not import `next/*`, `@/next/*`, `@/app/*`, `@/components/*` (Biome-enforced).
- Every exported server action keeps its guard call inside the exported function body, not in a helper, so `scripts/security/authz-regression-check.js` can see it.
- After any server action that writes a table listed in `CALENDAR_FEED_TABLES` (see `src/next/calendar-invalidation.ts`), call `revalidateCalendarFeeds()`. None of the tasks below add a new write to such a table; `saveRefAssignments` already calls it.
- Integration tests: `*.integration.test.ts`, colocated, run with `pnpm test:integration`. They need the local Postgres cluster running (`~/init-dev-env.sh` after a container restart). Role checks are real; sessions are fabricated with `createUserWithRoles([...])` / `createUser()` + `loginAs()` from `src/test/session.ts`.
- Unit tests: `*.test.ts`, run with `pnpm test:unit`. The db singleton throws in unit tests.
- Run a single test file with `pnpm vitest run <path>`.
- Commit after every task, on `main`, with the attribution trailer the session reminder specifies. Before committing, run `git diff --cached --stat` to make sure another session's pre-staged work is not riding along.
- Do not deploy the Cloudflare Worker (`pnpm pics-guard:deploy`) from this plan; it needs a Cloudflare login the user performs. Leave the deploy as a flagged follow-up in the final summary.

## Review Focus

1. **Legit password user verifying from a different browser (Task 1).** They must still end up verified and signed in; they lose only the pre-verification password and can set a new one. Pinned by `auth-verification.integration.test.ts` ("revokes sessions and the credential row when the verifier holds no session").
2. **Google-only user (never had a password) hitting the verification hook (Task 1).** No credential row exists; the hook must be a no-op that does not throw. Pinned by the "no credential row" case in the same test.
3. **Percent-encoded request for a PUBLIC picture on the pics host (Task 2).** `/playerpics%2Fx.jpg` must still serve the picture (decode, then serve), not 404. Pinned in `workers/pics-guard/test/index.test.ts`.
4. **Coach submitting a forced move where the player is on the right team but the client lies about `teamNumber` (Task 3).** Must be rejected, not silently re-filed. Pinned by the coach negative test.
5. **A referee assignment payload that mixes a current-season match with a past-season match id (Task 7).** The whole save must fail; no partial delete. Pinned by the cross-season test asserting the old row survives.

---

### Task 1: Pre-account takeover — evict pre-verification credentials, verify on password reset, challenge new addresses

**Finding.** `requireEmailVerification: false` + `autoSignIn: true` let an attacker register a victim's address with a password. When the victim's Google sign-in is refused (unverified local account) the `/auth/error` page tells them to verify, which flips the attacker's row to verified and auto-signs the victim into it; Google then links into that row and the attacker keeps the password. Variant: `updateAccountProfile` re-points a user's email to an unregistered address, unverified, with no challenge.

**Fix.** Whoever proves inbox ownership owns the account: when a verification link is clicked by someone who does not already hold a session for that user, revoke all sessions and delete the `credential` account row (the password). Password reset also proves inbox ownership, so mark the email verified there. After a settings-page email change, send the verification email to the new address immediately.

**Files:**
- Create: `src/lib/auth-verification.ts`
- Create: `src/lib/auth-verification.integration.test.ts`
- Modify: `src/lib/auth.ts` (emailAndPassword + emailVerification blocks)
- Modify: `src/lib/auth-config.test.ts`
- Modify: `src/app/auth/error/page.tsx`
- Modify: `src/app/dashboard/settings/actions.ts`

**Interfaces:**
- Produces: `evictPreVerificationCredentials(userId: string): Promise<{ sessionsRevoked: boolean; credentialRemoved: boolean }>` in `src/lib/auth-verification.ts` (framework-free; Drizzle only).
- Produces: `markEmailVerified(userId: string): Promise<void>` in the same file.

- [ ] **Step 1: Write the failing integration test**

Create `src/lib/auth-verification.integration.test.ts`:

```ts
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { accounts, sessions, users } from "@/database/schema"
import { createUser } from "@/test/session"
import {
    evictPreVerificationCredentials,
    markEmailVerified
} from "./auth-verification"

async function seedCredentialAccount(userId: string) {
    await db.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: "hashed-by-attacker"
    })
}

async function seedGoogleAccount(userId: string) {
    await db.insert(accounts).values({
        id: crypto.randomUUID(),
        accountId: `google-${userId}`,
        providerId: "google",
        userId
    })
}

async function seedSession(userId: string) {
    await db.insert(sessions).values({
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId,
        expiresAt: new Date(Date.now() + 60_000)
    })
}

describe("evictPreVerificationCredentials", () => {
    it("revokes every session and removes the password account", async () => {
        const user = await createUser({ emailVerified: false })
        await seedCredentialAccount(user.id)
        await seedSession(user.id)
        await seedSession(user.id)

        const result = await evictPreVerificationCredentials(user.id)

        expect(result).toEqual({
            sessionsRevoked: true,
            credentialRemoved: true
        })
        expect(
            await db.select().from(sessions).where(eq(sessions.userId, user.id))
        ).toHaveLength(0)
        expect(
            await db.select().from(accounts).where(eq(accounts.userId, user.id))
        ).toHaveLength(0)
    })

    it("keeps social accounts and reports when there was nothing to evict", async () => {
        const user = await createUser({ emailVerified: false })
        await seedGoogleAccount(user.id)

        const result = await evictPreVerificationCredentials(user.id)

        expect(result).toEqual({
            sessionsRevoked: false,
            credentialRemoved: false
        })
        const remaining = await db
            .select({ providerId: accounts.providerId })
            .from(accounts)
            .where(eq(accounts.userId, user.id))
        expect(remaining).toEqual([{ providerId: "google" }])
    })

    it("does not touch another user's sessions or accounts", async () => {
        const victim = await createUser({ emailVerified: false })
        const bystander = await createUser()
        await seedCredentialAccount(victim.id)
        await seedCredentialAccount(bystander.id)
        await seedSession(bystander.id)

        await evictPreVerificationCredentials(victim.id)

        expect(
            await db
                .select()
                .from(sessions)
                .where(eq(sessions.userId, bystander.id))
        ).toHaveLength(1)
        expect(
            await db
                .select()
                .from(accounts)
                .where(eq(accounts.userId, bystander.id))
        ).toHaveLength(1)
    })
})

describe("markEmailVerified", () => {
    it("flips emailVerified to true", async () => {
        const user = await createUser({ emailVerified: false })

        await markEmailVerified(user.id)

        const [row] = await db
            .select({ emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, user.id))
        expect(row.emailVerified).toBe(true)
    })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/auth-verification.integration.test.ts`
Expected: FAIL — cannot resolve `./auth-verification`.

- [ ] **Step 3: Create `src/lib/auth-verification.ts`**

```ts
import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/database/db"
import { accounts, sessions, users } from "@/database/schema"

/**
 * Account-claim rules behind better-auth's email verification.
 *
 * A password account can be created for an address its creator does not
 * own (nothing stops someone registering a stranger's email). The
 * verification link is mailed to the real address, so whoever clicks it has
 * proven inbox ownership and must end up as the sole holder of the account:
 * every session created before verification is revoked and the password
 * (the `credential` accounts row) is removed. A verifier who already holds
 * a session for the user is the person who signed up in this browser, and
 * `src/lib/auth.ts` skips the eviction for them.
 *
 * Without this, verifying an attacker-registered account hands the attacker
 * a password into the victim's future account (the "pre-account hijack").
 */
export async function evictPreVerificationCredentials(
    userId: string
): Promise<{ sessionsRevoked: boolean; credentialRemoved: boolean }> {
    return db.transaction(async (tx) => {
        const revoked = await tx
            .delete(sessions)
            .where(eq(sessions.userId, userId))
            .returning({ id: sessions.id })
        const removed = await tx
            .delete(accounts)
            .where(
                and(
                    eq(accounts.userId, userId),
                    eq(accounts.providerId, "credential")
                )
            )
            .returning({ id: accounts.id })
        return {
            sessionsRevoked: revoked.length > 0,
            credentialRemoved: removed.length > 0
        }
    })
}

/**
 * A password-reset link is delivered to the same inbox a verification link
 * is, so completing a reset proves ownership of the address just as well.
 */
export async function markEmailVerified(userId: string): Promise<void> {
    await db
        .update(users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, userId))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/auth-verification.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Extend the config regression test**

In `src/lib/auth-config.test.ts`, add inside `describe("better-auth account linking", ...)` after the last `it`:

```ts
    // Verification by someone without a session must evict whoever set the
    // password, or a pre-registered account becomes a backdoor into the
    // real owner's account. A password reset proves the inbox the same way
    // a verification link does, so it marks the email verified.
    it("claims the account for the inbox owner on verification and on reset", () => {
        expect(authSource).toMatch(/afterEmailVerification\s*:/)
        expect(authSource).toMatch(/evictPreVerificationCredentials\s*\(/)
        expect(authSource).toMatch(/onPasswordReset\s*:/)
        expect(authSource).toMatch(/markEmailVerified\s*\(/)
    })
```

Run: `pnpm vitest run src/lib/auth-config.test.ts`
Expected: FAIL on the new test (hooks not present yet).

- [ ] **Step 6: Wire the hooks in `src/lib/auth.ts`**

Add the import at the top, after the `sendMail` import:

```ts
import {
    evictPreVerificationCredentials,
    markEmailVerified
} from "@/lib/auth-verification"
```

In the `emailAndPassword` block, after `revokeSessionsOnPasswordReset: true,` add:

```ts
        // Completing a reset proves the inbox, exactly as a verification link
        // does, so it also verifies the address. This is the recovery path
        // /auth/error offers when Google sign-in meets an unverified account:
        // the reset replaces whatever password was set and ends every other
        // session, so nobody who registered this address first keeps a way in.
        onPasswordReset: async ({ user }) => {
            await markEmailVerified(user.id)
        },
```

Replace the comment block above `emailVerification:` and the start of that block with:

```ts
    // Google sign-in only links into an existing account whose email is
    // verified (better-auth's default since 1.6.11; it closes OAuth
    // pre-account hijacking). Password sign-ups therefore get a verification
    // link, and /auth/error offers one to anyone the gate turns away.
    //
    // The link lands in the real inbox, so the clicker owns the address. If
    // they do not already hold a session for this user they did not sign up
    // in this browser; whoever did is evicted (sessions + password) before
    // the clicker is signed in. Otherwise verifying an account someone else
    // registered under your address would hand them a password into it.
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        afterEmailVerification: async (user, request) => {
            const session = request
                ? await auth.api.getSession({ headers: request.headers })
                : null
            if (session?.user.id === user.id) return
            await evictPreVerificationCredentials(user.id)
        },
```

Keep the existing `sendVerificationEmail` entry below it unchanged except the first paragraph, which becomes:

```ts
                    "Please confirm this is your email address by clicking the button below. Open it in the browser where you signed up to keep your password; from anywhere else you will be asked to set a new one. Once verified you can also sign in with Google.",
```

Note `auth` is referenced inside its own config; that is fine because the hook runs long after `betterAuth()` has returned. If `pnpm check-types` complains about the implicit any from the self-reference, annotate: `export const auth: ReturnType<typeof betterAuth> = betterAuth({ ... })` is NOT acceptable (it loses plugin typing); instead move the hook body into a function declared below the export:

```ts
async function claimOnVerification(
    user: { id: string },
    request?: Request
): Promise<void> {
    const session = request
        ? await auth.api.getSession({ headers: request.headers })
        : null
    if (session?.user.id === user.id) return
    await evictPreVerificationCredentials(user.id)
}
```

and set `afterEmailVerification: claimOnVerification` (function declarations are hoisted, and the body only runs at request time).

- [ ] **Step 7: Run the config test and types**

Run: `pnpm vitest run src/lib/auth-config.test.ts && pnpm check-types`
Expected: PASS; no type errors.

- [ ] **Step 8: Reword `/auth/error` and offer the reset path**

In `src/app/auth/error/page.tsx`, replace the `CardDescription` and the `notLinked` block in `CardContent` with:

```tsx
                    <CardDescription>
                        {notLinked
                            ? "An account with this email already exists, but its email address hasn't been verified yet. For your security, Google sign-in can only be connected to a verified account."
                            : "Something went wrong while signing you in. Please try again."}
                    </CardDescription>
```

```tsx
                    {notLinked && (
                        <>
                            <p className="text-muted-foreground text-sm">
                                If you created that account, sign in with your
                                email and password, or send yourself a
                                verification link below.
                            </p>
                            <p className="text-muted-foreground text-sm">
                                If you did not create it, reset the password
                                instead. That signs out whoever did, verifies
                                your email, and Google sign-in will then work.
                            </p>
                            <SendVerificationForm />
                            <Button asChild variant="secondary" className="w-full">
                                <Link href="/auth/forgot-password">
                                    Reset password
                                </Link>
                            </Button>
                        </>
                    )}
```

(The verification form stays: with the hook from Step 6 it is now a safe way for the inbox owner to claim the account.)

- [ ] **Step 9: Challenge a changed address from settings**

In `src/app/dashboard/settings/actions.ts`, add the imports:

```ts
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { logger } from "@/lib/logger"
```

After the `await db.update(users)...` statement and before `await logAuditEntry(...)`, add:

```ts
        if (emailChanged) {
            // The new address is unverified until its owner clicks the link.
            // Sending it now, with this request's cookies, means the common
            // case (the user verifies in this same browser) keeps their
            // password; see afterEmailVerification in src/lib/auth.ts.
            try {
                await auth.api.sendVerificationEmail({
                    body: { email, callbackURL: "/dashboard/account" },
                    headers: await headers()
                })
            } catch (error) {
                logger.warn("[settings] verification email failed", {
                    userId: session.user.id,
                    error: error instanceof Error ? error.message : String(error)
                })
            }
        }
```

Check `src/lib/logger.ts` exports `logger` with a `warn(message, meta)` signature (it is used that way in `src/lib/inbound/thread-detection.ts`). If `/dashboard/account` is not the settings page route, use the route that renders `account-form.tsx` (find it with `grep -rn "account-form" src/app`).

- [ ] **Step 10: Verify, lint, commit**

Run: `pnpm check-types && pnpm vitest run src/lib/auth-config.test.ts src/lib/auth-verification.integration.test.ts && pnpm lint`
Expected: all green.

```bash
git add src/lib/auth-verification.ts src/lib/auth-verification.integration.test.ts src/lib/auth.ts src/lib/auth-config.test.ts src/app/auth/error/page.tsx src/app/dashboard/settings/actions.ts
git commit -m "fix(auth): evict pre-verification credentials when the inbox owner verifies

A password account can be registered under someone else's address. When
that person verified it (the /auth/error flow told them to) they were
signed into the attacker's account and Google then linked into it, with
the attacker's password still valid. Verification by a clicker without a
session now revokes all sessions and the credential row; password reset
marks the email verified; a settings-page email change sends the
challenge to the new address at once."
```

---

### Task 2: pics-guard — route the whole host through the Worker and decide on the decoded path

**Finding.** The Worker is bound only to literal prefix routes. `GET /sponsorlogos%2F<key>` (and `/scoresheet-samples%2F…`, `/inbound-spool%2F…`) never matches a route, R2 decodes `%2F`, and the object is served straight from the origin without the Worker's 404 or sandbox CSP. Proven live.

**Fix.** One catch-all route; the Worker decodes and normalises the path, 404s private prefixes, sandboxes sponsor logos, and proxies every other object from the bucket with a modest cache lifetime (player pictures are overwritten in place, so they must not be `immutable`).

**Files:**
- Modify: `workers/pics-guard/wrangler.jsonc`
- Modify: `workers/pics-guard/src/index.ts`
- Modify: `workers/pics-guard/test/index.test.ts`
- Modify: `AGENTS.md` (the pics-guard bullet under "Inbound Email")

**Interfaces:**
- Produces: `export function normalizePath(pathname: string): string | null` in `workers/pics-guard/src/index.ts` — decoded, `//` collapsed, `null` for malformed or `..`.

- [ ] **Step 1: Write the failing Worker tests**

Replace the body of `workers/pics-guard/test/index.test.ts` with:

```ts
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import worker, { normalizePath } from "../src/index"

const SELF = {
    fetch: (url: string, init?: RequestInit) =>
        worker.fetch(
            new Request(url, init),
            env as unknown as { PICS: R2Bucket }
        )
}

const HOST = "https://pics.bumpsetdrink.com"

describe("normalizePath", () => {
    it("decodes percent-encoded slashes and collapses repeats", () => {
        expect(normalizePath("/inbound-spool%2Fx.json")).toBe(
            "/inbound-spool/x.json"
        )
        expect(normalizePath("/sponsorlogos//1-2.png")).toBe(
            "/sponsorlogos/1-2.png"
        )
    })

    it("refuses malformed encodings and parent segments", () => {
        expect(normalizePath("/playerpics/%E0%A4%A")).toBeNull()
        expect(normalizePath("/playerpics/../inbound-spool/x.json")).toBeNull()
        expect(normalizePath("/playerpics/%2e%2e/x.json")).toBeNull()
    })
})

describe("private prefixes", () => {
    it.each([
        "/email-attachments/abc/0-invoice.pdf",
        "/inbound-spool/11111111-2222-4333-8444-555555555555.json",
        "/scoresheet-samples/1/2/crop.png",
        // Encoded slash: the route-level bypass found in the 2026-10 audit.
        "/email-attachments%2Fabc%2F0-invoice.pdf",
        "/inbound-spool%2F11111111-2222-4333-8444-555555555555.json",
        "/scoresheet-samples%2F1%2F2%2Fcrop.png",
        "//scoresheet-samples/1/2/crop.png"
    ])("never serves %s, even when the object exists", async (path) => {
        const key = decodeURIComponent(path).replace(/^\/+/, "")
        await env.PICS.put(key, "secret bytes")
        const response = await SELF.fetch(`${HOST}${path}`)
        expect(response.status).toBe(404)
        expect(await response.text()).not.toContain("secret")
    })
})

describe("sponsor logos", () => {
    it("serves the logo with a sandboxing CSP", async () => {
        await env.PICS.put(
            "sponsorlogos/7-1700000000000.svg",
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            { httpMetadata: { contentType: "image/svg+xml" } }
        )
        const response = await SELF.fetch(
            `${HOST}/sponsorlogos/7-1700000000000.svg`
        )
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("image/svg+xml")
        expect(response.headers.get("content-security-policy")).toContain(
            "sandbox"
        )
        expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    })

    it("sandboxes the logo even when the slash is percent-encoded", async () => {
        await env.PICS.put(
            "sponsorlogos/8-1700000000000.svg",
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            { httpMetadata: { contentType: "image/svg+xml" } }
        )
        const response = await SELF.fetch(
            `${HOST}/sponsorlogos%2F8-1700000000000.svg`
        )
        expect(response.status).toBe(200)
        expect(response.headers.get("content-security-policy")).toContain(
            "sandbox"
        )
    })

    it("answers 404 for a missing logo and 405 for writes", async () => {
        expect(
            (await SELF.fetch(`${HOST}/sponsorlogos/missing.png`)).status
        ).toBe(404)
        expect(
            (
                await SELF.fetch(`${HOST}/sponsorlogos/x.png`, {
                    method: "PUT",
                    body: "x"
                })
            ).status
        ).toBe(405)
    })
})

describe("public pictures", () => {
    it("serves a player picture with its content type and a short cache", async () => {
        await env.PICS.put("playerpics/123_jl.jpg", "jpeg bytes", {
            httpMetadata: { contentType: "image/jpeg" }
        })
        const response = await SELF.fetch(`${HOST}/playerpics/123_jl.jpg`)
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("image/jpeg")
        expect(await response.text()).toBe("jpeg bytes")
        // Player pictures are overwritten in place on re-upload, so they
        // must not be cached as immutable.
        expect(response.headers.get("cache-control")).toBe(
            "public, max-age=14400"
        )
        expect(response.headers.get("content-security-policy")).toBeNull()
    })

    it("serves a public picture requested with an encoded slash", async () => {
        await env.PICS.put("teampics/5.jpg", "team bytes", {
            httpMetadata: { contentType: "image/jpeg" }
        })
        const response = await SELF.fetch(`${HOST}/teampics%2F5.jpg`)
        expect(response.status).toBe(200)
        expect(await response.text()).toBe("team bytes")
    })

    it("answers 404 for a missing picture, the root, and malformed paths", async () => {
        expect((await SELF.fetch(`${HOST}/playerpics/none.jpg`)).status).toBe(
            404
        )
        expect((await SELF.fetch(`${HOST}/`)).status).toBe(404)
        expect((await SELF.fetch(`${HOST}/playerpics/%E0%A4%A`)).status).toBe(
            404
        )
    })

    it("answers HEAD without a body", async () => {
        await env.PICS.put("playerpics/head.jpg", "bytes", {
            httpMetadata: { contentType: "image/jpeg" }
        })
        const response = await SELF.fetch(`${HOST}/playerpics/head.jpg`, {
            method: "HEAD"
        })
        expect(response.status).toBe(200)
        expect(await response.text()).toBe("")
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm pics-guard:install && pnpm pics-guard:test`
Expected: FAIL — `normalizePath` is not exported; encoded-slash private cases currently 404 only by accident of "not reachable" (they will pass) but the public-picture cases return 404.

- [ ] **Step 3: Rewrite `workers/pics-guard/src/index.ts`**

```ts
/**
 * Guard in front of pics.bumpsetdrink.com, the public custom domain of the
 * R2 bucket "bsd".
 *
 * The bucket also holds objects that must never be public: inbound email
 * attachments (staff download them through 60-second presigned URLs after a
 * permission check), the raw inbound-email spool, and the score-sheet
 * handwriting corpus. Without this Worker any of those was downloadable by
 * key from the public domain, bypassing the app's authorization entirely.
 *
 * The Worker is bound to the whole host (wrangler.jsonc). It used to be
 * bound only to the guarded prefixes, and Cloudflare matches routes on the
 * raw URL, so `/inbound-spool%2F<key>` skipped the Worker and R2 decoded
 * the slash itself. Every decision here is made on the decoded, normalised
 * path, and anything the Worker does not recognise is served from the
 * bucket by the Worker rather than by the origin.
 *  - private prefixes always answer 404 (not 403: don't confirm a key exists);
 *  - sponsor logos are served with a sandboxing CSP. Sponsor contacts (not
 *    only admins) may upload SVG, and an SVG opened directly is a document
 *    that can run script on this origin; the sandbox stops that while <img>
 *    rendering is unaffected;
 *  - everything else (player, team and score-sheet pictures) is served as
 *    is, with a short cache because those keys are overwritten in place.
 */

export const PRIVATE_PREFIXES = [
    "/email-attachments/",
    "/inbound-spool/",
    "/scoresheet-samples/"
]
const SPONSOR_LOGO_PREFIX = "/sponsorlogos/"

const LOGO_CSP =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox"
const PUBLIC_CACHE = "public, max-age=14400"
// Logo filenames carry their upload time, so a key never changes content.
const LOGO_CACHE = "public, max-age=31536000, immutable"

interface Env {
    PICS: R2Bucket
}

/**
 * Decode and normalise a request path so prefix checks see what R2 would
 * resolve. Returns null when the path cannot be a key we issued: malformed
 * percent-encoding, or a `..` segment (R2 keys are flat strings and ours
 * never contain one, so refusing is free and removes a whole class of
 * confusion).
 */
export function normalizePath(pathname: string): string | null {
    let decoded: string
    try {
        decoded = decodeURIComponent(pathname)
    } catch {
        return null
    }
    const collapsed = `/${decoded.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/")
    if (collapsed.split("/").includes("..")) return null
    return collapsed
}

function notFound(): Response {
    return new Response("Not found", {
        status: 404,
        headers: { "cache-control": "no-store" }
    })
}

async function serveObject(
    request: Request,
    env: Env,
    key: string,
    { cacheControl, csp }: { cacheControl: string; csp?: string }
): Promise<Response> {
    const object = await env.PICS.get(key)
    if (!object) return notFound()

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set("etag", object.httpEtag)
    headers.set("x-content-type-options", "nosniff")
    headers.set("cache-control", cacheControl)
    if (csp) headers.set("content-security-policy", csp)
    return new Response(request.method === "HEAD" ? null : object.body, {
        headers
    })
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method not allowed", {
                status: 405,
                headers: { allow: "GET, HEAD" }
            })
        }
        const path = normalizePath(new URL(request.url).pathname)
        if (path === null || path === "/") return notFound()
        if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
            return notFound()
        }
        const key = path.slice(1)
        if (path.startsWith(SPONSOR_LOGO_PREFIX)) {
            return serveObject(request, env, key, {
                cacheControl: LOGO_CACHE,
                csp: LOGO_CSP
            })
        }
        return serveObject(request, env, key, { cacheControl: PUBLIC_CACHE })
    }
} satisfies ExportedHandler<Env>
```

- [ ] **Step 4: Bind the whole host in `workers/pics-guard/wrangler.jsonc`**

Replace the `routes` array and its comment with:

```jsonc
    // The whole host runs the Worker. Prefix-only routes were bypassable:
    // Cloudflare matches routes on the raw URL, so "/inbound-spool%2Fkey"
    // never matched and R2 served the private object itself (2026-10 audit).
    // Public pictures are served by the Worker too; Cloudflare's cache
    // absorbs repeat hits.
    "routes": [
        {
            "pattern": "pics.bumpsetdrink.com/*",
            "zone_name": "bumpsetdrink.com"
        }
    ],
```

- [ ] **Step 5: Run tests and types**

Run: `pnpm pics-guard:test && pnpm pics-guard:check-types`
Expected: PASS.

- [ ] **Step 6: Update AGENTS.md**

Replace the bullet that begins "The bucket's public custom domain `pics.bumpsetdrink.com`" with:

```markdown
- The bucket's public custom domain `pics.bumpsetdrink.com` is fronted entirely by the `workers/pics-guard/` Worker (`bsd-pics-guard`, route `pics.bumpsetdrink.com/*`). It decodes and normalises the path, answers 404 for `email-attachments/`, `inbound-spool/` and `scoresheet-samples/`, serves `sponsorlogos/` with a sandboxing CSP (sponsor contacts may upload SVG), and serves every other picture from the bucket with a 4-hour cache. The route must stay a catch-all: with prefix-only routes a percent-encoded slash (`/inbound-spool%2F…`) skipped the Worker and R2 served the private object directly. **A new private prefix in the bucket needs an entry in `PRIVATE_PREFIXES` there** and a case in its test. `pnpm pics-guard:test` / `pics-guard:deploy` (needs a Cloudflare login).
```

- [ ] **Step 7: Commit**

```bash
git add workers/pics-guard/src/index.ts workers/pics-guard/test/index.test.ts workers/pics-guard/wrangler.jsonc AGENTS.md
git commit -m "fix(pics-guard): run the Worker on the whole host and decide on the decoded path

Prefix routes matched the raw URL, so /inbound-spool%2F<key> skipped the
Worker and R2 decoded the slash and served the private object. The Worker
now owns pics.bumpsetdrink.com/*, normalises the path before the prefix
check, and serves public pictures itself. Needs pnpm pics-guard:deploy."
```

Flag in the final summary: **the Worker must be deployed (`pnpm pics-guard:deploy`) by someone with a Cloudflare login; until then production is still bypassable.**

---

### Task 3: Week-2 homework — only your own roster can be force-moved

**Finding.** `submitWeek2Homework` and `submitCoachWeek2Homework` write every submitted player id to `moving_day` without checking that the player is on the captain's Week-2 team (or, for coaches, on the named team in the coach's division). Forced rows are applied as the default placement when the admin builds Week 3.

**Files:**
- Modify: `src/app/dashboard/week-2-homework/actions.ts`
- Modify: `src/app/dashboard/week-2-homework/actions.integration.test.ts`
- Modify: `scripts/security/authz-regression-check.js` (strictExpectations)

- [ ] **Step 1: Write the failing integration tests**

Append to `src/app/dashboard/week-2-homework/actions.integration.test.ts` (add `submitCoachWeek2Homework` to the `./actions` import, and `individual_divisions`, `teams` to the schema import, `createTeam` to the factories import):

```ts
/**
 * Two-division season: AA (level 1, top) and A (level 2, bottom). The
 * captain under test leads team 1 in A, so they must submit a forced
 * move UP and the rival sits on team 2 in A.
 */
async function seedTwoTeamDivision() {
    const season = await createSeason()
    const divAA = await createDivision({ name: "AA", level: 1 })
    const divA = await createDivision({ name: "A", level: 2 })
    const captain = await createUserWithRoles([{ role: "captain" }], {
        male: true
    })
    const ownMale = await createUser({ male: true })
    const ownNonMale = await createUser({ male: false })
    const rival = await createUser({ male: true })
    await db.insert(week2Rosters).values([
        {
            season: season.id,
            user: captain.id,
            division: divA.id,
            team_number: 1,
            is_captain: true
        },
        {
            season: season.id,
            user: ownMale.id,
            division: divA.id,
            team_number: 1,
            is_captain: false
        },
        {
            season: season.id,
            user: ownNonMale.id,
            division: divA.id,
            team_number: 1,
            is_captain: false
        },
        {
            season: season.id,
            user: rival.id,
            division: divA.id,
            team_number: 2,
            is_captain: false
        }
    ])
    return { season, divAA, divA, captain, ownMale, ownNonMale, rival }
}

describe("submitWeek2Homework — forced picks are scoped to the captain's team", () => {
    it("rejects a forced move for a player on another team", async () => {
        const { captain, ownNonMale, rival } = await seedTwoTeamDivision()

        const result = await submitWeek2Homework({
            ...emptyInput,
            forcedMoveUpMale: rival.id,
            forcedMoveUpNonMale: ownNonMale.id
        })

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "your Week 2 team"
        )
        expect(
            await db
                .select()
                .from(movingDay)
                .where(eq(movingDay.submitted_by, captain.id))
        ).toHaveLength(0)
    })

    it("rejects a forced move in the wrong gender slot", async () => {
        const { ownMale, ownNonMale } = await seedTwoTeamDivision()

        const result = await submitWeek2Homework({
            ...emptyInput,
            forcedMoveUpMale: ownNonMale.id,
            forcedMoveUpNonMale: ownMale.id
        })

        expect(result.status).toBe(false)
    })

    it("rejects a recommendation for someone not in the week 2 tryout", async () => {
        const { ownMale, ownNonMale } = await seedTwoTeamDivision()
        const outsider = await createUser()

        const result = await submitWeek2Homework({
            ...emptyInput,
            forcedMoveUpMale: ownMale.id,
            forcedMoveUpNonMale: ownNonMale.id,
            recommendedMoveDown: [outsider.id]
        })

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "Week 2 tryout"
        )
    })

    it("accepts forced picks from the captain's own team", async () => {
        const { captain, ownMale, ownNonMale, rival } =
            await seedTwoTeamDivision()

        const result = await submitWeek2Homework({
            ...emptyInput,
            forcedMoveUpMale: ownMale.id,
            forcedMoveUpNonMale: ownNonMale.id,
            // Recommendations may name anyone in the division-wide tryout.
            recommendedMoveDown: [rival.id]
        })

        expect(result.status).toBe(true)
        const rows = await db
            .select({ player: movingDay.player, forced: movingDay.is_forced })
            .from(movingDay)
            .where(eq(movingDay.submitted_by, captain.id))
        expect(rows).toHaveLength(3)
        expect(rows.filter((r) => r.forced).map((r) => r.player).sort()).toEqual(
            [ownMale.id, ownNonMale.id].sort()
        )
    })
})

describe("submitCoachWeek2Homework — forced picks must be on the named team", () => {
    async function seedCoachDivision() {
        const season = await createSeason()
        await createDivision({ name: "AA", level: 1 })
        const divA = await createDivision({ name: "A", level: 2 })
        await db.insert(individual_divisions).values({
            season: season.id,
            division: divA.id,
            coaches: true,
            gender_split: "4-2",
            teams: 2
        })
        const coach = await createUserWithRoles([{ role: "captain" }])
        await createTeam({
            season: season.id,
            captain: coach.id,
            division: divA.id
        })
        const team1Player = await createUser()
        const team2Player = await createUser()
        await db.insert(week2Rosters).values([
            {
                season: season.id,
                user: team1Player.id,
                division: divA.id,
                team_number: 1,
                is_captain: false
            },
            {
                season: season.id,
                user: team2Player.id,
                division: divA.id,
                team_number: 2,
                is_captain: false
            }
        ])
        return { coach, team1Player, team2Player }
    }

    it("rejects a forced move whose player is not on that team", async () => {
        const { coach, team1Player, team2Player } = await seedCoachDivision()

        const result = await submitCoachWeek2Homework({
            forcedMoveUpByTeam: [
                { teamNumber: 1, playerId: team2Player.id },
                { teamNumber: 2, playerId: team1Player.id }
            ],
            recommendedMoveUp: [],
            recommendedMoveDown: []
        })

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain("Team")
        expect(
            await db
                .select()
                .from(movingDay)
                .where(eq(movingDay.submitted_by, coach.id))
        ).toHaveLength(0)
    })

    it("accepts forced moves that match the roster", async () => {
        const { team1Player, team2Player } = await seedCoachDivision()

        const result = await submitCoachWeek2Homework({
            forcedMoveUpByTeam: [
                { teamNumber: 1, playerId: team1Player.id },
                { teamNumber: 2, playerId: team2Player.id }
            ],
            recommendedMoveUp: [],
            recommendedMoveDown: []
        })

        expect(result.status).toBe(true)
    })
})
```

If `createUser` does not accept `male` (check `users.$inferInsert` has a `male` column — it does, `users.male` is selected in the action), keep as written.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm vitest run src/app/dashboard/week-2-homework/actions.integration.test.ts`
Expected: the four negative/positive scoped tests fail (today the rival/outsider ids are accepted).

- [ ] **Step 3: Validate against the roster in `submitWeek2Homework`**

In `src/app/dashboard/week-2-homework/actions.ts`, change the `teamNonCaptainRows` query to also select the user id:

```ts
        const teamNonCaptainRows = await db
            .select({ userId: week2Rosters.user, male: users.male })
            .from(week2Rosters)
            .innerJoin(users, eq(week2Rosters.user, users.id))
            .where(
                and(
                    eq(week2Rosters.season, config.seasonId),
                    eq(week2Rosters.division, captainEntry.divisionId),
                    eq(week2Rosters.team_number, captainEntry.teamNumber),
                    eq(week2Rosters.is_captain, false)
                )
            )
```

Immediately after the `nonMaleCount` / `canShareNonMale` lines, add:

```ts
        // Forced picks come off the captain's own team, in the slot the UI
        // labels; recommendations may name anyone in the Week 2 tryout. The
        // ids arrive from the browser, so both rules are enforced here and
        // not only by the pick lists the form renders.
        const teamMaleIds = new Set(
            teamNonCaptainRows.filter((r) => r.male === true).map((r) => r.userId)
        )
        const teamNonMaleIds = new Set(
            teamNonCaptainRows.filter((r) => r.male !== true).map((r) => r.userId)
        )
        const forcedSlots: Array<[string, Set<string>, string]> = [
            [input.forcedMoveUpMale, teamMaleIds, "male player to move up"],
            [
                input.forcedMoveUpNonMale,
                teamNonMaleIds,
                "non-male player to move up"
            ],
            [
                input.forcedMoveDownMale,
                teamMaleIds,
                "male player to move down"
            ],
            [
                input.forcedMoveDownNonMale,
                teamNonMaleIds,
                "non-male player to move down"
            ]
        ]
        for (const [pick, allowed, label] of forcedSlots) {
            if (pick && !allowed.has(pick)) {
                return fail(
                    `The ${label} must be a player on your Week 2 team.`
                )
            }
        }

        const tryoutRows = await db
            .select({ userId: week2Rosters.user })
            .from(week2Rosters)
            .where(eq(week2Rosters.season, config.seasonId))
        const tryoutIds = new Set(tryoutRows.map((r) => r.userId))
        for (const userId of [
            ...input.recommendedMoveUp,
            ...input.recommendedMoveDown
        ]) {
            if (userId && !tryoutIds.has(userId)) {
                return fail(
                    "Recommendations must name players in the Week 2 tryout."
                )
            }
        }
```

- [ ] **Step 4: Validate against the roster in `submitCoachWeek2Homework`**

Replace the `if (!isTopDivision) { const divisionTeamNumbers = ... }` block with:

```ts
        const divisionRoster = await db
            .select({
                userId: week2Rosters.user,
                teamNumber: week2Rosters.team_number
            })
            .from(week2Rosters)
            .where(
                and(
                    eq(week2Rosters.season, config.seasonId),
                    eq(week2Rosters.division, coachTeamEntry.divisionId)
                )
            )
        const teamByUser = new Map(
            divisionRoster.map((r) => [r.userId, r.teamNumber])
        )
        const divisionTeamNumbers = [
            ...new Set(divisionRoster.map((r) => r.teamNumber))
        ]

        if (!isTopDivision) {
            const providedTeamNumbers = new Set(
                input.forcedMoveUpByTeam
                    .filter((f) => f.playerId)
                    .map((f) => f.teamNumber)
            )

            for (const teamNumber of divisionTeamNumbers) {
                if (!providedTeamNumbers.has(teamNumber)) {
                    return fail(
                        `Please select a player to move up from Team ${formatTryoutTeamLabel(divisionInfo?.name ?? "", teamNumber)}`
                    )
                }
            }

            // The player named for a team must actually be on that team in
            // this division; the ids come from the browser.
            for (const { teamNumber, playerId } of input.forcedMoveUpByTeam) {
                if (playerId && teamByUser.get(playerId) !== teamNumber) {
                    return fail(
                        `The player chosen for Team ${formatTryoutTeamLabel(divisionInfo?.name ?? "", teamNumber)} is not on that team.`
                    )
                }
            }
        }

        const tryoutRows = await db
            .select({ userId: week2Rosters.user })
            .from(week2Rosters)
            .where(eq(week2Rosters.season, config.seasonId))
        const tryoutIds = new Set(tryoutRows.map((r) => r.userId))
        for (const userId of [
            ...input.recommendedMoveUp,
            ...input.recommendedMoveDown
        ]) {
            if (userId && !tryoutIds.has(userId)) {
                return fail(
                    "Recommendations must name players in the Week 2 tryout."
                )
            }
        }
```

- [ ] **Step 5: Run the file's tests**

Run: `pnpm vitest run src/app/dashboard/week-2-homework/actions.integration.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 6: Pin with strictExpectations**

In `scripts/security/authz-regression-check.js`, append to the `strictExpectations` array:

```js
    {
        key: "src/app/dashboard/week-2-homework/actions.ts:submitWeek2Homework",
        pattern: /must be a player on your Week 2 team/,
        description: "forced picks must be validated against the captain's week-2 roster"
    },
    {
        key: "src/app/dashboard/week-2-homework/actions.ts:submitCoachWeek2Homework",
        pattern: /is not on that team/,
        description: "forced picks must be validated against the named team's week-2 roster"
    },
```

Check how the checker keys `withAction` exports (search the file for `withAction`): the key format is `<path>:<exportName>`, which matches the `export const submitWeek2Homework = withAction(` form.

Run: `pnpm check-authz`
Expected: pass.

- [ ] **Step 7: Lint and commit**

Run: `pnpm check-types && pnpm lint`

```bash
git add src/app/dashboard/week-2-homework/actions.ts src/app/dashboard/week-2-homework/actions.integration.test.ts scripts/security/authz-regression-check.js
git commit -m "fix(week-2-homework): forced moves must name players on the submitter's team

Player ids were written to moving_day unchecked, so any week-2 captain
could force any player one division up or down and overwrite another
captain's pick. Forced picks are now validated against the captain's own
roster (coaches: the named team), recommendations against the tryout."
```

---

### Task 4: Homework-status detail actions respect commissioner division scope

**Finding.** `getRatePlayersDetail`, `getMovingDayDetail`, `getDraftHomeworkDetail` guard with `isCommissionerBySession()` only and accept any `captainId`/`seasonId`, so a division-scoped commissioner reads any captain's homework in any division or season. The page's own loader (`data.ts`) already scopes by `getCommissionerDivisionScope`.

**Files:**
- Modify: `src/app/dashboard/homework-status/actions.ts`
- Modify: `src/app/dashboard/homework-status/actions.integration.test.ts`
- Modify: `scripts/security/authz-regression-check.js`

**Interfaces:**
- Produces (module-private): `resolveCaptainDivision(captainId, seasonId): Promise<number | null>` and `requireCaptainInScope(captainId, seasonId): Promise<ActionResult<number>>` inside `actions.ts`.

- [ ] **Step 1: Write the failing tests**

The existing test file imports from `./data`. Add a second `describe` block for the actions (extend the imports: `import { getDraftHomeworkDetail, getMovingDayDetail, getRatePlayersDetail } from "./actions"`, and `logout` from `@/test/session`, `teams` is not needed). Append:

```ts
describe("homework-status detail actions — commissioner division scope", () => {
    async function seedCaptainsInTwoDivisions() {
        const { season, divAA, divA, captainAA, captainA } =
            await seedTwoDivisionSeason()
        const player = await createUser()
        await db.insert(movingDay).values({
            season: season.id,
            submitted_by: captainAA.id,
            player: player.id,
            direction: "down",
            is_forced: true
        })
        return { season, divAA, divA, captainAA, captainA }
    }

    it("lets a division-scoped commissioner read their own division's captain", async () => {
        const { season, divAA, captainAA } = await seedCaptainsInTwoDivisions()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id, divisionId: divAA.id }
        ])

        const result = await getMovingDayDetail(captainAA.id, season.id)

        expect(result.status).toBe(true)
        expect(result.status && result.data.forcedDown).toHaveLength(1)
    })

    it("refuses a division-scoped commissioner reading another division's captain", async () => {
        const { season, divA, captainAA } = await seedCaptainsInTwoDivisions()
        await createUserWithRoles([
            { role: "commissioner", seasonId: season.id, divisionId: divA.id }
        ])

        const moving = await getMovingDayDetail(captainAA.id, season.id)
        const rate = await getRatePlayersDetail(captainAA.id, season.id)
        const draft = await getDraftHomeworkDetail(captainAA.id, season.id)

        for (const result of [moving, rate, draft]) {
            expect(result.status).toBe(false)
            expect(result.status === false && result.message).toBe(
                "Unauthorized"
            )
        }
    })

    it("refuses a commissioner of a different season", async () => {
        const { season, divAA, captainAA } = await seedCaptainsInTwoDivisions()
        const otherSeason = await createSeason()
        await createUserWithRoles([
            { role: "commissioner", seasonId: otherSeason.id, divisionId: divAA.id }
        ])

        const result = await getMovingDayDetail(captainAA.id, season.id)

        expect(result.status).toBe(false)
    })

    it("lets an admin read any captain", async () => {
        const { season, captainA } = await seedCaptainsInTwoDivisions()
        await createUserWithRoles([{ role: "admin" }])

        const result = await getMovingDayDetail(captainA.id, season.id)

        expect(result.status).toBe(true)
    })

    it("refuses when signed out", async () => {
        const { season, captainA } = await seedCaptainsInTwoDivisions()
        logout()

        const result = await getMovingDayDetail(captainA.id, season.id)

        expect(result.status).toBe(false)
    })
})
```

Note: `createSeason()` makes the newest season current (current season = max id). The "different season" test creates `otherSeason` AFTER `season`, so the commissioner's row is for the current season but the request targets the older one; the scope check keys on the requested season, so it must refuse.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/app/dashboard/homework-status/actions.integration.test.ts`
Expected: the "refuses" tests fail (currently return data).

- [ ] **Step 3: Add the scope helper and use it in all three actions**

In `src/app/dashboard/homework-status/actions.ts`, replace the `isCommissionerBySession` import with:

```ts
import { getSessionUserId } from "@/next/session"
import { commissionerCanWriteDivision } from "@/lib/rbac"
```

Add below the imports:

```ts
/**
 * The division a captain's team sits in for `seasonId`, or null when they
 * have no team that season. Captains hold a `teams` row (captain or
 * captain2) from the moment select-captains runs, so this resolves for
 * every phase the homework pages cover.
 */
async function resolveCaptainDivision(
    captainId: string,
    seasonId: number
): Promise<number | null> {
    const [team] = await db
        .select({ divisionId: teams.division })
        .from(teams)
        .where(
            and(
                eq(teams.season, seasonId),
                or(eq(teams.captain, captainId), eq(teams.captain2, captainId))
            )
        )
        .limit(1)
    return team?.divisionId ?? null
}

/**
 * Admins and league-wide commissioners may read any captain; a commissioner
 * scoped to one division only their own. The page's loader (data.ts) hides
 * other divisions, but these detail actions take the captain id from the
 * browser, so the same scope is enforced here. Returns the division id.
 */
async function requireCaptainInScope(
    captainId: string,
    seasonId: number
): Promise<ActionResult<number>> {
    const userId = await getSessionUserId()
    if (!userId) return fail("Unauthorized")
    const divisionId = await resolveCaptainDivision(captainId, seasonId)
    if (divisionId === null) return fail("Captain not found in this season.")
    const allowed = await commissionerCanWriteDivision(
        userId,
        seasonId,
        divisionId
    )
    if (!allowed) return fail("Unauthorized")
    return ok(divisionId)
}
```

In each of `getRatePlayersDetail`, `getMovingDayDetail`, `getDraftHomeworkDetail`, replace

```ts
        const hasAccess = await isCommissionerBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        requirePositiveInt(seasonId, "season")
```

with

```ts
        requirePositiveInt(seasonId, "season")
        const scope = await requireCaptainInScope(captainId, seasonId)
        if (!scope.status) return scope
```

In `getDraftHomeworkDetail`, the existing "1. Look up captain's team" query can now become `const divisionId = scope.data` (delete the `captainTeams` query and its `if (captainTeams.length === 0)` guard, since `requireCaptainInScope` already failed with "Captain not found in this season." in that case). Keep the `or` import if still used elsewhere; remove it if Biome flags it unused.

Guard-visibility note for the authz checker: `getSessionUserId` is called inside the helper, not the exported action. To keep the checker satisfied AND strict, each exported action must contain a guard regex the checker recognises. Simplest: keep a direct guard line in each action before the helper call:

```ts
        if (!(await getSessionUserId())) return fail("Unauthorized")
```

(The checker's recognised guard list is in `scripts/security/authz-regression-check.js`; `getSessionUserId` is in it — confirm with `grep -n getSessionUserId scripts/security/authz-regression-check.js`. If it is not, use `await requireSession()` from `@/next/action-helpers` instead.)

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/app/dashboard/homework-status/actions.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Pin, verify, commit**

Append to `strictExpectations`:

```js
    {
        key: "src/app/dashboard/homework-status/actions.ts:getRatePlayersDetail",
        pattern: /requireCaptainInScope\s*\(/,
        description: "must scope the captain to the commissioner's division via requireCaptainInScope"
    },
    {
        key: "src/app/dashboard/homework-status/actions.ts:getMovingDayDetail",
        pattern: /requireCaptainInScope\s*\(/,
        description: "must scope the captain to the commissioner's division via requireCaptainInScope"
    },
    {
        key: "src/app/dashboard/homework-status/actions.ts:getDraftHomeworkDetail",
        pattern: /requireCaptainInScope\s*\(/,
        description: "must scope the captain to the commissioner's division via requireCaptainInScope"
    },
```

Run: `pnpm check-authz && pnpm check-types && pnpm lint`

```bash
git add src/app/dashboard/homework-status/actions.ts src/app/dashboard/homework-status/actions.integration.test.ts scripts/security/authz-regression-check.js
git commit -m "fix(homework-status): scope captain detail reads to the commissioner's division

The three detail actions accepted any captain id and season behind a bare
is-commissioner check, so a division-scoped commissioner could read every
captain's draft board. They now resolve the captain's division and require
commissionerCanWriteDivision, matching the page loader."
```

---

### Task 5: Inbound email sanitizer blocks every remote-fetch vector

**Finding.** The remote-image block only inspects `<img src>`. `srcset`-only images, `<picture><source>`, `<video poster>`, `<svg><image href>`, `<input type=image>` and CSS `url()` all survive, so a sender learns when and from where staff opened a ticket.

**Files:**
- Modify: `src/lib/email-attachments-client.ts`
- Modify: `src/lib/email-attachments-client.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Append inside `describe("sanitizeInboundEmailHtml", ...)` in `src/lib/email-attachments-client.test.ts`:

```ts
    // Every way a browser can be made to fetch a remote URL on render. Each
    // one is a tracking pixel if it survives; the control exists for exactly
    // this (see the function's doc comment).
    it.each([
        ['srcset-only img', '<img srcset="https://evil.test/t.png 1x">'],
        [
            "picture source",
            '<picture><source srcset="https://evil.test/t.png"><img alt=""></picture>'
        ],
        ["video poster", '<video poster="https://evil.test/t.png"></video>'],
        [
            "svg image",
            '<svg><image href="https://evil.test/t.png" xlink:href="https://evil.test/t.png"/></svg>'
        ],
        ["input image", '<input type="image" src="https://evil.test/t.png">'],
        [
            "css background-image",
            '<div style="background-image:url(https://evil.test/t.png)">x</div>'
        ],
        [
            "css background shorthand",
            '<div style="background:url(\'https://evil.test/t.png\') no-repeat">x</div>'
        ],
        [
            "css image-set",
            '<div style="background-image:image-set(\\"https://evil.test/t.png\\" 1x)">x</div>'
        ]
    ])("blocks remote fetches via %s", (_label, html) => {
        const result = sanitizeInboundEmailHtml(html, [])
        expect(result.html).not.toContain("evil.test")
        expect(result.blockedImages).toBeGreaterThan(0)
    })

    it("still lets inline attachment images through", () => {
        const { html, blockedImages } = sanitizeInboundEmailHtml(
            '<img src="cid:sig@mail" srcset="cid:sig@mail 1x">',
            attachments
        )
        expect(html).toContain("/api/email-attachments/7?inline=1")
        expect(blockedImages).toBe(0)
    })

    it("lets remote images through when allowed", () => {
        const { html, blockedImages } = sanitizeInboundEmailHtml(
            '<img srcset="https://ok.test/t.png 1x"><div style="background:url(https://ok.test/b.png)">x</div>',
            [],
            { allowRemoteImages: true }
        )
        expect(html).toContain("ok.test/t.png")
        expect(html).toContain("ok.test/b.png")
        expect(blockedImages).toBe(0)
    })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/lib/email-attachments-client.test.ts`
Expected: the `it.each` cases fail (URL survives, `blockedImages` is 0).

- [ ] **Step 3: Generalise the hooks**

In `src/lib/email-attachments-client.ts`, replace the two `DOMPurify.addHook` calls and the `sanitize` options with:

```ts
    /** Attributes a browser fetches on render. `src` on IMG is the common case. */
    const URL_ATTRS = ["src", "srcset", "poster", "href", "xlink:href", "data"]
    const CSS_URL = /\b(url|image-set)\s*\(/i
    const isOurs = (value: string) =>
        value.trim().startsWith("/api/email-attachments/")

    DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
        if (data.attrName === "style") {
            if (ESCAPING_CSS.test(data.attrValue)) {
                data.keepAttr = false
            } else if (!allowRemoteImages && CSS_URL.test(data.attrValue)) {
                data.keepAttr = false
                blockedImages++
            }
        }
    })
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (allowRemoteImages) return
        // Anchors keep their href: a link is only fetched on click, and
        // staff need to see where a sender is pointing them.
        if (node.nodeName === "A") return
        let blocked = false
        for (const attr of URL_ATTRS) {
            const value = node.getAttribute(attr)
            if (value === null || value === "") continue
            // srcset lists several candidates; every one must be ours.
            const candidates =
                attr === "srcset"
                    ? value.split(",").map((c) => c.trim().split(/\s+/)[0])
                    : [value]
            if (candidates.every(isOurs)) continue
            node.removeAttribute(attr)
            blocked = true
        }
        if (blocked) blockedImages++
    })
    try {
        const clean = DOMPurify.sanitize(rewriteCidImages(html, attachments), {
            FORBID_TAGS: [
                "style",
                "iframe",
                "object",
                "embed",
                "form",
                "link",
                "meta",
                "base",
                // Media and vector containers have no place in a support
                // email and each carries its own remote-fetch attributes.
                "picture",
                "source",
                "video",
                "audio",
                "svg",
                "image",
                "use",
                "input"
            ],
            FORBID_ATTR: ["formaction", "background"]
        })
        return { html: clean, blockedImages }
    } finally {
        DOMPurify.removeHook("uponSanitizeAttribute")
        DOMPurify.removeHook("afterSanitizeAttributes")
    }
```

Also update the doc comment bullet: "blocks remote images unless `allowRemoteImages`" → "blocks every remote fetch a browser would make on render (img/srcset/poster/svg image/CSS url()) unless `allowRemoteImages`".

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/email-attachments-client.test.ts`
Expected: PASS, including the pre-existing cases. If the `image-set` case still leaks because DOMPurify normalises the escaped quotes differently, simplify that test payload to `image-set(url(https://evil.test/t.png) 1x)`; the regex matches either.

- [ ] **Step 5: Commit**

Run: `pnpm check-types && pnpm lint`

```bash
git add src/lib/email-attachments-client.ts src/lib/email-attachments-client.test.ts
git commit -m "fix(manage-emails): block every remote-fetch vector in inbound HTML, not only img src

srcset-only images, picture/source, video poster, svg image, input
type=image and CSS url() all loaded from the sender's host when a ticket
was opened, defeating the open-tracking protection the sanitizer promises."
```

---

### Task 6: CSV exports neutralise formula prefixes

**Finding.** `serializeCsvField` never escapes a leading `=`, `+`, `-`, `@`, tab or CR. Player-entered names, pair reasons, assessments and survey free text reach admin spreadsheets as live formulas.

**Files:**
- Modify: `src/lib/utils.ts:110-117`
- Modify: `src/lib/utils.test.ts` (the `serializeCsvField` describe)

- [ ] **Step 1: Write the failing unit test**

Append inside `describe("serializeCsvField", ...)`:

```ts
    // Spreadsheets evaluate a cell that starts with = + - @ (and tab/CR
    // variants) as a formula. These fields hold player-typed text.
    it("neutralises formula prefixes with a leading apostrophe", () => {
        expect(serializeCsvField("=HYPERLINK(\"https://x\",\"y\")")).toBe(
            "\"'=HYPERLINK(\"\"https://x\"\",\"\"y\"\")\""
        )
        expect(serializeCsvField("+1 555")).toBe("\"'+1 555\"")
        expect(serializeCsvField("-5")).toBe("\"'-5\"")
        expect(serializeCsvField("@mention")).toBe("\"'@mention\"")
        expect(serializeCsvField("\t=cmd")).toBe("\"'\t=cmd\"")
    })

    it("leaves negative numbers alone when they arrive as numbers", () => {
        // Only strings a player could have typed are escaped; numeric
        // columns (ids, amounts) keep their sign.
        expect(serializeCsvField(-5)).toBe("-5")
    })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/utils.test.ts`
Expected: FAIL (prefixes are returned unchanged).

- [ ] **Step 3: Implement**

Replace `serializeCsvField` in `src/lib/utils.ts`:

```ts
/** Leading characters a spreadsheet treats as the start of a formula. */
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/

/**
 * One CSV cell. Quotes when the value contains a delimiter, quote or line
 * break, and prefixes an apostrophe when a *string* starts with a formula
 * trigger: these exports carry player-typed text (names, pair reasons,
 * survey answers) that admins open in Excel, where `=HYPERLINK(...)` would
 * otherwise run. Numbers are serialised as given so numeric columns keep
 * their sign.
 */
export function serializeCsvField(value: unknown): string {
    if (value == null) return ""
    let str = String(value)
    if (typeof value === "string" && CSV_FORMULA_PREFIX.test(str)) {
        str = `'${str}`
        return `"${str.replace(/"/g, '""')}"`
    }
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}
```

- [ ] **Step 4: Run tests and the CSV consumers' tests**

Run: `pnpm vitest run src/lib/utils.test.ts src/lib/surveys && pnpm test:unit`
Expected: PASS. If a survey reporting test asserts an exact CSV string that starts a cell with `-` or `+`, update that expectation to the apostrophe-prefixed form and note it in the commit.

- [ ] **Step 5: Commit**

Run: `pnpm lint`

```bash
git add src/lib/utils.ts src/lib/utils.test.ts
git commit -m "fix(csv): neutralise formula prefixes in exported cells

Player-typed names, pair reasons, assessments and survey answers reached
admin spreadsheets unescaped, so a leading = + - @ ran as a formula."
```

---

### Task 7: Referee assignments are pinned to the current season, the date, and the ref roster

**Finding.** `saveRefAssignments` deletes and rewrites `match_referees` for any `matchId` in the payload, without checking the match belongs to the current season or the given date, and accepts any user id as a referee.

**Files:**
- Modify: `src/app/dashboard/schedule-refs/actions.ts` (`saveRefAssignments`)
- Create: `src/app/dashboard/schedule-refs/actions.integration.test.ts`
- Modify: `scripts/security/authz-regression-check.js`

- [ ] **Step 1: Write the failing integration test**

Create `src/app/dashboard/schedule-refs/actions.integration.test.ts`:

```ts
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "@/database/db"
import { matchReferees, seasonRefs } from "@/database/schema"
import { createDivision, createMatch, createSeason } from "@/test/factories"
import { createUser, createUserWithRoles } from "@/test/session"
import { saveRefAssignments } from "./actions"

const DATE = "2026-10-07"

async function seed() {
    const oldSeason = await createSeason()
    const season = await createSeason()
    const division = await createDivision()
    const ref = await createUser()
    await db.insert(seasonRefs).values({
        season_id: season.id,
        user_id: ref.id,
        is_active: true,
        max_division_level: 5
    })
    const match = await createMatch({
        season: season.id,
        division: division.id,
        date: DATE
    })
    const oldMatch = await createMatch({
        season: oldSeason.id,
        division: division.id,
        date: "2025-10-07"
    })
    const oldRef = await createUser()
    await db.insert(matchReferees).values({
        match_id: oldMatch.id,
        referee_id: oldRef.id,
        season_id: oldSeason.id,
        role: "primary"
    })
    await createUserWithRoles([
        { role: "referee_coordinator", seasonId: season.id }
    ])
    return { season, match, oldMatch, ref }
}

describe("saveRefAssignments", () => {
    it("saves assignments for a current-season match on the given date", async () => {
        const { match, ref } = await seed()

        const result = await saveRefAssignments(DATE, [
            { matchId: match.id, primaryRefId: ref.id, backupRefId: null }
        ])

        expect(result.status).toBe(true)
        const rows = await db
            .select()
            .from(matchReferees)
            .where(eq(matchReferees.match_id, match.id))
        expect(rows).toHaveLength(1)
        expect(rows[0].referee_id).toBe(ref.id)
    })

    it("refuses a match from another season and leaves its assignments intact", async () => {
        const { match, oldMatch, ref } = await seed()

        const result = await saveRefAssignments(DATE, [
            { matchId: match.id, primaryRefId: ref.id, backupRefId: null },
            { matchId: oldMatch.id, primaryRefId: null, backupRefId: null }
        ])

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "not on this date"
        )
        expect(
            await db
                .select()
                .from(matchReferees)
                .where(eq(matchReferees.match_id, oldMatch.id))
        ).toHaveLength(1)
        // Nothing was written for the valid match either: all or nothing.
        expect(
            await db
                .select()
                .from(matchReferees)
                .where(eq(matchReferees.match_id, match.id))
        ).toHaveLength(0)
    })

    it("refuses a match from a different date in the current season", async () => {
        const { match, ref } = await seed()

        const result = await saveRefAssignments("2026-10-14", [
            { matchId: match.id, primaryRefId: ref.id, backupRefId: null }
        ])

        expect(result.status).toBe(false)
    })

    it("refuses a referee who is not on the season's ref roster", async () => {
        const { match } = await seed()
        const stranger = await createUser()

        const result = await saveRefAssignments(DATE, [
            { matchId: match.id, primaryRefId: stranger.id, backupRefId: null }
        ])

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toContain(
            "not on the referee roster"
        )
    })

    it("refuses a non-staff caller", async () => {
        const { match, ref } = await seed()
        await createUserWithRoles([{ role: "captain" }])

        const result = await saveRefAssignments(DATE, [
            { matchId: match.id, primaryRefId: ref.id, backupRefId: null }
        ])

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toBe("Unauthorized.")
    })
})
```

Check the `seasonRefs` insert against the schema (`src/database/schema.ts:1645-1673`): include every NOT NULL column without a default. `is_active` and `max_division_level` are referenced by the eligibility query at `actions.ts:460-475`; confirm their exact names there and in the schema before running. Check `matches.date` is a `date`/`text` column accepting `"2026-10-07"` (see `createMatch` callers in other integration tests, e.g. `grep -rn "createMatch(" src --include=*.integration.test.ts | head`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/app/dashboard/schedule-refs/actions.integration.test.ts`
Expected: the three "refuses" tests fail (the save succeeds today).

- [ ] **Step 3: Validate before the transaction**

In `saveRefAssignments`, after the `for (const a of assignments)` same-person loop and before `await db.transaction(...)`, add:

```ts
        // The payload names matches and referees by id from the browser.
        // A season-scoped coordinator must only touch this season's matches
        // on the night they are editing, and only assign people on this
        // season's referee roster; otherwise past seasons' assignments (and
        // the pay reports built from them) could be rewritten by id.
        const matchIds = assignments
            .map((a) => a.matchId)
            .filter((id): id is number => typeof id === "number" && id > 0)
        if (matchIds.length === 0) {
            return ok(undefined, "Nothing to save.")
        }
        const matchRows = await db
            .select({ id: matches.id })
            .from(matches)
            .where(
                and(
                    inArray(matches.id, matchIds),
                    eq(matches.season, seasonId),
                    eq(matches.date, date)
                )
            )
        const validMatchIds = new Set(matchRows.map((m) => m.id))
        const badMatch = matchIds.find((id) => !validMatchIds.has(id))
        if (badMatch !== undefined) {
            return fail(
                `Match ${badMatch} is not on this date in the current season.`
            )
        }

        const refIds = [
            ...new Set(
                assignments
                    .flatMap((a) => [a.primaryRefId, a.backupRefId])
                    .filter((id): id is string => typeof id === "string" && id !== "")
            )
        ]
        if (refIds.length > 0) {
            const rosterRows = await db
                .select({ userId: seasonRefs.user_id })
                .from(seasonRefs)
                .where(
                    and(
                        eq(seasonRefs.season_id, seasonId),
                        inArray(seasonRefs.user_id, refIds)
                    )
                )
            const roster = new Set(rosterRows.map((r) => r.userId))
            const badRef = refIds.find((id) => !roster.has(id))
            if (badRef !== undefined) {
                return fail(
                    "One of the selected referees is not on the referee roster for this season."
                )
            }
        }
```

Inside the transaction loop, change the delete to also scope by season so a stale id can never reach another season's rows:

```ts
                await tx
                    .delete(matchReferees)
                    .where(
                        and(
                            eq(matchReferees.match_id, matchId),
                            eq(matchReferees.season_id, seasonId)
                        )
                    )
```

`matches.date` type: if it is a `date` column typed as `string` in Drizzle, `eq(matches.date, date)` type-checks as written. If it is a `timestamp`, compare with the same helper `getRefMatches` uses (look at `actions.ts` around line 596-668 and copy its date predicate).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/app/dashboard/schedule-refs/actions.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Pin, verify, commit**

Append to `strictExpectations`:

```js
    {
        key: "src/app/dashboard/schedule-refs/actions.ts:saveRefAssignments",
        pattern: /is not on this date in the current season/,
        description: "must pin every match id to the current season and the edited date"
    },
```

Run: `pnpm check-authz && pnpm check-types && pnpm lint`

```bash
git add src/app/dashboard/schedule-refs/actions.ts src/app/dashboard/schedule-refs/actions.integration.test.ts scripts/security/authz-regression-check.js
git commit -m "fix(schedule-refs): pin ref assignment writes to the season, the date and the ref roster

saveRefAssignments rewrote match_referees for any match id, so a
season-scoped coordinator could erase or re-tag past seasons' assignments
and assign anyone as a referee."
```

---

### Task 8: Draft-division reads use the current season only

**Finding.** `getDraftInitData` and `getDraftWatchlistData` accept a client `seasonId` while the access check is computed for the current season; a current captain passing an old season id falls into the commissioner branch for that old season.

**Files:**
- Modify: `src/app/dashboard/draft-division/actions.ts` (both actions)
- Modify: `src/app/dashboard/draft-division/actions.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Look at the existing file's fixtures first (`sed -n 1,80p src/app/dashboard/draft-division/actions.integration.test.ts`) and reuse its season/division/captain seeding helper if one exists. Append:

```ts
describe("draft-division reads — season pinning", () => {
    it("refuses a season id other than the current season", async () => {
        const oldSeason = await createSeason()
        const season = await createSeason()
        const division = await createDivision()
        const captain = await createUserWithRoles([{ role: "captain" }])
        await createTeam({
            season: season.id,
            captain: captain.id,
            division: division.id
        })

        const init = await getDraftInitData(oldSeason.id, division.id)
        const watchlist = await getDraftWatchlistData(oldSeason.id, division.id)

        expect(init.status).toBe(false)
        expect(watchlist.status).toBe(false)
        expect(watchlist.status === false && watchlist.message).toContain(
            "current season"
        )
    })
})
```

(Imports: `createDivision`, `createSeason`, `createTeam` from `@/test/factories`; `createUserWithRoles` from `@/test/session`; `getDraftInitData`, `getDraftWatchlistData` from `./actions`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/app/dashboard/draft-division/actions.integration.test.ts -t "season pinning"`
Expected: FAIL (both calls succeed today).

- [ ] **Step 3: Pin the season in both actions**

In both `getDraftInitData` and `getDraftWatchlistData`, directly after the two `requirePositiveInt(...)` lines, add:

```ts
        // Access (hasDraftPageAccess) is computed for the current season;
        // the season the queries run against must be the same one, or a
        // current captain could read another season's board as a
        // commissioner.
        const config = await getSeasonConfig()
        if (seasonId !== config.seasonId) {
            return fail("Draft data is only available for the current season.")
        }
```

`getSeasonConfig` is already imported in this file (used by `checkDraftReadAccess`).

- [ ] **Step 4: Run the whole file, verify, commit**

Run: `pnpm vitest run src/app/dashboard/draft-division/actions.integration.test.ts && pnpm check-types && pnpm lint`

```bash
git add src/app/dashboard/draft-division/actions.ts src/app/dashboard/draft-division/actions.integration.test.ts
git commit -m "fix(draft-division): refuse draft reads for any season but the current one

Access was checked for the current season while the queries used the
client's season id, so a current captain could read an old season's
division as a commissioner."
```

---

### Task 9: `getPlayerDetailsPublic` only serves people in the current season

**Finding.** Any `signups:view` holder (captains, court managers, ombudsman) can fetch profile text, ratings and shared notes for ANY user id, including former players not in this season.

**Files:**
- Modify: `src/app/dashboard/view-signups/actions.ts` (`getPlayerDetailsPublic`)
- Modify: `src/app/dashboard/view-signups/actions.integration.test.ts`
- Modify: `scripts/security/authz-regression-check.js`

- [ ] **Step 1: Write the failing tests**

In the existing test file, the three redaction tests call `getPlayerDetailsPublic(player.id)` for a player with NO signup. Update `seedPlayer()` to take the season and create a signup so those keep passing, then add the negative case:

```ts
    async function seedPlayer(seasonId: number) {
        const player = await createUser({
            phone: "555-123-4567",
            emergency_contact: "Jane Doe 555-999-0000"
        })
        await createSignup({ season: seasonId, player: player.id })
        return player
    }
```

Update each existing call site to `const season = await createSeason(); const player = await seedPlayer(season.id)`. Add:

```ts
    it("refuses a player who is not in the current season", async () => {
        const oldSeason = await createSeason()
        await createSeason()
        const formerPlayer = await createUser()
        await createSignup({ season: oldSeason.id, player: formerPlayer.id })
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerDetailsPublic(formerPlayer.id)

        expect(result.status).toBe(false)
        expect(result.status === false && result.message).toBe(
            "Player not found."
        )
    })

    it("serves a current-season waitlist member (sub-finder candidates)", async () => {
        const season = await createSeason()
        const waiting = await createUser()
        await addToWaitlist({ season: season.id, user: waiting.id })
        await createUserWithRoles([{ role: "captain" }])

        const result = await getPlayerDetailsPublic(waiting.id)

        expect(result.status).toBe(true)
    })
```

Check `addToWaitlist`'s parameter shape at `src/test/factories.ts:149` and adjust the call. Add `addToWaitlist`, `createSignup` to the factories import.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/app/dashboard/view-signups/actions.integration.test.ts`
Expected: the "refuses a player who is not in the current season" test fails.

- [ ] **Step 3: Require current-season membership**

In `getPlayerDetailsPublic`, right after `await requireCaptainAccess()`, add:

```ts
        // The callers (signup lists, draft watchlist, sub finder, homework
        // forms) only ever hand out ids of people in this season, but the id
        // arrives from the browser. Captains and court managers get the
        // current-season roster and waitlist, nobody else; former players'
        // self-assessments and captains' notes stay with player-lookup,
        // which is commissioner-gated.
        const config = await requireSeasonConfig()
        const [inSeason] = await db
            .select({ id: signups.id })
            .from(signups)
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    eq(signups.player, playerId)
                )
            )
            .limit(1)
        if (!inSeason) {
            const [onWaitlist] = await db
                .select({ id: waitlist.id })
                .from(waitlist)
                .where(
                    and(
                        eq(waitlist.season, config.seasonId),
                        eq(waitlist.user, playerId)
                    )
                )
                .limit(1)
            if (!onWaitlist) {
                return fail("Player not found.")
            }
        }
```

Add `waitlist` to the schema import. `requireSeasonConfig` is already imported in this file.

Then check every UI caller still works with its ids: `signups-list.tsx` (signups), `draft-watchlist.tsx` / `draft-board.tsx` (signups), `find-sub-panel.tsx` (permanent-sub pool = waitlist + undrafted signups, and regular subs = rostered players, all signups), `captain-info-card.tsx` (roster), `draft-homework-form.tsx` and the two week-2 forms (signups). Every one is covered by signups ∪ waitlist.

- [ ] **Step 4: Run tests, pin, verify, commit**

Run: `pnpm vitest run src/app/dashboard/view-signups/actions.integration.test.ts`

Append to `strictExpectations`:

```js
    {
        key: "src/app/dashboard/view-signups/actions.ts:getPlayerDetailsPublic",
        pattern: /eq\(signups\.season,\s*config\.seasonId\)/,
        description: "must restrict the target to a current-season signup or waitlist member"
    },
```

Run: `pnpm check-authz && pnpm check-types && pnpm lint`

```bash
git add src/app/dashboard/view-signups/actions.ts src/app/dashboard/view-signups/actions.integration.test.ts scripts/security/authz-regression-check.js
git commit -m "fix(view-signups): only serve player details for people in the current season

getPlayerDetailsPublic loaded any users row for any signups:view holder,
exposing former players' self-assessments and captains' shared notes."
```

---

### Task 10: Subject/header thread matches require a passing SPF or DKIM result

**Finding.** A reply is attached to an existing ticket by subject or `X-BSD-Ticket-ID` when the `From` address is a participant. `From` is attacker-controlled; Postmark delivers DMARC-failing mail with its authentication results in the `Headers` array, which the code never reads. Message-ID matches are unforgeable and stay as they are.

**Files:**
- Modify: `src/lib/inbound/message-parsing.ts` (add `senderAuthenticated`)
- Modify: `src/lib/inbound/message-parsing.test.ts`
- Modify: `src/lib/inbound/thread-detection.ts` (`detectExistingThread`)

**Interfaces:**
- Produces: `export function senderAuthenticated(headers: PostmarkHeader[]): boolean` in `message-parsing.ts`.

- [ ] **Step 1: Write the failing unit tests**

Append to `src/lib/inbound/message-parsing.test.ts` (add `senderAuthenticated` to the import):

```ts
describe("senderAuthenticated", () => {
    const h = (Name: string, Value: string) => ({ Name, Value })

    it("passes on Received-SPF pass", () => {
        expect(
            senderAuthenticated([
                h("Received-SPF", "Pass (sender SPF authorized) identity=mailfrom")
            ])
        ).toBe(true)
    })

    it("passes on a dkim=pass in Authentication-Results", () => {
        expect(
            senderAuthenticated([
                h("Received-SPF", "Fail (sender not authorized)"),
                h(
                    "Authentication-Results",
                    "mx.postmarkapp.com; dkim=pass header.d=example.com; spf=fail"
                )
            ])
        ).toBe(true)
    })

    it("fails when neither passes or the headers are missing", () => {
        expect(senderAuthenticated([])).toBe(false)
        expect(
            senderAuthenticated([
                h("Received-SPF", "SoftFail"),
                h("Authentication-Results", "dkim=fail header.d=example.com")
            ])
        ).toBe(false)
    })

    it("is not fooled by 'pass' appearing elsewhere in the value", () => {
        expect(
            senderAuthenticated([
                h("Authentication-Results", "spf=fail; dkim=none (no passing signature)")
            ])
        ).toBe(false)
    })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/inbound/message-parsing.test.ts`
Expected: FAIL — `senderAuthenticated` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/inbound/message-parsing.ts`:

```ts
/**
 * Did the sending host authenticate the From domain? Postmark forwards the
 * results of its own checks in the message headers: `Received-SPF` and an
 * `Authentication-Results` line with `dkim=`/`spf=` verdicts. A thread
 * match on a guessable reference (subject, X-BSD-Ticket-ID) is only as
 * trustworthy as the From address, and From is free text unless one of
 * these passes.
 */
export function senderAuthenticated(headers: PostmarkHeader[]): boolean {
    const spf = getHeader(headers, "Received-SPF")
    if (spf && /^\s*pass\b/i.test(spf)) return true
    const results = getHeader(headers, "Authentication-Results")
    if (results && /\b(dkim|spf)=pass\b/i.test(results)) return true
    return false
}
```

- [ ] **Step 4: Gate subject/header matches in `detectExistingThread`**

In `src/lib/inbound/thread-detection.ts`, add `senderAuthenticated` to the `./message-parsing` import, and change `fromParticipant` to:

```ts
    // Header and subject matches are only trusted from a thread participant
    // whose From the sending host vouched for (SPF or DKIM pass). From is
    // free text otherwise, and a concern id is a small integer.
    const authenticated = senderAuthenticated(headers)
    const fromParticipant = async (thread: ThreadRef, via: string) => {
        if (!authenticated) {
            logger.warn(
                `[postmark-webhook] Ignored ${via} match: sender not authenticated (SPF/DKIM)`,
                { threadType: thread.type, ticketId: thread.id }
            )
            return null
        }
        if (await senderOnThread(thread, senderEmail)) {
            logger.info(`[postmark-webhook] Thread detected via ${via}`, {
                threadType: thread.type,
                ticketId: thread.id
            })
            return thread
        }
        logger.warn(
            `[postmark-webhook] Ignored ${via} match from a non-participant`,
            { threadType: thread.type, ticketId: thread.id }
        )
        return null
    }
```

Message-ID matches (section 2 of the function) are untouched: a reply that carries our own Message-ID still threads regardless of SPF, so a legitimate reply from a mail setup with broken SPF only loses the subject fallback and becomes a new ticket instead of being dropped.

- [ ] **Step 5: Run tests, verify, commit**

Run: `pnpm vitest run src/lib/inbound && pnpm check-types && pnpm lint`

Also update the AGENTS.md "Security Patterns" bullet that ends "only when the sender is already on that thread." to "...only when the sender is already on that thread **and** Postmark reports an SPF or DKIM pass (`senderAuthenticated()`); Message-ID matches need neither."

```bash
git add src/lib/inbound/message-parsing.ts src/lib/inbound/message-parsing.test.ts src/lib/inbound/thread-detection.ts AGENTS.md
git commit -m "fix(inbound): require SPF or DKIM pass before trusting a subject or header thread match

From is attacker-controlled; a forged From plus 'Re: Concern #N' appended
mail to a reporter's thread and reopened it. Postmark's authentication
headers now gate the guessable-reference matches; Message-ID matches are
unchanged."
```

---

### Task 11: Full gate run and hand-off notes

**Files:**
- Modify: `/home/kasm-user/.claude/projects/-home-kasm-user-src-bsd-site-nextjs/memory/security-audit-2026-10-06.md` (mark items fixed)

- [ ] **Step 1: Run every gate**

Run: `pnpm check-types && pnpm check-authz && pnpm test && pnpm pics-guard:test && pnpm lint`
Expected: all green. `pnpm test` runs unit + integration; the integration suite needs Postgres up.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: success. The auth hook self-reference and the settings action's `next/headers` import are the two places most likely to surface a build-only error.

- [ ] **Step 3: Update the audit memory**

In the memory file, change the "**Confirmed, unfixed as of 2026-10-06:**" heading to "**Confirmed; fixed in code 2026-10-06 (commits on main):**" and under item 2 add "Worker code fixed; **`pnpm pics-guard:deploy` still required** (needs Cloudflare login)." Change "**Real but below the bar (Low):**" to "**Low items, all fixed 2026-10-06:**".

- [ ] **Step 4: Push and report**

```bash
git push origin main
```

Final summary must state: every commit hash, that the Worker needs a manual `pnpm pics-guard:deploy`, and that the Vercel deployment should be confirmed green (the repo memory notes a past case where CI passed but the Vercel build failed).

---

## Self-review

- **Coverage:** High → Task 1. Medium → Task 2. Lows: week-2 homework → 3; homework-status → 4; sanitizer → 5; CSV → 6; schedule-refs → 7; draft-division → 8; getPlayerDetailsPublic → 9; thread attach → 10. Enter-scores consistency and the four policy/ops items were rejected by the audit's verifiers and are deliberately out of scope.
- **Placeholders:** none; every step has code and a command.
- **Type consistency:** `evictPreVerificationCredentials` / `markEmailVerified` (Task 1) match between lib, test and `auth.ts`; `normalizePath` (Task 2) matches test and Worker; `requireCaptainInScope` name used in Task 4 code and its strictExpectations; `senderAuthenticated` (Task 10) matches test, lib and thread-detection.
- **Review Focus:** items 1 and 2 pinned in Task 1 Step 1; item 3 in Task 2 Step 1 ("serves a public picture requested with an encoded slash"); item 4 in Task 3 Step 1 (coach negative test); item 5 in Task 7 Step 1 (cross-season all-or-nothing test).
