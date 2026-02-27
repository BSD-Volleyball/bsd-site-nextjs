"use client"

import { RiCloseLine } from "@remixicon/react"

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
    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
            onClick={onClose}
            onKeyDown={(e) => {
                if (e.key === "Escape") onClose()
            }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
        >
            <div className="relative max-h-[90vh] max-w-[90vw]">
                <img
                    src={src}
                    alt={alt}
                    className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                />
                <button
                    type="button"
                    onClick={onClose}
                    className="-top-3 -right-3 absolute rounded-full bg-white p-1 text-black hover:bg-gray-200"
                >
                    <RiCloseLine className="h-6 w-6" />
                </button>
            </div>
        </div>
    )
}
