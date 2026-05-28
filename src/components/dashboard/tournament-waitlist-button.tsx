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
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { WaiverContent } from "@/components/waiver-content"
import { expressTournamentInterest } from "@/app/dashboard/view-tournament-waitlist/actions"

interface Props {
    tournamentName: string
    waiver: { id: number; content: string }
}

export function TournamentWaitlistButton({ tournamentName, waiver }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [agreed, setAgreed] = useState(false)
    const [busy, setBusy] = useState(false)

    async function handleSubmit() {
        setBusy(true)
        const result = await expressTournamentInterest(waiver.id, agreed)
        setBusy(false)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success(
            "You're on the waitlist. We'll let you know when a team has space."
        )
        setOpen(false)
        router.refresh()
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                Join Waitlist &amp; Accept Waiver
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            Pre-Register for {tournamentName}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground text-sm">
                        This adds you to the player list so captains looking for
                        roster spots can pick you up, AND records that you've
                        accepted the waiver — so you're cleared to play either
                        way.
                    </p>
                    <WaiverContent content={waiver.content} />
                    <div className="flex items-start gap-2 pt-2">
                        <Checkbox
                            id="t-wl-check"
                            checked={agreed}
                            onCheckedChange={(c) => setAgreed(c === true)}
                        />
                        <Label
                            htmlFor="t-wl-check"
                            className="font-normal text-sm"
                        >
                            I have read and agree to the waiver.
                        </Label>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={busy}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={!agreed || busy}
                        >
                            {busy ? "Joining..." : "Join Waitlist"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
