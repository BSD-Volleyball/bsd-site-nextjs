import Link from "next/link"
import { Button } from "@/components/ui/button"

// Segment-level not-found so a bad tournament code keeps the marketing
// chrome instead of falling back to the bare root 404.
export default function TournamentNotFound() {
    return (
        <div className="container mx-auto flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
            <div className="space-y-2">
                <p className="font-bold text-6xl text-primary">404</p>
                <h1 className="font-bold text-2xl">Tournament Not Found</h1>
                <p className="max-w-md text-muted-foreground">
                    We couldn&apos;t find a tournament with that code. It may
                    have ended or the link may be out of date.
                </p>
            </div>
            <Button asChild>
                <Link href="/">Go Home</Link>
            </Button>
        </div>
    )
}
