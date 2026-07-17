"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { withdrawTournamentInterest } from "@/app/dashboard/view-tournament-waitlist/actions"

interface Props {
    tournamentName: string
}

// Lets a player who signed up as a player (but isn't on a roster yet) take
// their name back off the list. Confirms first so an accidental click doesn't
// silently drop them, then refreshes the dashboard so the card returns to its
// "sign up" state.
export function TournamentWithdrawButton({ tournamentName }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)

    async function handleWithdraw() {
        setBusy(true)
        const result = await withdrawTournamentInterest()
        setBusy(false)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success(result.message ?? "Your interest has been withdrawn.")
        setOpen(false)
        router.refresh()
    }

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                Withdraw Interest
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Withdraw from {tournamentName}?
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground text-sm">
                        This takes your name off the list of players looking for
                        a team. You can sign up again later if you change your
                        mind — your accepted waiver stays on file.
                    </p>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={busy}
                        >
                            Never mind
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleWithdraw}
                            disabled={busy}
                        >
                            {busy ? "Withdrawing..." : "Withdraw"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
