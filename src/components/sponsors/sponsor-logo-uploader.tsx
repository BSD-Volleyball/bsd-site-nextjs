"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import type { ActionResult } from "@/lib/action-result"
import { SPONSOR_LOGO_ACCEPT, SPONSOR_LOGO_MAX_BYTES } from "@/lib/sponsor-logo"

interface Props {
    sponsorId: number
    logoUrl: string | null
    sponsorName: string
    /** Issues the presigned URL — the admin or sponsor-contact action. */
    startUpload: (
        sponsorId: number,
        contentType: string,
        contentLength: number
    ) => Promise<ActionResult<{ uploadUrl: string; filename: string }>>
    /** Records the uploaded object on the sponsor. */
    finishUpload: (
        sponsorId: number,
        filename: string
    ) => Promise<ActionResult<{ logoPath: string; logoUrl: string | null }>>
    onUploaded?: (logoUrl: string | null) => void
    size?: "sm" | "md"
}

/**
 * Two-step presigned upload shared by Manage Sponsors and the sponsor's own
 * page. Logos are uploaded as-is (no JPEG recompression) so PNG and SVG
 * transparency survives for the t-shirt printer.
 */
export function SponsorLogoUploader({
    sponsorId,
    logoUrl,
    sponsorName,
    startUpload,
    finishUpload,
    onUploaded,
    size = "md"
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)
    const [preview, setPreview] = useState<string | null>(logoUrl)

    async function handleFile(file: File | undefined) {
        if (!file) return
        if (file.size > SPONSOR_LOGO_MAX_BYTES) {
            toast.error("Logo must be 2 MB or smaller.")
            return
        }
        setBusy(true)
        try {
            const start = await startUpload(sponsorId, file.type, file.size)
            if (!start.status) {
                toast.error(start.message)
                return
            }
            const put = await fetch(start.data.uploadUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": file.type,
                    "Content-Length": String(file.size)
                },
                body: file
            })
            if (!put.ok) {
                toast.error("Upload to storage failed. Please try again.")
                return
            }
            const done = await finishUpload(sponsorId, start.data.filename)
            if (!done.status) {
                toast.error(done.message)
                return
            }
            setPreview(done.data.logoUrl)
            onUploaded?.(done.data.logoUrl)
            toast.success("Logo uploaded.")
        } finally {
            setBusy(false)
            if (inputRef.current) inputRef.current.value = ""
        }
    }

    const box = size === "sm" ? "size-16" : "size-28"

    return (
        <div className="flex items-center gap-4">
            <div
                className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white p-1`}
            >
                {preview ? (
                    // Plain img: logos may be SVG, which next/image won't optimise.
                    <img
                        src={preview}
                        alt={`${sponsorName} logo`}
                        className="max-h-full max-w-full object-contain"
                    />
                ) : (
                    <span className="text-center text-muted-foreground text-xs">
                        No logo
                    </span>
                )}
            </div>
            <div className="space-y-1">
                <input
                    ref={inputRef}
                    type="file"
                    accept={SPONSOR_LOGO_ACCEPT}
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                >
                    {busy
                        ? "Uploading…"
                        : preview
                          ? "Replace logo"
                          : "Upload logo"}
                </Button>
                <p className="text-muted-foreground text-xs">
                    PNG, JPEG, SVG, or WebP, up to 2 MB. Transparent PNG or SVG
                    works best on the shirt.
                </p>
            </div>
        </div>
    )
}
