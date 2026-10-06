"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { useAction } from "@/components/hooks/use-action"
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { createTournament } from "./actions"

interface CreateTournamentCardProps {
    currentTournamentLabel?: string
    currentPhaseLabel?: string
    currentPhaseIsComplete?: boolean
}

export function CreateTournamentCard({
    currentTournamentLabel,
    currentPhaseLabel,
    currentPhaseIsComplete
}: CreateTournamentCardProps) {
    const router = useRouter()
    const id = useId()
    const [name, setName] = useState("")
    const [year, setYear] = useState(String(new Date().getFullYear()))
    const [code, setCode] = useState("")
    const [confirmOpen, setConfirmOpen] = useState(false)
    const { run, pending: saving } = useAction(createTournament, {
        refresh: false,
        onSuccess: () => {
            setConfirmOpen(false)
            setName("")
            setCode("")
            // The new tournament is now the current one, so Tournament
            // Configuration loads it — send the admin there to edit the
            // cloned dates, costs, and divisions.
            router.push("/dashboard/tournament-config")
        }
    })

    const yearNum = Number(year)
    const label = name.trim() ? `${name.trim()} (${year})` : ""
    const valid =
        name.trim().length > 0 &&
        code.trim().length > 0 &&
        Number.isInteger(yearNum) &&
        yearNum >= 2000 &&
        yearNum <= 2100

    const blocked =
        currentTournamentLabel !== undefined && currentPhaseIsComplete === false

    function handleConfirm() {
        void run({
            name: name.trim(),
            year: yearNum,
            code: code.trim()
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Create New Tournament</CardTitle>
                <CardDescription>
                    Starts a new tournament in Registration Open. Dates, costs,
                    format, and divisions are copied from the previous
                    tournament — update them in Tournament Configuration before
                    announcing.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor={`${id}-name`}>Name</Label>
                        <Input
                            id={`${id}-name`}
                            value={name}
                            placeholder="Summer Slam"
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`${id}-year`}>Year</Label>
                        <Input
                            id={`${id}-year`}
                            type="number"
                            inputMode="numeric"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`${id}-code`}>Code</Label>
                        <Input
                            id={`${id}-code`}
                            value={code}
                            placeholder="summer-slam-26"
                            onChange={(e) => setCode(e.target.value)}
                        />
                    </div>
                </div>
                <p className="text-muted-foreground text-sm">
                    The code becomes the public page URL: /tournament/
                    {code.trim().toLowerCase() || "your-code"}
                </p>
                <Button
                    disabled={!valid || saving || blocked}
                    onClick={() => setConfirmOpen(true)}
                >
                    Create Tournament
                </Button>
                {blocked ? (
                    <p className="text-muted-foreground text-sm">
                        {currentTournamentLabel} is still{" "}
                        {currentPhaseLabel
                            ? `in ${currentPhaseLabel}`
                            : "in progress"}
                        . Only one tournament can run at a time — finish it with
                        the phase controls above (or End Tournament Early)
                        before creating a new one.
                    </p>
                ) : null}
            </CardContent>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Create {label}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will make <strong>{label}</strong> the current
                            tournament across the entire site. It starts in
                            Registration Open; dates, costs, format, and
                            divisions are copied from{" "}
                            {currentTournamentLabel ??
                                "the previous tournament"}{" "}
                            for you to edit in Tournament Configuration.
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
