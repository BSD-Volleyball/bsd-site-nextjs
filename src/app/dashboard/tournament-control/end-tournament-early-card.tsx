"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { endTournamentEarly } from "./actions"

interface Props {
    tournamentId: number
}

export function EndTournamentEarlyCard({ tournamentId }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    async function handleEndEarly() {
        setLoading(true)
        const result = await endTournamentEarly(tournamentId)
        if (result.status) {
            toast.success(result.data.message)
            router.refresh()
        } else {
            toast.error(result.message)
        }
        setLoading(false)
    }

    return (
        <Card className="border-destructive/50">
            <CardHeader>
                <CardTitle className="text-base text-destructive">
                    End Tournament Early
                </CardTitle>
                <CardDescription>
                    Use this when a tournament must be stopped partway through
                    (for example, bad weather). It marks the tournament complete
                    immediately and records final placements for each division
                    from all pool and playoff results entered so far.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={loading}>
                            {loading ? "Ending..." : "End Tournament Early"}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                End this tournament now?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Final placements will be computed from the
                                results entered so far and the tournament will
                                be marked complete. You can undo this from
                                Tournament Control by reverting, which clears
                                the recorded placements.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleEndEarly}>
                                End Tournament
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    )
}
