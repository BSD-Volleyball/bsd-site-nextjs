"use client"

import { useState } from "react"
import { RiCloseLine } from "@remixicon/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PlayerDraftHistory } from "@/app/dashboard/player-lookup/actions"
import { formatHeight } from "./format-height"
import { PlayerImageModal } from "./player-image-modal"
import { DivisionHistoryChart } from "./division-history-chart"

interface SeasonInfo {
    id: number
    year: number
    name: string
}

interface PlayerInfo {
    first_name: string
    last_name: string
    preffered_name: string | null
    pronouns: string | null
    male: boolean | null
    experience: string | null
    assessment: string | null
    height: number | null
    skill_setter: boolean | null
    skill_hitter: boolean | null
    skill_passer: boolean | null
    skill_other: boolean | null
    picture: string | null
}

interface PlayerDetailPopupProps {
    open: boolean
    onClose?: () => void
    playerDetails: PlayerInfo | null
    draftHistory: PlayerDraftHistory[]
    allSeasons: SeasonInfo[]
    playerPicUrl: string
    isLoading: boolean
    pairPickName?: string | null
    pairReason?: string | null
    inline?: boolean
    children?: React.ReactNode
}

export function PlayerDetailPopup({
    open,
    onClose,
    playerDetails,
    draftHistory,
    allSeasons,
    playerPicUrl,
    isLoading,
    pairPickName,
    pairReason,
    inline = false,
    children
}: PlayerDetailPopupProps) {
    const [showImageModal, setShowImageModal] = useState(false)

    if (!open) return null

    const pictureSrc = playerDetails?.picture
        ? `${playerPicUrl}${playerDetails.picture}`
        : null
    const playerAlt = playerDetails
        ? `${playerDetails.first_name} ${playerDetails.last_name}`
        : ""

    const content = (
        <>
            {isLoading && (
                <div className="p-8 text-center text-muted-foreground">
                    Loading player details...
                </div>
            )}

            {playerDetails && !isLoading && (
                <Card className={inline ? "max-w-lg" : "border-0 shadow-none"}>
                    <CardHeader>
                        <div className="flex items-start gap-4">
                            {pictureSrc && (
                                <button
                                    type="button"
                                    onClick={() => setShowImageModal(true)}
                                    className="shrink-0 cursor-pointer transition-opacity hover:opacity-90"
                                >
                                    <img
                                        src={pictureSrc}
                                        alt={playerAlt}
                                        className="h-48 w-32 rounded-md object-cover"
                                    />
                                </button>
                            )}
                            <CardTitle className="pt-1">
                                {playerDetails.first_name}{" "}
                                {playerDetails.last_name}
                                {playerDetails.preffered_name && (
                                    <span className="ml-2 font-normal text-base text-muted-foreground">
                                        ({playerDetails.preffered_name})
                                    </span>
                                )}
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Basic Info */}
                        <div>
                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                Basic Information
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">
                                        Pronouns:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.pronouns || "\u2014"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Gender:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.male === true
                                            ? "Male"
                                            : playerDetails.male === false
                                              ? "Non-Male"
                                              : "\u2014"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Pair Request */}
                        {(pairPickName || pairReason) && (
                            <div>
                                <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                    Pair Request
                                </h3>
                                <div className="grid grid-cols-1 gap-3 text-sm">
                                    {pairPickName && (
                                        <div>
                                            <span className="text-muted-foreground">
                                                Pair Pick:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {pairPickName}
                                            </span>
                                        </div>
                                    )}
                                    {pairReason && (
                                        <div>
                                            <span className="text-muted-foreground">
                                                Reason:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {pairReason}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Volleyball Profile */}
                        <div>
                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                Volleyball Profile
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">
                                        Experience:
                                    </span>
                                    <span className="ml-2 font-medium capitalize">
                                        {playerDetails.experience || "\u2014"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Assessment:
                                    </span>
                                    <span className="ml-2 font-medium capitalize">
                                        {playerDetails.assessment || "\u2014"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Height:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {formatHeight(playerDetails.height)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Skills:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {[
                                            playerDetails.skill_passer &&
                                                "Passer",
                                            playerDetails.skill_setter &&
                                                "Setter",
                                            playerDetails.skill_hitter &&
                                                "Hitter",
                                            playerDetails.skill_other && "Other"
                                        ]
                                            .filter(Boolean)
                                            .join(", ") || "\u2014"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Division History Chart */}
                        <DivisionHistoryChart
                            draftHistory={draftHistory}
                            allSeasons={allSeasons}
                        />

                        {/* Page-specific actions */}
                        {children}
                    </CardContent>
                </Card>
            )}

            {!isLoading && !playerDetails && !inline && (
                <div className="p-8 text-center text-muted-foreground">
                    Failed to load player details.
                </div>
            )}
        </>
    )

    if (inline) {
        return (
            <>
                {content}
                {pictureSrc && (
                    <PlayerImageModal
                        open={showImageModal}
                        onClose={() => setShowImageModal(false)}
                        src={pictureSrc}
                        alt={playerAlt}
                    />
                )}
            </>
        )
    }

    return (
        <>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                onClick={onClose}
                onKeyDown={(e) => {
                    if (e.key === "Escape") onClose?.()
                }}
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
            >
                <div
                    className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-background p-0 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="document"
                >
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <RiCloseLine className="h-5 w-5" />
                    </button>
                    {content}
                </div>
            </div>

            {pictureSrc && (
                <PlayerImageModal
                    open={showImageModal}
                    onClose={() => setShowImageModal(false)}
                    src={pictureSrc}
                    alt={playerAlt}
                />
            )}
        </>
    )
}
