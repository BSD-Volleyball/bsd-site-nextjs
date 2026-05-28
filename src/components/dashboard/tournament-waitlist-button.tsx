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
        toast.success("Thanks for signing up to play!")
        setOpen(false)
        router.refresh()
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                Sign Up &amp; Accept Waiver
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            Sign Up as a Player — {tournamentName}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground text-sm">
                        This tells captains you'd like to be added to a team AND
                        records that you've accepted the waiver. Note that this
                        does not place you on a team — a captain still needs to
                        add you to their roster.
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
                            {busy ? "Signing up..." : "Sign Up"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
