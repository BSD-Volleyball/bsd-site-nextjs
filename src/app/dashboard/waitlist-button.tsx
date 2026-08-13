"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { WaiverContent } from "@/components/waiver-content"
import { expressWaitlistInterest } from "./roster-actions"

interface WaitlistButtonProps {
    seasonId: number
    activeWaiver: { id: number; content: string } | null
}

export function WaitlistButton({
    seasonId,
    activeWaiver
}: WaitlistButtonProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [waiverAgreed, setWaiverAgreed] = useState(false)

    // Never carry a checked box across openings — each visit to the dialog has
    // to be its own affirmative acceptance.
    const handleOpenChange = (next: boolean) => {
        setOpen(next)
        if (!next) setWaiverAgreed(false)
    }

    const handleSubmit = async () => {
        if (!activeWaiver) return
        setIsLoading(true)

        const result = await expressWaitlistInterest(
            seasonId,
            activeWaiver.id,
            waiverAgreed
        )
        setIsLoading(false)

        if (!result.status) {
            toast.error(result.message)
            return
        }

        toast.success(result.message)
        handleOpenChange(false)
        router.refresh()
    }

    if (!activeWaiver) {
        return (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 text-sm dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                No active waiver is currently published. Please contact an
                administrator before joining the waitlist.
            </div>
        )
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>Express Interest</Button>
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Liability and Conduct Waiver</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground text-sm">
                        Before we add you to the waitlist, please read and
                        accept the waiver below.
                    </p>
                    <WaiverContent content={activeWaiver.content} />
                    <div className="flex items-start gap-2 pt-2">
                        <Checkbox
                            id={`waitlist-waiver-agree-${seasonId}`}
                            checked={waiverAgreed}
                            onCheckedChange={(
                                checked: boolean | "indeterminate"
                            ) => setWaiverAgreed(checked === true)}
                        />
                        <Label
                            htmlFor={`waitlist-waiver-agree-${seasonId}`}
                            className="cursor-pointer font-normal text-sm"
                        >
                            I have read and agree to the waiver.
                        </Label>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isLoading || !waiverAgreed}
                        >
                            {isLoading ? "Submitting..." : "Express Interest"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
