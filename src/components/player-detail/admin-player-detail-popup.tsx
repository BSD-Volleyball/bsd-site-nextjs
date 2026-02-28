"use client"

import { useState } from "react"
import { RiCloseLine } from "@remixicon/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
    PlayerDetails,
    PlayerDraftHistory,
    PlayerSignup
} from "@/app/dashboard/player-lookup/actions"
import { formatHeight } from "./format-height"
import { PlayerImageModal } from "./player-image-modal"
import { DraftPickChart } from "./draft-pick-chart"
import { PlayerRatingsSection } from "./player-ratings-section"
import {
    getEmptyPlayerRatingAverages,
    type PlayerRatingAverages,
    type PlayerRatingPrivateNote,
    type PlayerRatingSharedNote
} from "@/lib/player-ratings-shared"

interface AdminPlayerDetailPopupProps {
    open: boolean
    onClose?: () => void
    playerDetails: PlayerDetails | null
    draftHistory: PlayerDraftHistory[]
    signupHistory: PlayerSignup[]
    playerPicUrl: string
    isLoading: boolean
    pairPickName?: string | null
    pairReason?: string | null
    ratingAverages?: PlayerRatingAverages
    sharedRatingNotes?: PlayerRatingSharedNote[]
    privateRatingNotes?: PlayerRatingPrivateNote[]
    inline?: boolean
    children?: React.ReactNode
}

function formatSeasonLabel(signup: PlayerSignup) {
    const seasonName =
        signup.seasonName.charAt(0).toUpperCase() + signup.seasonName.slice(1)
    return `${seasonName} ${signup.seasonYear}`
}

export function AdminPlayerDetailPopup({
    open,
    onClose,
    playerDetails,
    draftHistory,
    signupHistory,
    playerPicUrl,
    isLoading,
    pairPickName,
    pairReason,
    ratingAverages = getEmptyPlayerRatingAverages(),
    sharedRatingNotes = [],
    privateRatingNotes = [],
    inline = false,
    children
}: AdminPlayerDetailPopupProps) {
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
                <Card className={inline ? "max-w-2xl" : "border-0 shadow-none"}>
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
                                        className={
                                            inline
                                                ? "h-72 w-48 rounded-md object-cover"
                                                : "h-48 w-32 rounded-md object-cover"
                                        }
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
                                        Old ID:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.old_id || "\u2014"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        User ID:
                                    </span>
                                    <span className="ml-2 font-medium font-mono text-xs">
                                        {playerDetails.id}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Email:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.email}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Email Verified:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.emailVerified
                                            ? "Yes"
                                            : "No"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Phone:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.phone || "\u2014"}
                                    </span>
                                </div>
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
                                <div>
                                    <span className="text-muted-foreground">
                                        Role:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.role || "\u2014"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Captain Eligible:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.captain_eligible
                                            ? "Yes"
                                            : "No"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Emergency Contact */}
                        <div>
                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                Emergency Contact
                            </h3>
                            <p className="text-sm">
                                {playerDetails.emergency_contact || "\u2014"}
                            </p>
                        </div>

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
                                        Self Assessment:
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

                        <PlayerRatingsSection
                            ratingAverages={ratingAverages}
                            sharedRatingNotes={sharedRatingNotes}
                            privateRatingNotes={privateRatingNotes}
                        />

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

                        {/* Account Info */}
                        <div>
                            <h3 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                                Account Information
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">
                                        Onboarding:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {playerDetails.onboarding_completed
                                            ? "Completed"
                                            : "Not completed"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Created:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {new Date(
                                            playerDetails.createdAt
                                        ).toLocaleDateString()}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">
                                        Updated:
                                    </span>
                                    <span className="ml-2 font-medium">
                                        {new Date(
                                            playerDetails.updatedAt
                                        ).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Page-specific actions */}
                        {children}
                    </CardContent>
                </Card>
            )}

            {/* Signup History */}
            {signupHistory.length > 0 && !isLoading && (
                <div className={inline ? "space-y-4" : "space-y-4 px-6 pb-4"}>
                    <h2 className="font-semibold text-lg">
                        Season Signup History
                    </h2>
                    {signupHistory.map((signup) => (
                        <Card
                            key={signup.id}
                            className={inline ? "max-w-2xl" : ""}
                        >
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">
                                    {formatSeasonLabel(signup)}
                                    <span className="ml-2 font-normal text-muted-foreground text-sm">
                                        (ID: {signup.seasonId})
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">
                                            Signup Date:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {new Date(
                                                signup.createdAt
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Amount Paid:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {signup.amountPaid
                                                ? `$${signup.amountPaid}`
                                                : "\u2014"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Age Group:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {signup.age || "\u2014"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Captain Interest:
                                        </span>
                                        <span className="ml-2 font-medium capitalize">
                                            {signup.captain === "yes"
                                                ? "Yes"
                                                : signup.captain ===
                                                    "only_if_needed"
                                                  ? "Only if needed"
                                                  : signup.captain === "no"
                                                    ? "No"
                                                    : "\u2014"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Week 1 Tryouts:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {signup.play1stWeek
                                                ? "Requested"
                                                : "Not requested"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Pair Request:
                                        </span>
                                        <span className="ml-2 font-medium">
                                            {signup.pair ? "Yes" : "No"}
                                        </span>
                                    </div>
                                    {signup.pairPickName && (
                                        <div>
                                            <span className="text-muted-foreground">
                                                Paired With:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {signup.pairPickName}
                                            </span>
                                        </div>
                                    )}
                                    {signup.pairReason && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">
                                                Pair Reason:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {signup.pairReason}
                                            </span>
                                        </div>
                                    )}
                                    {signup.datesMissing && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">
                                                Dates Missing:
                                            </span>
                                            <span className="ml-2 font-medium">
                                                {signup.datesMissing}
                                            </span>
                                        </div>
                                    )}
                                    {signup.orderId && (
                                        <div className="col-span-2">
                                            <span className="text-muted-foreground">
                                                Order ID:
                                            </span>
                                            <span className="ml-2 font-medium font-mono text-xs">
                                                {signup.orderId}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Draft Pick History Chart */}
            {draftHistory.length > 0 && !isLoading && (
                <div className={inline ? "" : "px-6 pb-6"}>
                    <DraftPickChart draftHistory={draftHistory} />
                </div>
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
                <div className="space-y-6">{content}</div>
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
                    className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-0 shadow-xl"
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
