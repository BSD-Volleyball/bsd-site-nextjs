"use client"

import { useId, useState } from "react"
import { useAction } from "@/components/hooks/use-action"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { acceptTournamentWaiver } from "@/app/dashboard/tournament-team/actions"

interface Props {
    tournamentName: string
    waiver: { id: number; content: string }
}

export function TournamentWaiverCard({ tournamentName, waiver }: Props) {
    const agreeId = useId()
    const [open, setOpen] = useState(false)
    const [agreed, setAgreed] = useState(false)
    const { run, pending: busy } = useAction(acceptTournamentWaiver, {
        success: "Waiver accepted. You're cleared to play.",
        onSuccess: () => setOpen(false)
    })

    function handleAccept() {
        void run(waiver.id)
    }

    return (
        <Card className="min-w-[280px] flex-1 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
            <CardHeader>
                <CardTitle className="text-base">Tournament Waiver</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <p>
                    Your captain has added you to a team for{" "}
                    <strong>{tournamentName}</strong>. You must accept the
                    waiver before tournament day.
                </p>
                <Button onClick={() => setOpen(true)}>
                    Review &amp; Accept
                </Button>
            </CardContent>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Tournament Waiver</DialogTitle>
                    </DialogHeader>
                    <WaiverContent content={waiver.content} />
                    <div className="flex items-start gap-2 pt-2">
                        <Checkbox
                            id={agreeId}
                            checked={agreed}
                            onCheckedChange={(c) => setAgreed(c === true)}
                        />
                        <Label
                            htmlFor={agreeId}
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
                            onClick={handleAccept}
                            disabled={!agreed || busy}
                        >
                            {busy ? "Saving..." : "Accept"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
