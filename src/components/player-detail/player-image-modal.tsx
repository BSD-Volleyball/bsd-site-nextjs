"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { RiCloseLine } from "@remixicon/react"
import {
    Dialog,
    DialogClose,
    DialogOverlay,
    DialogPortal,
    DialogTitle
} from "@/components/ui/dialog"

interface PlayerImageModalProps {
    open: boolean
    onClose: () => void
    src: string
    alt: string
}

export function PlayerImageModal({
    open,
    onClose,
    src,
    alt
}: PlayerImageModalProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose()
            }}
        >
            <DialogPortal>
                <DialogOverlay />
                {/* A bare picture rather than DialogContent's card: the
                    enlarged photo is the whole panel, and a click anywhere on
                    it closes it as before. */}
                <DialogPrimitive.Content
                    aria-describedby={undefined}
                    onClick={onClose}
                    className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                >
                    <DialogTitle className="sr-only">{alt}</DialogTitle>
                    <img
                        src={src}
                        alt={alt}
                        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                    />
                    <DialogClose className="absolute -top-3 -right-3 rounded-full bg-white p-1 text-black hover:bg-gray-200">
                        <RiCloseLine className="h-6 w-6" />
                        <span className="sr-only">Close</span>
                    </DialogClose>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    )
}
