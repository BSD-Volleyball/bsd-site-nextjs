"use client"

import { RedirectToSignIn, SignedIn } from "@daveyplate/better-auth-ui"
import { usePathname } from "next/navigation"

export default function OnboardingLayout({
    children
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()

    // Determine current step from pathname
    const step = pathname.includes("volleyball-profile") ? 2 : 1

    return (
        <>
            <RedirectToSignIn />
            <SignedIn>
                <main className="container mx-auto flex min-h-screen flex-col items-center justify-center py-12">
                    {/* Progress indicator */}
                    <div className="mb-8 flex items-center gap-2">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                                1
                            </div>
                            <span className="text-sm font-medium">Account</span>
                        </div>
                        <div className={`h-0.5 w-8 ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
                        <div className="flex items-center gap-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                2
                            </div>
                            <span className={`text-sm font-medium ${step >= 2 ? "" : "text-muted-foreground"}`}>Volleyball</span>
                        </div>
                    </div>
                    <div className="w-full max-w-2xl">{children}</div>
                </main>
            </SignedIn>
        </>
    )
}
