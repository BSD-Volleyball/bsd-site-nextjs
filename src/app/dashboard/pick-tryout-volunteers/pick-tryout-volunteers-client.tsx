"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { UserEmailCombobox } from "@/components/user-combobox"

import {
    setTryoutVolunteer,
    type PickTryoutVolunteersView,
    type VolunteerCandidate
} from "./actions"

export function PickTryoutVolunteersClient({
    view
}: {
    view: PickTryoutVolunteersView
}) {
    const router = useRouter()
    const [busy, setBusy] = useState(false)
    const [picked, setPicked] = useState<string | null>(null)

    const volunteerCount =
        view.willing.filter((c) => c.isVolunteer).length + view.added.length

    // Anyone already a volunteer is pointless to offer in the "add someone
    // else" picker.
    const currentVolunteerIds = useMemo(
        () =>
            new Set([
                ...view.willing
                    .filter((c) => c.isVolunteer)
                    .map((c) => c.userId),
                ...view.added.map((c) => c.userId)
            ]),
        [view.willing, view.added]
    )
    const addableUsers = useMemo(
        () => view.allUsers.filter((u) => !currentVolunteerIds.has(u.id)),
        [view.allUsers, currentVolunteerIds]
    )

    async function toggle(userId: string, enabled: boolean) {
        setBusy(true)
        const result = await setTryoutVolunteer(userId, enabled)
        setBusy(false)
        if (!result.status) {
            toast.error(result.message)
            return
        }
        toast.success(result.message ?? "Updated.")
        router.refresh()
    }

    function renderRow(candidate: VolunteerCandidate) {
        return (
            <div
                key={candidate.userId}
                className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0"
            >
                <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                        {candidate.name}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                        {candidate.email}
                    </p>
                </div>
                <Switch
                    checked={candidate.isVolunteer}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                        toggle(candidate.userId, checked)
                    }
                    aria-label={`Tryout Volunteer for ${candidate.name}`}
                />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <p className="text-muted-foreground text-sm">
                {volunteerCount} Tryout Volunteer
                {volunteerCount === 1 ? "" : "s"} for {view.seasonLabel}.
            </p>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Offered to help at signup ({view.willing.length})
                    </CardTitle>
                    <p className="text-muted-foreground text-sm">
                        Players who ticked "willing to help run tryouts" on
                        their {view.seasonLabel} signup.
                    </p>
                </CardHeader>
                <CardContent>
                    {view.willing.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            Nobody has offered yet.
                        </p>
                    ) : (
                        view.willing.map(renderRow)
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Add anyone else</CardTitle>
                    <p className="text-muted-foreground text-sm">
                        Search the full membership to add a volunteer who didn't
                        offer at signup.
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-[260px] flex-1">
                            <UserEmailCombobox
                                users={addableUsers}
                                value={picked}
                                onChange={setPicked}
                                disabled={busy}
                                placeholder="Search by name or email..."
                            />
                        </div>
                        <Button
                            type="button"
                            disabled={busy || !picked}
                            onClick={async () => {
                                if (!picked) return
                                await toggle(picked, true)
                                setPicked(null)
                            }}
                        >
                            Make Tryout Volunteer
                        </Button>
                    </div>

                    {view.added.length > 0 && (
                        <div>
                            <p className="mb-2 font-medium text-sm">
                                Added manually ({view.added.length})
                            </p>
                            {view.added.map(renderRow)}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
