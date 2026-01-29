import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { headers } from "next/headers"
import { Resend } from "resend"
import { EmailTemplate } from "@daveyplate/better-auth-ui/server"
import React from "react"
import { db } from "@/database/db"
import * as schema from "@/database/schema"
import { site } from "@/config/site"

const resend = new Resend(process.env.RESEND_API_KEY)

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        usePlural: true,
        schema
    }),
    user: {
        additionalFields: {
            firstName: {
                type: "string",
                required: true,
                fieldName: "first_name"
            },
            lastName: {
                type: "string",
                required: true,
                fieldName: "last_name"
            }
        }
    },
    emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url, token }, request) => {
            const name =
                (user as { firstName?: string }).firstName ||
                user.email.split("@")[0]

            await resend.emails.send({
                from: site.mailFrom,
                to: user.email,
                subject: "Reset your password",
                react: EmailTemplate({
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
            })
        }
    },
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string
        },
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string
        },
        twitter: {
            clientId: process.env.TWITTER_CLIENT_ID as string,
            clientSecret: process.env.TWITTER_CLIENT_SECRET as string
        }
    },
    plugins: []
})
