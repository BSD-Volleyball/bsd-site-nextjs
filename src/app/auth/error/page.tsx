import Link from "next/link"
import type { Metadata } from "next"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { SendVerificationForm } from "./send-verification-form"

export const metadata: Metadata = {
    title: "Sign-in problem"
}

// better-auth redirects OAuth failures here (onAPIError.errorURL in
// src/lib/auth.ts) with a machine-readable ?error= code.
export default async function AuthErrorPage({
    searchParams
}: {
    searchParams: Promise<{ error?: string }>
}) {
    const { error } = await searchParams
    const notLinked = error === "account_not_linked"

    return (
        <main className="container mx-auto flex grow flex-col items-center justify-center gap-4 self-center bg-background px-4 py-18 sm:py-22">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>
                        {notLinked
                            ? "Verify your email to use Google sign-in"
                            : "We couldn't sign you in"}
                    </CardTitle>
                    <CardDescription>
                        {notLinked
                            ? "An account with this email already exists, but its email address hasn't been verified yet. For your security, Google sign-in can only be connected to a verified account."
                            : "Something went wrong while signing you in. Please try again."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                            <Button
                                asChild
                                variant="secondary"
                                className="w-full"
                            >
                                <Link href="/auth/forgot-password">
                                    Reset password
                                </Link>
                            </Button>
                        </>
                    )}
                    <Button asChild variant="outline" className="w-full">
                        <Link href="/auth/sign-in">Back to sign in</Link>
                    </Button>
                </CardContent>
            </Card>
        </main>
    )
}
