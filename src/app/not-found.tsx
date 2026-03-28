import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
    return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="space-y-2">
                <p className="font-bold text-6xl text-primary">404</p>
                <h1 className="font-bold text-2xl">Page Not Found</h1>
                <p className="max-w-md text-muted-foreground">
                    The page you&apos;re looking for doesn&apos;t exist or has
                    been moved.
                </p>
            </div>
            <div className="flex gap-3">
                <Button asChild>
                    <Link href="/">Go Home</Link>
                </Button>
                <Button asChild variant="outline">
                    <Link href="/dashboard">Dashboard</Link>
                </Button>
            </div>
        </div>
    )
}
