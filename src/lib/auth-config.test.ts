import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// OAuth pre-account hijacking: someone registers a victim's address with a
// password, the victim later signs in with Google, and Google links into the
// attacker's account. better-auth >= 1.6.11 refuses to link into a user
// whose local email is unverified (account.accountLinking
// .requireLocalEmailVerified, default true). These tests keep a downgrade or
// a config change from quietly reopening that hole.

const authSource = readFileSync(join(__dirname, "auth.ts"), "utf8")

function installedBetterAuthVersion(): number[] {
    // The package's exports map hides package.json from require().
    const pkg = JSON.parse(
        readFileSync(
            join(process.cwd(), "node_modules/better-auth/package.json"),
            "utf8"
        )
    ) as { version: string }
    return pkg.version.split(/[.-]/).slice(0, 3).map(Number)
}

describe("better-auth account linking", () => {
    it("runs a better-auth with the verified-only linking gate", () => {
        const [major, minor, patch] = installedBetterAuthVersion()
        const atLeast = (m: number, n: number, p: number) =>
            major > m ||
            (major === m && (minor > n || (minor === n && patch >= p)))
        expect(atLeast(1, 6, 11)).toBe(true)
    })

    it("does not switch the gate off or trust Google unconditionally", () => {
        expect(authSource).not.toMatch(/requireLocalEmailVerified\s*:\s*false/)
        expect(authSource).not.toMatch(/trustedProviders/)
    })

    it("can send the verification email the gate depends on", () => {
        expect(authSource).toMatch(/sendVerificationEmail\s*:/)
        expect(authSource).toMatch(/revokeSessionsOnPasswordReset\s*:\s*true/)
    })

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
})
