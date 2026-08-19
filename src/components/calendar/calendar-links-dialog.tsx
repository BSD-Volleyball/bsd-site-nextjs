"use client"

import { useState } from "react"
import {
    RiCalendarCheckLine,
    RiDownloadLine,
    RiFileCopyLine,
    RiRssLine
} from "@remixicon/react"
import { toast } from "sonner"
import {
    getCalendarLinks,
    resetCalendarToken
} from "@/app/dashboard/calendar-actions"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { CalendarKind, CalendarLinks } from "@/lib/calendar-links"

/**
 * Fetches a one-off .ics and saves it via a blob: URL so Safari treats it as
 * a file download rather than rendering text/calendar inline.
 */
async function downloadCalendar(kind: CalendarKind): Promise<void> {
    const response = await fetch(
        `/dashboard/season-schedule/calendar?kind=${kind}`
    )
    if (!response.ok) throw new Error("Failed to fetch calendar")
    const text = await response.text()
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const filename =
        response.headers
            .get("Content-Disposition")
            ?.match(/filename="([^"]+)"/)?.[1] ?? `bsd-${kind}.ics`
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

const SECTIONS: Array<{
    kind: CalendarKind
    title: string
    description: string
}> = [
    {
        kind: "personal",
        title: "My schedule",
        description:
            "Your games, reffing, tryouts and volunteer jobs this season."
    },
    {
        kind: "friends",
        title: "Friends' schedule",
        description:
            "Everything above for you and your friends, one event per time slot."
    }
]

function CalendarSection({
    kind,
    title,
    description,
    link
}: {
    kind: CalendarKind
    title: string
    description: string
    link: CalendarLinks[CalendarKind] | null
}) {
    const [downloading, setDownloading] = useState(false)

    async function handleDownload() {
        setDownloading(true)
        try {
            await downloadCalendar(kind)
        } catch {
            toast.error("Couldn't prepare the calendar file. Try again.")
        } finally {
            setDownloading(false)
        }
    }

    async function handleCopy() {
        if (!link) return
        try {
            await navigator.clipboard.writeText(link.url)
            toast.success("Subscription link copied")
        } catch {
            toast.error("Couldn't copy — select the link and copy it manually.")
        }
    }

    return (
        <section className="space-y-2 rounded-md border p-3">
            <div>
                <h3 className="font-medium text-sm">{title}</h3>
                <p className="text-muted-foreground text-xs">{description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={downloading}
                >
                    <RiDownloadLine className="mr-2 h-4 w-4" />
                    {downloading ? "Preparing…" : "Download .ics"}
                </Button>
                {link ? (
                    <Button type="button" variant="outline" size="sm" asChild>
                        <a href={link.webcalUrl}>
                            <RiRssLine className="mr-2 h-4 w-4" />
                            Subscribe
                        </a>
                    </Button>
                ) : (
                    <Button type="button" variant="outline" size="sm" disabled>
                        <RiRssLine className="mr-2 h-4 w-4" />
                        Subscribe
                    </Button>
                )}
            </div>
            <div className="flex gap-2">
                <Input
                    readOnly
                    value={link?.url ?? "Loading…"}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={`${title} subscription link`}
                    className="font-mono text-xs"
                />
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!link}
                >
                    <RiFileCopyLine className="mr-2 h-4 w-4" />
                    Copy
                </Button>
            </div>
        </section>
    )
}

interface CalendarLinksDialogProps {
    triggerLabel?: string
    triggerVariant?: "outline" | "default" | "secondary" | "ghost"
    triggerSize?: "sm" | "default"
}

/**
 * Download or subscribe to the personal and friends calendars. Mounted on
 * Season Schedule, Friends and Account; links are minted lazily on first open.
 */
export function CalendarLinksDialog({
    triggerLabel = "Calendar",
    triggerVariant = "outline",
    triggerSize = "sm"
}: CalendarLinksDialogProps) {
    const [open, setOpen] = useState(false)
    const [links, setLinks] = useState<CalendarLinks | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [resetting, setResetting] = useState(false)

    async function loadLinks() {
        setError(null)
        const result = await getCalendarLinks()
        if (result.status) setLinks(result.data)
        else setError(result.message)
    }

    function handleOpenChange(next: boolean) {
        setOpen(next)
        if (next && !links) void loadLinks()
    }

    async function handleReset() {
        setResetting(true)
        try {
            const result = await resetCalendarToken()
            if (result.status) {
                setLinks(result.data)
                toast.success(result.message ?? "Calendar links reset.")
            } else {
                toast.error(result.message)
            }
        } finally {
            setResetting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant={triggerVariant}
                    size={triggerSize}
                >
                    <RiCalendarCheckLine className="mr-2 h-4 w-4" />
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Add to your calendar</DialogTitle>
                    <DialogDescription>
                        Subscribe for a calendar that updates itself whenever
                        the schedule changes, or download a one-time snapshot.
                        Anyone with a subscription link can see that schedule,
                        so keep it private.
                    </DialogDescription>
                </DialogHeader>

                {error ? (
                    <p className="text-destructive text-sm">{error}</p>
                ) : null}

                <div className="space-y-3">
                    {SECTIONS.map((s) => (
                        <CalendarSection
                            key={s.kind}
                            kind={s.kind}
                            title={s.title}
                            description={s.description}
                            link={links ? links[s.kind] : null}
                        />
                    ))}
                </div>

                <p className="text-muted-foreground text-xs">
                    Google Calendar: Other calendars → “+” → From URL, then
                    paste the link. Apple Calendar and Outlook: click Subscribe.
                </p>

                <DialogFooter className="sm:justify-between">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={!links || resetting}
                            >
                                Reset links
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Reset your calendar links?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    New links will be generated. Anyone using
                                    the old links — including your own calendar
                                    apps — will stop receiving updates until
                                    they subscribe again.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleReset}>
                                    Reset links
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setOpen(false)}
                    >
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
