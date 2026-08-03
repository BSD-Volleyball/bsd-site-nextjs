"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { WaiverContent } from "@/components/waiver-content"
import { expressWaitlistInterest } from "../roster-actions"

interface SubListOfferProps {
    seasonId: number
    activeWaiver: { id: number; content: string } | null
}

/**
 * Alternative offered alongside the schedule-tab availability warnings: join
 * the sub list (the waitlist) instead of committing to a full season. Rendered
 * once below whichever warnings fired, so the waiver never repeats.
 */
export function SubListOffer({ seasonId, activeWaiver }: SubListOfferProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [waiverAgreed, setWaiverAgreed] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Without a published waiver there is no way to capture consent. The
    // waivers tab already tells the player to contact an administrator.
    if (!activeWaiver) return null

    const handleJoin = async () => {
        setIsSubmitting(true)

        const result = await expressWaitlistInterest(
            seasonId,
            activeWaiver.id,
            waiverAgreed
        )

        if (result.status) {
            toast.success(result.message)
            router.push("/dashboard")
            router.refresh()
        } else {
            toast.error(result.message)
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
            <h4 className="font-medium text-sm">Prefer to sub instead?</h4>
            <p className="text-muted-foreground text-sm">
                Join the sub list and we&apos;ll contact you when teams need
                players for a night. No season fee, no commitment.
            </p>
            <Button
                variant="outline"
                onClick={() => setOpen(true)}
                className="mt-1"
            >
                Join the Sub List
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Join the Sub List</DialogTitle>
                        <DialogDescription>
                            You won&apos;t be signed up for the season or
                            charged. We&apos;ll reach out when a team needs a
                            player.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <h3 className="font-medium text-base">
                            Liability and Conduct Waiver
                        </h3>
                        <WaiverContent content={activeWaiver.content} />
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="sub-list-waiver-agree"
                                checked={waiverAgreed}
                                onCheckedChange={(
                                    checked: boolean | "indeterminate"
                                ) => setWaiverAgreed(checked === true)}
                            />
                            <Label
                                htmlFor="sub-list-waiver-agree"
                                className="cursor-pointer font-medium"
                            >
                                I Agree
                            </Label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleJoin}
                            disabled={!waiverAgreed || isSubmitting}
                        >
                            {isSubmitting
                                ? "Submitting..."
                                : "Join the Sub List"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
