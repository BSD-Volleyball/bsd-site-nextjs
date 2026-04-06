"use client"

import { SignedIn, SignedOut } from "@daveyplate/better-auth-ui"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export function NavDesktopAuthButtons() {
    return (
        <>
            <SignedOut>
                <Button asChild size="sm" variant="outline" className="ml-2">
                    <Link href="/auth/sign-in?redirectTo=/dashboard">
                        Sign In
                    </Link>
                </Button>
                <Button
                    asChild
                    size="sm"
                    className="bg-primary hover:bg-primary/90"
                >
                    <Link href="/auth/sign-up?redirectTo=/dashboard">
                        Register
                    </Link>
                </Button>
            </SignedOut>
            <SignedIn>
                <Button asChild size="sm" variant="outline" className="ml-2">
                    <Link href="/dashboard">Dashboard</Link>
                </Button>
            </SignedIn>
        </>
    )
}

export function NavMobileAuthButtons({
    onNavigate
}: {
    onNavigate: () => void
}) {
    return (
        <>
            <SignedOut>
                <Button
                    asChild
                    variant="outline"
                    className="w-full"
                    onClick={onNavigate}
                >
                    <Link href="/auth/sign-in?redirectTo=/dashboard">
                        Sign In
                    </Link>
                </Button>
                <Button
                    asChild
                    className="w-full bg-primary hover:bg-primary/90"
                    onClick={onNavigate}
                >
                    <Link href="/auth/sign-up?redirectTo=/dashboard">
                        Register
                    </Link>
                </Button>
            </SignedOut>
            <SignedIn>
                <Button
                    asChild
                    variant="outline"
                    className="w-full"
                    onClick={onNavigate}
                >
                    <Link href="/dashboard">Dashboard</Link>
                </Button>
            </SignedIn>
        </>
    )
}
