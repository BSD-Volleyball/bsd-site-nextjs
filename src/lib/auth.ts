import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server.edge"
import { EmailTemplate } from "@daveyplate/better-auth-ui/server"
import React from "react"
import { db } from "@/database/db"
import * as schema from "@/database/schema"
import { site } from "@/config/site"
import { sendEmail, STREAM_OUTBOUND } from "@/lib/postmark"

const logoBase64 = readFileSync(
    join(process.cwd(), "public", "logo.png")
).toString("base64")

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_BASE_URL,
    session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24 // refresh the session daily
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
            },
            after: async (_user: { id: string }) => {
                // No external contact sync needed with Postmark
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
        sendResetPassword: async ({ user, url }) => {
            const name =
                (user as { first_name?: string }).first_name ||
                user.email.split("@")[0]

            const htmlBody = renderToStaticMarkup(
                EmailTemplate({
                    heading: "Reset your password",
                    content: React.createElement(
                        React.Fragment,
                        null,
                        React.createElement("p", null, `Hi ${name},`),
                        React.createElement(
                            "p",
                            null,
                            "Someone requested a password reset for your account. If this was you, ",
                            "click the button below to reset your password."
                        ),
                        React.createElement(
                            "p",
                            null,
                            "If you didn't request this, you can safely ignore this email."
                        )
                    ),
                    action: "Reset Password",
                    url,
                    siteName: site.name,
                    baseUrl: site.url,
                    imageUrl: `${site.url}/logo.png`
                })
            )

            await sendEmail({
                from: site.mailFrom,
                to: user.email,
                subject: "Reset your password",
                htmlBody,
                stream: STREAM_OUTBOUND,
                tag: "password-reset",
                attachments: [
                    {
                        name: "logo.png",
                        content: logoBase64,
                        contentType: "image/png",
                        contentId: "cid:logo"
                    }
                ]
            })
        }
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
