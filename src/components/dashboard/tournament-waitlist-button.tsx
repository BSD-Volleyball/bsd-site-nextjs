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
    // tournament_divisions rows the player can pick as a preferred division.
    // Optional preference — empty selection sends null.
    divisions: { id: number; name: string }[]
}

export function TournamentWaitlistButton({
    tournamentName,
    waiver,
    divisions
}: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [agreed, setAgreed] = useState(false)
    const [preferredDivisionId, setPreferredDivisionId] = useState<number>(0)
    const [busy, setBusy] = useState(false)

    async function handleSubmit() {
        setBusy(true)
        const result = await expressTournamentInterest(
            waiver.id,
            agreed,
            preferredDivisionId > 0 ? preferredDivisionId : null
        )
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

                    {divisions.length > 0 && (
                        <div className="space-y-2 pt-2">
                            <Label
                                htmlFor="t-wl-div"
                                className="font-medium text-sm"
                            >
                                Preferred Division{" "}
                                <span className="font-normal text-muted-foreground text-xs">
                                    (optional)
                                </span>
                            </Label>
                            <select
                                id="t-wl-div"
                                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                                value={preferredDivisionId}
                                onChange={(e) =>
                                    setPreferredDivisionId(
                                        Number(e.target.value)
                                    )
                                }
                            >
                                <option value={0}>No preference</option>
                                {divisions.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-muted-foreground text-xs">
                                We'll share this with admins as a hint when
                                placing you on a team.
                            </p>
                        </div>
                    )}

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
