"use client"

export function ScoreSheetImageViewer({
    imageUrl,
    onClose
}: {
    imageUrl: string
    onClose: () => void
}) {
    return (
        <div
            role="dialog"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={onClose}
            onKeyDown={(e) => {
                if (e.key === "Escape") onClose()
            }}
        >
            <button
                type="button"
                className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white text-xl hover:bg-white/40"
                onClick={onClose}
            >
                ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageUrl}
                alt="Score sheet full view"
                className="max-h-[90vh] max-w-[90vw] rounded-md object-contain"
            />
        </div>
    )
}
