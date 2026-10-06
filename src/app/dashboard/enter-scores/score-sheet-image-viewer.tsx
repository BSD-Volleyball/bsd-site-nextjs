"use client"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

export function ScoreSheetImageViewer({
    imageUrl,
    onClose
}: {
    imageUrl: string
    onClose: () => void
}) {
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent
                aria-describedby={undefined}
                className="w-auto max-w-[90vw] border-none bg-transparent p-0 shadow-none sm:rounded-md"
            >
                <DialogTitle className="sr-only">Score sheet</DialogTitle>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={imageUrl}
                    alt="Score sheet full view"
                    className="max-h-[90vh] max-w-[90vw] rounded-md object-contain"
                />
            </DialogContent>
        </Dialog>
    )
}
