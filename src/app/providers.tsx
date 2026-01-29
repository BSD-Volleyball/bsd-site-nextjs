"use client"

import { AuthUIProvider } from "@daveyplate/better-auth-ui"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import NextTopLoader from 'nextjs-toploader';
import { Toaster } from "sonner"
import { authClient } from "@/lib/auth-client"
import { useUploadThing } from "@/lib/uploadthing"

export function Providers({ children }: { children: ReactNode }) {
    const router = useRouter()
    const { startUpload } = useUploadThing("avatarUploader")

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
                apiKey={true}
                onSessionChange={() => {
                    router.refresh()
                }}
                settings={{
                    url: "/dashboard/settings"
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
                avatar={{
                    upload: async (file: File) => {
                        const uploadRes = await startUpload([file])
                        if (!uploadRes?.[0]) throw new Error("Upload failed")
                        return uploadRes[0].ufsUrl
                    }
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
