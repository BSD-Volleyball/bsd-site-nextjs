"use client"

import { formatHeight } from "@/components/player-detail"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    getDisplayName,
    getGenderLabel,
    getOldIdLabel
} from "./rate-player-helpers"
import { SkillSlider } from "./skill-slider"
import type { RatePlayerDialogController } from "./use-rate-player-dialog"

interface RatePlayerDialogProps {
    controller: RatePlayerDialogController
    playerPicUrl: string
}

export function RatePlayerDialog({
    controller,
    playerPicUrl
}: RatePlayerDialogProps) {
    const {
        selectedPlayer,
        isDialogOpen,
        setIsDialogOpen,
        overall,
        passing,
        setting,
        hitting,
        serving,
        blocking,
        sharedNotes,
        setSharedNotes,
        privateNotes,
        setPrivateNotes,
        isSaving,
        closeDialog,
        handleSkillChange,
        handleSaveAll
    } = controller

    return (
        <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
                if (!open) {
                    closeDialog()
                    return
                }

                setIsDialogOpen(true)
            }}
        >
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Rate Player</DialogTitle>
                    <DialogDescription>
                        Ratings and notes are unique to your account.
                    </DialogDescription>
                </DialogHeader>

                {selectedPlayer && (
                    <div className="space-y-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            {playerPicUrl && selectedPlayer.picture ? (
                                <img
                                    src={`${playerPicUrl}${selectedPlayer.picture}`}
                                    alt={getDisplayName(selectedPlayer)}
                                    className="h-40 w-28 rounded-md object-cover"
                                />
                            ) : (
                                <div className="flex h-40 w-28 items-center justify-center rounded-md border bg-muted text-muted-foreground text-sm">
                                    No picture
                                </div>
                            )}

                            <div className="space-y-1">
                                <p className="font-bold text-3xl leading-tight">
                                    {getOldIdLabel(selectedPlayer)} -{" "}
                                    {getDisplayName(selectedPlayer)}
                                </p>
                                <p className="text-muted-foreground text-sm">
                                    {getGenderLabel(selectedPlayer.male)} •{" "}
                                    {formatHeight(selectedPlayer.height)}
                                </p>
                            </div>
                        </div>

                        <section className="space-y-4 rounded-md border p-4">
                            <h3 className="font-semibold text-lg">
                                Shared with other captains
                            </h3>

                            <SkillSlider
                                label="Overall"
                                value={overall}
                                disabled={false}
                                onChange={(value) =>
                                    handleSkillChange("overall", value)
                                }
                            />
                            <div className="border-t" />
                            <SkillSlider
                                label="Passing"
                                value={passing}
                                disabled={false}
                                onChange={(value) =>
                                    handleSkillChange("passing", value)
                                }
                            />
                            <SkillSlider
                                label="Setting"
                                value={setting}
                                disabled={false}
                                onChange={(value) =>
                                    handleSkillChange("setting", value)
                                }
                            />
                            <SkillSlider
                                label="Hitting"
                                value={hitting}
                                disabled={false}
                                onChange={(value) =>
                                    handleSkillChange("hitting", value)
                                }
                            />
                            <SkillSlider
                                label="Serving"
                                value={serving}
                                disabled={false}
                                onChange={(value) =>
                                    handleSkillChange("serving", value)
                                }
                            />
                            <SkillSlider
                                label="Blocking"
                                value={blocking}
                                disabled={false}
                                onChange={(value) =>
                                    handleSkillChange("blocking", value)
                                }
                            />

                            {isSaving && (
                                <p className="text-muted-foreground text-sm">
                                    Saving ratings...
                                </p>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="shared_notes">
                                    Shared notes
                                </Label>
                                <Textarea
                                    id="shared_notes"
                                    value={sharedNotes}
                                    onChange={(event) =>
                                        setSharedNotes(event.target.value)
                                    }
                                    placeholder="Visible to other captains."
                                />
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleSaveAll}
                                        disabled={isSaving}
                                    >
                                        {isSaving
                                            ? "Saving..."
                                            : "Save All Ratings"}
                                    </Button>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 rounded-md border p-4">
                            <h3 className="font-semibold text-lg">
                                Private notes
                            </h3>

                            <div className="space-y-2">
                                <Label htmlFor="private_notes">
                                    Private notes
                                </Label>
                                <Textarea
                                    id="private_notes"
                                    value={privateNotes}
                                    onChange={(event) =>
                                        setPrivateNotes(event.target.value)
                                    }
                                    placeholder="Visible only to you."
                                />
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleSaveAll}
                                        disabled={isSaving}
                                    >
                                        {isSaving
                                            ? "Saving..."
                                            : "Save All Ratings"}
                                    </Button>
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
