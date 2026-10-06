"use client"

import { AuthUIProvider } from "@daveyplate/better-auth-ui"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import NextTopLoader from "nextjs-toploader"
import { Toaster } from "sonner"
import { authClient } from "@/lib/auth-client"
import { safeRedirectPath } from "@/lib/safe-redirect"

export function Providers({ children }: { children: ReactNode }) {
    const router = useRouter()
    // better-auth-ui navigates to ?redirectTo= after sign-in without checking
    // it, which made the sign-in page an open redirect to any site.
    const toSafePath = (href: string) =>
        safeRedirectPath(href, window.location.origin)

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <AuthUIProvider
                authClient={authClient}
                navigate={(href) => router.push(toSafePath(href))}
                replace={(href) => router.replace(toSafePath(href))}
                redirectTo="/onboarding/account"
                onSessionChange={() => {
                    router.refresh()
                }}
                account={{
                    basePath: "/dashboard/account"
                }}
                social={{
                    providers: ["google"]
                }}
                additionalFields={{
                    first_name: {
                        label: "First Name",
                        placeholder: "Enter your first name",
                        type: "string",
                        required: true
                    },
                    last_name: {
                        label: "Last Name",
                        placeholder: "Enter your last name",
                        type: "string",
                        required: true
                    }
                }}
                signUp={{
                    fields: ["first_name", "last_name"]
                }}
                Link={Link}
            >
                <NextTopLoader color="var(--primary)" showSpinner={false} />
                {children}
                <Toaster />
            </AuthUIProvider>
        </ThemeProvider>
    )
}
