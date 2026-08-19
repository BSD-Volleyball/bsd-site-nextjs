"use client"

import { useEffect, useState } from "react"
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
import {
    type CalendarDevice,
    type DevicePlan,
    detectCalendarDevice,
    devicePlan,
    deviceSignalsFromNavigator
} from "@/lib/calendar-device"
import {
    CALENDAR_PLATFORM_LABELS,
    type CalendarKind,
    type CalendarLinks,
    platformSubscribeUrl
} from "@/lib/calendar-links"
import { cn } from "@/lib/utils"

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
    link,
    plan
}: {
    kind: CalendarKind
    title: string
    description: string
    link: CalendarLinks[CalendarKind] | null
    plan: DevicePlan
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
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">
                    <RiRssLine className="mr-1 inline h-3.5 w-3.5" />
                    Subscribe in
                </span>
                {plan.order.map((platform, idx) => {
                    const recommended = idx === 0
                    const label = CALENDAR_PLATFORM_LABELS[platform]
                    // No webcal:// handler here (Android, non-Safari iOS):
                    // a dead link is worse than nothing, so Apple becomes a
                    // copy-the-link hint instead.
                    const dead = platform === "apple" && plan.webcalUnsupported
                    if (!link || dead) {
                        return (
                            <Button
                                key={platform}
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled
                                title={
                                    dead
                                        ? "Copy the link below and add it in your calendar app's settings"
                                        : undefined
                                }
                            >
                                {label}
                            </Button>
                        )
                    }
                    return (
                        <Button
                            key={platform}
                            type="button"
                            variant={recommended ? "default" : "outline"}
                            size="sm"
                            asChild
                        >
                            <a
                                href={platformSubscribeUrl(platform, link)}
                                target={
                                    platform === "apple" ? undefined : "_blank"
                                }
                                rel="noreferrer"
                            >
                                {label}
                                {recommended ? (
                                    <span
                                        className={cn(
                                            "ml-1.5 rounded-full px-1.5 py-px text-[10px]",
                                            "bg-primary-foreground/20"
                                        )}
                                    >
                                        for this device
                                    </span>
                                ) : null}
                            </a>
                        </Button>
                    )
                })}
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
                    {downloading ? "Preparing…" : "Download .ics (one-time)"}
                </Button>
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
    // Detect after mount so server and client render the same first paint;
    // the default ("other") plan shows every platform in a neutral order.
    const [device, setDevice] = useState<CalendarDevice>("other")
    useEffect(() => {
        setDevice(detectCalendarDevice(deviceSignalsFromNavigator(navigator)))
    }, [])
    const plan = devicePlan(device)

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
                            plan={plan}
                        />
                    ))}
                </div>

                <p className="text-muted-foreground text-xs">{plan.hint}</p>

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
