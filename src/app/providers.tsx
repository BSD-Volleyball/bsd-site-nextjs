"use client"

import { AuthUIProvider } from "@daveyplate/better-auth-ui"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import NextTopLoader from "nextjs-toploader"
import { Toaster } from "sonner"
import { authClient } from "@/lib/auth-client"

export function Providers({ children }: { children: ReactNode }) {
    const router = useRouter()

    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            disableTransitionOnChange
        >
            <AuthUIProvider
                authClient={authClient}
                navigate={router.push}
                replace={router.replace}
                redirectTo="/onboarding/account"
                apiKey={true}
                onSessionChange={() => {
                    router.refresh()
                }}
                settings={{
                    url: "/dashboard/account"
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
