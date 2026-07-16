"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
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
import { createSeason } from "./actions"

const SEASON_OPTIONS = ["spring", "summer", "fall", "winter"]

const capitalize = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1)

interface CreateSeasonCardProps {
    currentSeasonLabel?: string
    currentPhaseLabel?: string
    currentPhaseIsComplete?: boolean
}

export function CreateSeasonCard({
    currentSeasonLabel,
    currentPhaseLabel,
    currentPhaseIsComplete
}: CreateSeasonCardProps) {
    const router = useRouter()
    const [season, setSeason] = useState("fall")
    const [year, setYear] = useState(String(new Date().getFullYear()))
    const [code, setCode] = useState("")
    const [saving, setSaving] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    const yearNum = Number(year)
    const label = `${capitalize(season)} ${year}`
    const valid =
        season.length > 0 &&
        code.trim().length > 0 &&
        Number.isInteger(yearNum) &&
        yearNum >= 2000 &&
        yearNum <= 2100

    async function handleConfirm() {
        setSaving(true)
        try {
            const result = await createSeason({
                season,
                year: yearNum,
                code: code.trim()
            })
            if (result.status) {
                toast.success(result.message ?? "Season created")
                setConfirmOpen(false)
                setCode("")
                router.refresh()
            } else {
                toast.error(result.message)
            }
        } finally {
            setSaving(false)
        }
    }

    const showIncompleteWarning =
        currentSeasonLabel !== undefined && currentPhaseIsComplete === false

    return (
        <Card>
            <CardHeader>
                <CardTitle>Create New Season</CardTitle>
                <CardDescription>
                    Starts a new season in Off-Season with registration closed.
                    Pricing, ref rates, divisions, and event dates are copied
                    from the current season for you to edit in Season
                    Configuration.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="new-season-name">Season</Label>
                        <Select value={season} onValueChange={setSeason}>
                            <SelectTrigger id="new-season-name">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SEASON_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                        {capitalize(opt)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-season-year">Year</Label>
                        <Input
                            id="new-season-year"
                            type="number"
                            inputMode="numeric"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new-season-code">Code</Label>
                        <Input
                            id="new-season-code"
                            value={code}
                            placeholder="F26"
                            onChange={(e) => setCode(e.target.value)}
                        />
                    </div>
                </div>
                <p className="text-muted-foreground text-sm">
                    New season: <span className="font-medium">{label}</span>
                </p>
                <Button
                    disabled={!valid || saving}
                    onClick={() => setConfirmOpen(true)}
                >
                    Create Season
                </Button>
            </CardContent>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Create {label}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will make <strong>{label}</strong> the current
                            season across the entire site. It starts in
                            Off-Season with registration closed; pricing, dates,
                            and divisions are copied from{" "}
                            {currentSeasonLabel ?? "the current season"} for you
                            to edit in Season Configuration.
                            {showIncompleteWarning ? (
                                <>
                                    {" "}
                                    Note: {currentSeasonLabel} is not marked
                                    Complete
                                    {currentPhaseLabel
                                        ? ` (currently "${currentPhaseLabel}")`
                                        : ""}
                                    .
                                </>
                            ) : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault()
                                handleConfirm()
                            }}
                            disabled={saving}
                        >
                            {saving ? "Creating..." : `Create ${label}`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}
