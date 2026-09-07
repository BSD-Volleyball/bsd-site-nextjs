"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    RiAddLine,
    RiCheckDoubleLine,
    RiDeleteBinLine,
    RiEditLine,
    RiExternalLinkLine
} from "@remixicon/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { UserCombobox } from "@/components/user-combobox"
import { SponsorLogoUploader } from "@/components/sponsors/sponsor-logo-uploader"
import {
    type ManageSponsorsData,
    type SponsorshipRow,
    createSponsorLogoUpload,
    createSponsorship,
    deleteSponsorship,
    finalizeSponsorLogoUpload,
    markSponsorshipPaidManually,
    updateSponsor,
    updateSponsorshipAmount
} from "./actions"

interface Props {
    data: ManageSponsorsData
    users: { id: string; name: string }[]
}

function formatDate(date: Date | null) {
    if (!date) return ""
    return new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    })
}

export function SponsorsManager({ data, users }: Props) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)

    // Add form
    const [showAdd, setShowAdd] = useState(false)
    const [mode, setMode] = useState<"existing" | "new">(
        data.sponsors.length > 0 ? "existing" : "new"
    )
    const [existingId, setExistingId] = useState<string>("")
    const [newName, setNewName] = useState("")
    const [newWebsite, setNewWebsite] = useState("")
    const [newBlurb, setNewBlurb] = useState("")
    const [newContact, setNewContact] = useState<string | null>(null)
    const [newAmount, setNewAmount] = useState("")

    // Dialogs
    const [editing, setEditing] = useState<SponsorshipRow | null>(null)
    const [editName, setEditName] = useState("")
    const [editWebsite, setEditWebsite] = useState("")
    const [editBlurb, setEditBlurb] = useState("")
    const [editContact, setEditContact] = useState<string | null>(null)
    const [editAmount, setEditAmount] = useState("")

    const [paying, setPaying] = useState<SponsorshipRow | null>(null)
    const [payNote, setPayNote] = useState("")
    const [payAmount, setPayAmount] = useState("")

    const [deleting, setDeleting] = useState<SponsorshipRow | null>(null)

    // Sponsors not already on this season are the renewal candidates.
    const renewable = useMemo(() => {
        const onSeason = new Set(data.sponsorships.map((s) => s.sponsorId))
        return data.sponsors.filter((s) => !onSeason.has(s.id))
    }, [data.sponsors, data.sponsorships])

    const paidTotal = data.sponsorships
        .filter((s) => s.status === "paid")
        .reduce((sum, s) => sum + Number(s.amountPaid ?? s.amount), 0)
    const pendingTotal = data.sponsorships
        .filter((s) => s.status === "pending")
        .reduce((sum, s) => sum + Number(s.amount), 0)

    async function run(
        action: () => Promise<{ status: boolean; message?: string }>,
        after?: () => void
    ) {
        setBusy(true)
        const result = await action()
        setBusy(false)
        if (result.status) {
            toast.success(result.message ?? "Saved.")
            after?.()
            router.refresh()
        } else {
            toast.error(result.message ?? "Something went wrong.")
        }
    }

    function resetAdd() {
        setShowAdd(false)
        setExistingId("")
        setNewName("")
        setNewWebsite("")
        setNewBlurb("")
        setNewContact(null)
        setNewAmount("")
    }

    function handleAdd() {
        if (!newAmount) {
            toast.error("Enter the sponsorship amount.")
            return
        }
        if (mode === "existing") {
            if (!existingId) {
                toast.error("Choose a sponsor to renew.")
                return
            }
            run(
                () =>
                    createSponsorship({
                        sponsorId: Number(existingId),
                        amount: newAmount
                    }),
                resetAdd
            )
            return
        }
        if (!newName.trim() || !newContact) {
            toast.error("Enter the business name and choose a contact.")
            return
        }
        run(
            () =>
                createSponsorship({
                    newSponsor: {
                        name: newName,
                        website: newWebsite || null,
                        blurb: newBlurb || null
                    },
                    contactUserId: newContact,
                    amount: newAmount
                }),
            resetAdd
        )
    }

    function openEdit(row: SponsorshipRow) {
        setEditing(row)
        setEditName(row.sponsorName)
        setEditWebsite(row.website ?? "")
        setEditBlurb(row.blurb ?? "")
        setEditContact(row.contactUserId)
        setEditAmount(row.amount)
    }

    async function handleSaveEdit() {
        if (!editing || !editContact) return
        setBusy(true)
        const detail = await updateSponsor(editing.sponsorId, {
            name: editName,
            website: editWebsite || null,
            blurb: editBlurb || null,
            contactUserId: editContact
        })
        if (!detail.status) {
            setBusy(false)
            toast.error(detail.message)
            return
        }
        if (editing.status === "pending" && editAmount !== editing.amount) {
            const amt = await updateSponsorshipAmount(
                editing.sponsorshipId,
                editAmount
            )
            if (!amt.status) {
                setBusy(false)
                toast.error(amt.message)
                router.refresh()
                return
            }
        }
        setBusy(false)
        toast.success("Sponsor updated.")
        setEditing(null)
        router.refresh()
    }

    function openPay(row: SponsorshipRow) {
        setPaying(row)
        setPayNote("")
        setPayAmount(row.amount)
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-md bg-muted px-3 py-1.5 font-medium">
                        {data.sponsorships.length} sponsor
                        {data.sponsorships.length !== 1 && "s"}
                    </span>
                    <span className="rounded-md bg-green-100 px-3 py-1.5 font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                        ${paidTotal.toFixed(2)} paid
                    </span>
                    {pendingTotal > 0 && (
                        <span className="rounded-md bg-amber-100 px-3 py-1.5 font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            ${pendingTotal.toFixed(2)} pending
                        </span>
                    )}
                </div>
                <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => setShowAdd((v) => !v)}
                >
                    <RiAddLine className="h-4 w-4" />
                    Add Sponsorship
                </Button>
            </div>

            {showAdd && (
                <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
                    <h3 className="font-medium">
                        New {data.seasonLabel} Sponsorship
                    </h3>
                    <RadioGroup
                        value={mode}
                        onValueChange={(v) => setMode(v as "existing" | "new")}
                        className="flex flex-wrap gap-4"
                    >
                        <div className="flex items-center gap-2">
                            <RadioGroupItem
                                value="existing"
                                id="mode-existing"
                                disabled={renewable.length === 0}
                            />
                            <Label htmlFor="mode-existing">
                                Returning sponsor
                            </Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <RadioGroupItem value="new" id="mode-new" />
                            <Label htmlFor="mode-new">New sponsor</Label>
                        </div>
                    </RadioGroup>

                    {mode === "existing" ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Sponsor</Label>
                                <Select
                                    value={existingId}
                                    onValueChange={setExistingId}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose a sponsor…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {renewable.map((s) => (
                                            <SelectItem
                                                key={s.id}
                                                value={String(s.id)}
                                            >
                                                {s.name} — {s.contactName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="renew-amount">Amount ($)</Label>
                                <Input
                                    id="renew-amount"
                                    inputMode="decimal"
                                    placeholder="500"
                                    value={newAmount}
                                    onChange={(e) =>
                                        setNewAmount(e.target.value)
                                    }
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="new-name">Business name</Label>
                                <Input
                                    id="new-name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Contact (must have an account)</Label>
                                <UserCombobox
                                    users={users}
                                    value={newContact}
                                    onChange={setNewContact}
                                    placeholder="Select the contact…"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="new-website">Website</Label>
                                <Input
                                    id="new-website"
                                    placeholder="https://"
                                    value={newWebsite}
                                    onChange={(e) =>
                                        setNewWebsite(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="new-amount">Amount ($)</Label>
                                <Input
                                    id="new-amount"
                                    inputMode="decimal"
                                    placeholder="500"
                                    value={newAmount}
                                    onChange={(e) =>
                                        setNewAmount(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="new-blurb">
                                    Blurb (shown on the sponsors page)
                                </Label>
                                <Textarea
                                    id="new-blurb"
                                    rows={2}
                                    maxLength={500}
                                    value={newBlurb}
                                    onChange={(e) =>
                                        setNewBlurb(e.target.value)
                                    }
                                />
                            </div>
                        </div>
                    )}
                    <p className="text-muted-foreground text-xs">
                        The contact will be emailed a link to pay by card. The
                        logo can be uploaded after creating, from the edit
                        dialog, or by the sponsor themselves.
                    </p>
                    <div className="flex gap-2">
                        <Button onClick={handleAdd} disabled={busy}>
                            Create & Email Contact
                        </Button>
                        <Button variant="outline" onClick={resetAdd}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Sponsor
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Contact
                            </th>
                            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                                Amount
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Status
                            </th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.sponsorships.map((row) => (
                            <tr
                                key={row.sponsorshipId}
                                className="border-b transition-colors last:border-0 hover:bg-accent/50"
                            >
                                <td className="px-4 py-2">
                                    <div className="flex items-center gap-3">
                                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
                                            {row.logoUrl ? (
                                                <img
                                                    src={row.logoUrl}
                                                    alt=""
                                                    className="max-h-full max-w-full object-contain"
                                                />
                                            ) : (
                                                <span className="text-[10px] text-muted-foreground">
                                                    logo
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-medium">
                                                {row.sponsorName}
                                            </div>
                                            {row.website && (
                                                <a
                                                    href={row.website}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:underline"
                                                >
                                                    {row.website.replace(
                                                        /^https?:\/\//,
                                                        ""
                                                    )}
                                                    <RiExternalLinkLine className="size-3" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-2">
                                    <div>{row.contactName}</div>
                                    <div className="text-muted-foreground text-xs">
                                        {row.contactEmail}
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-right font-medium tabular-nums">
                                    ${row.amount}
                                    {row.status === "paid" &&
                                        row.amountPaid &&
                                        row.amountPaid !== row.amount && (
                                            <div className="text-muted-foreground text-xs">
                                                received ${row.amountPaid}
                                            </div>
                                        )}
                                </td>
                                <td className="px-4 py-2">
                                    {row.status === "paid" ? (
                                        <div className="space-y-0.5">
                                            <Badge className="bg-green-600 hover:bg-green-600">
                                                Paid
                                            </Badge>
                                            <div className="text-muted-foreground text-xs">
                                                {row.paymentMethod === "square"
                                                    ? "Card"
                                                    : "Manual"}
                                                {" · "}
                                                {formatDate(row.paidAt)}
                                                {row.markedPaidByName &&
                                                    ` by ${row.markedPaidByName}`}
                                            </div>
                                            {row.paidNote && (
                                                <div className="text-muted-foreground text-xs italic">
                                                    {row.paidNote}
                                                </div>
                                            )}
                                            {row.receiptUrl && (
                                                <a
                                                    href={row.receiptUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs underline"
                                                >
                                                    Receipt
                                                </a>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-0.5">
                                            <Badge
                                                variant="outline"
                                                className="border-amber-400 text-amber-700 dark:text-amber-300"
                                            >
                                                Pending
                                            </Badge>
                                            <div className="text-muted-foreground text-xs">
                                                Created{" "}
                                                {formatDate(row.createdAt)}
                                            </div>
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-2">
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            title="Edit sponsor"
                                            onClick={() => openEdit(row)}
                                        >
                                            <RiEditLine className="h-4 w-4" />
                                        </Button>
                                        {row.status === "pending" && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 text-green-700"
                                                    title="Mark as paid"
                                                    onClick={() => openPay(row)}
                                                >
                                                    <RiCheckDoubleLine className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                                    title="Delete"
                                                    onClick={() =>
                                                        setDeleting(row)
                                                    }
                                                >
                                                    <RiDeleteBinLine className="h-4 w-4" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {data.sponsorships.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="px-4 py-8 text-center text-muted-foreground"
                                >
                                    No sponsors yet for {data.seasonLabel}.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Edit sponsor */}
            <Dialog
                open={editing !== null}
                onOpenChange={(open) => !open && setEditing(null)}
            >
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit Sponsor</DialogTitle>
                        <DialogDescription>
                            Business details appear on the public sponsors page
                            once the sponsorship is paid.
                        </DialogDescription>
                    </DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <SponsorLogoUploader
                                sponsorId={editing.sponsorId}
                                sponsorName={editing.sponsorName}
                                logoUrl={editing.logoUrl}
                                startUpload={createSponsorLogoUpload}
                                finishUpload={finalizeSponsorLogoUpload}
                                onUploaded={() => router.refresh()}
                                size="sm"
                            />
                            <div className="space-y-2">
                                <Label htmlFor="edit-name">Business name</Label>
                                <Input
                                    id="edit-name"
                                    value={editName}
                                    onChange={(e) =>
                                        setEditName(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-website">Website</Label>
                                <Input
                                    id="edit-website"
                                    value={editWebsite}
                                    onChange={(e) =>
                                        setEditWebsite(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-blurb">Blurb</Label>
                                <Textarea
                                    id="edit-blurb"
                                    rows={3}
                                    maxLength={500}
                                    value={editBlurb}
                                    onChange={(e) =>
                                        setEditBlurb(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Contact</Label>
                                <UserCombobox
                                    users={users}
                                    value={editContact}
                                    onChange={setEditContact}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-amount">
                                    Amount ($)
                                    {editing.status === "paid" &&
                                        " — locked after payment"}
                                </Label>
                                <Input
                                    id="edit-amount"
                                    inputMode="decimal"
                                    value={editAmount}
                                    disabled={editing.status === "paid"}
                                    onChange={(e) =>
                                        setEditAmount(e.target.value)
                                    }
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setEditing(null)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={busy}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Mark paid */}
            <Dialog
                open={paying !== null}
                onOpenChange={(open) => !open && setPaying(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark as Paid</DialogTitle>
                        <DialogDescription>
                            For sponsorships paid by check or invoice outside
                            the site. Other admins will be notified.
                        </DialogDescription>
                    </DialogHeader>
                    {paying && (
                        <div className="space-y-4">
                            <p className="text-sm">
                                <strong>{paying.sponsorName}</strong> owes $
                                {paying.amount}.
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="pay-amount">
                                    Amount received ($)
                                </Label>
                                <Input
                                    id="pay-amount"
                                    inputMode="decimal"
                                    value={payAmount}
                                    onChange={(e) =>
                                        setPayAmount(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pay-note">Note</Label>
                                <Input
                                    id="pay-note"
                                    placeholder='e.g. "check #1042"'
                                    value={payNote}
                                    onChange={(e) => setPayNote(e.target.value)}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setPaying(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={busy}
                            onClick={() =>
                                paying &&
                                run(
                                    () =>
                                        markSponsorshipPaidManually(
                                            paying.sponsorshipId,
                                            {
                                                note: payNote || null,
                                                amountPaid: payAmount
                                            }
                                        ),
                                    () => setPaying(null)
                                )
                            }
                        >
                            Mark Paid
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete */}
            <AlertDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove sponsorship?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes {deleting?.sponsorName}&apos;s{" "}
                            {data.seasonLabel} sponsorship. The business record
                            is kept so it can be renewed later.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() =>
                                deleting &&
                                run(
                                    () =>
                                        deleteSponsorship(
                                            deleting.sponsorshipId
                                        ),
                                    () => setDeleting(null)
                                )
                            }
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
