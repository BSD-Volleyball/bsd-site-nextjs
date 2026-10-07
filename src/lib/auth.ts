import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { render } from "@react-email/render"
import { EmailTemplate } from "@daveyplate/better-auth-ui/server"
import React from "react"
import { db } from "@/database/db"
import * as schema from "@/database/schema"
import { site } from "@/config/site"
import { sendMail } from "@/lib/email/send"
import { claimOnVerification, markEmailVerified } from "@/lib/auth-verification"

// Read lazily (first account-email send), not at module load: this module
// is imported by every session check, and a filesystem read at import time
// is the one thing here that would not survive a runtime without node:fs.
let logoBase64: string | null = null
function getLogoBase64(): string {
    logoBase64 ??= readFileSync(
        join(process.cwd(), "public", "logo.png")
    ).toString("base64")
    return logoBase64
}

/**
 * Account emails (password reset, email verification). Transactional:
 * deliberately unfiltered, because a wrong bounce record must never be able
 * to lock someone out of their account.
 */
async function sendAuthEmail({
    user,
    url,
    subject,
    heading,
    paragraphs,
    action,
    category,
    tag
}: {
    user: { id: string; email: string; first_name?: string }
    url: string
    subject: string
    heading: string
    paragraphs: string[]
    action: string
    category: string
    tag: string
}) {
    const name = user.first_name || user.email.split("@")[0]

    const htmlBody = await render(
        EmailTemplate({
            heading,
            content: React.createElement(
                React.Fragment,
                null,
                React.createElement("p", null, `Hi ${name},`),
                ...paragraphs.map((text) =>
                    React.createElement("p", { key: text }, text)
                )
            ),
            action,
            url,
            siteName: site.name,
            baseUrl: site.url,
            imageUrl: "cid:logo"
        })
    )

    await sendMail({
        mode: { kind: "transactional", category },
        recipients: [{ userId: user.id, email: user.email }],
        subject,
        htmlBody,
        tag,
        attachments: [
            {
                name: "logo.png",
                content: getLogoBase64(),
                contentType: "image/png",
                contentId: "cid:logo"
            }
        ]
    })
}

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_BASE_URL,
    session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24, // refresh the session daily
        // get-session is polled by every dashboard tab (and installed PWAs
        // overnight); answering from a short-lived signed cookie keeps that
        // polling from waking the Neon compute. Revocation of an active
        // session can lag by up to maxAge; role checks still hit user_roles.
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60
        }
    },
    database: drizzleAdapter(db, {
        provider: "pg",
        usePlural: true,
        schema
    }),
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    let firstName =
                        (user as { first_name?: string }).first_name || ""
                    let lastName =
                        (user as { last_name?: string }).last_name || ""

                    // Fallback: parse from name field (e.g., unmapped social login)
                    if (!firstName && !lastName && user.name) {
                        const parts = user.name.trim().split(/\s+/)
                        firstName = parts[0] || ""
                        lastName = parts.slice(1).join(" ") || ""
                    }

                    const computedName = `${firstName} ${lastName}`.trim()

                    return {
                        data: {
                            ...user,
                            email: user.email.toLowerCase(),
                            first_name: firstName,
                            last_name: lastName,
                            name: computedName || user.name || ""
                        }
                    }
                }
            }
        }
    },
    user: {
        additionalFields: {
            first_name: {
                type: "string",
                required: true,
                fieldName: "first_name"
            },
            last_name: {
                type: "string",
                required: true,
                fieldName: "last_name"
            },
            preferred_name: {
                type: "string",
                required: false,
                fieldName: "preferred_name"
            },
            onboarding_completed: {
                type: "boolean",
                required: false,
                fieldName: "onboarding_completed"
            }
        }
    },
    emailAndPassword: {
        enabled: true,
        disableSignUp: false,
        requireEmailVerification: false,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        autoSignIn: true,
        // Signing in with a new password proves nothing about the inbox, so
        // a reset ends every other session (including one an attacker holds).
        revokeSessionsOnPasswordReset: true,
        // Completing a reset proves the inbox, exactly as a verification link
        // does, so it also verifies the address. This is the recovery path
        // /auth/error offers when Google sign-in meets an unverified account:
        // the reset replaces whatever password was set and ends every other
        // session, so nobody who registered this address first keeps a way in.
        onPasswordReset: async ({ user }) => {
            await markEmailVerified(user.id, user.email)
        },
        sendResetPassword: async ({ user, url }) => {
            await sendAuthEmail({
                user,
                url,
                subject: "Reset your password",
                heading: "Reset your password",
                paragraphs: [
                    "Someone requested a password reset for your account. If this was you, click the button below to reset your password.",
                    "If you didn't request this, you can safely ignore this email."
                ],
                action: "Reset Password",
                category: "password_reset",
                tag: "password-reset"
            })
        }
    },
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
            await claimOnVerification(user.id, session?.user.id ?? null)
        },
        sendVerificationEmail: async ({ user, url }) => {
            await sendAuthEmail({
                user,
                url,
                subject: "Verify your email address",
                heading: "Verify your email address",
                paragraphs: [
                    "Please confirm this is your email address by clicking the button below. Open it in the browser where you signed up to keep your password; from anywhere else you will be asked to set a new one. Once verified you can also sign in with Google.",
                    "If you didn't create an account, you can safely ignore this email."
                ],
                action: "Verify Email",
                category: "email_verification",
                tag: "email-verification"
            })
        }
    },
    onAPIError: {
        errorURL: "/auth/error"
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            mapProfileToUser: (profile) => ({
                email: profile.email.toLowerCase(),
                first_name: profile.given_name || "",
                last_name: profile.family_name || ""
            })
        }
    },
    plugins: []
})
