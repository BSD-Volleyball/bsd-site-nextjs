import { RiCalendarLine } from "@remixicon/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { isSeasonRegistrationOpen } from "@/lib/season-phases"
import { RegistrationConfirmation } from "../components/registration-confirmation"
import { SignupCTA } from "../components/signup-cta"
import { TeamAssignmentDisplay } from "../components/team-assignment-display"
import { WaitlistContent } from "../components/waitlist-content"
import { WaitlistInterestPanel } from "../components/waitlist-interest-panel"
import type { SeasonSignupStatus } from "../queries"
import type { PlayerTeamAssignment } from "../roster-data"

// The "<Season> Season" card: what the current phase means for this player
// (sign up, waitlist, tryouts underway, team assignment, season over).

export function SeasonStatusCard({
    signupStatus,
    seasonLabel,
    playerTeamAssignment,
    activeWaiver
}: {
    signupStatus: SeasonSignupStatus
    seasonLabel: string | null
    playerTeamAssignment: PlayerTeamAssignment | null
    activeWaiver: { id: number; content: string } | null
}) {
    const waitlistSeasonId = signupStatus.season?.id ?? null
    const phase = signupStatus.config.phase

    return (
        <Card className="min-w-[280px] flex-1">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <RiCalendarLine className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">
                        {seasonLabel} Season
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                {phase === "off_season" ? (
                    <p className="text-muted-foreground">
                        Check back soon for the next season!
                    </p>
                ) : isSeasonRegistrationOpen(phase) ? (
                    /* Registration phases (through Select Captains):
                       signup confirmation, waitlist, or signup CTA */
                    signupStatus.signup ? (
                        <RegistrationConfirmation signupStatus={signupStatus} />
                    ) : signupStatus.seasonFull && signupStatus.season ? (
                        <WaitlistContent
                            signupStatus={signupStatus}
                            seasonLabel={seasonLabel}
                            waitlistSeasonId={waitlistSeasonId}
                            activeWaiver={activeWaiver}
                        />
                    ) : (
                        <SignupCTA
                            signupStatus={signupStatus}
                            seasonLabel={seasonLabel}
                        />
                    )
                ) : signupStatus.waitlistApproved && phase !== "complete" ? (
                    /* Registration is closed, but an admin has
                       approved this player off the waitlist —
                       give them the signup CTA instead of the
                       phase's "closed" message. (waitlistApproved
                       is only ever set when there's no signup.) */
                    <SignupCTA
                        signupStatus={signupStatus}
                        seasonLabel={seasonLabel}
                        approvedFromWaitlist
                    />
                ) : phase === "prep_tryout_week_1" ||
                  phase === "prep_tryout_week_2" ||
                  phase === "prep_tryout_week_3" ? (
                    signupStatus.signup ? (
                        <RegistrationConfirmation signupStatus={signupStatus} />
                    ) : signupStatus.season ? (
                        <div className="space-y-3">
                            <p className="text-muted-foreground">
                                Registration is closed. Tryouts are underway for
                                the {seasonLabel} season.
                            </p>
                            <WaitlistInterestPanel
                                signupStatus={signupStatus}
                                waitlistSeasonId={waitlistSeasonId}
                                pitch="Interested in joining? There are occasionally drop-outs, injuries, or scheduling conflicts. Express your interest to get on the waitlist."
                                activeWaiver={activeWaiver}
                            />
                        </div>
                    ) : (
                        <p className="text-muted-foreground">
                            Registration is closed. Tryouts are underway for the{" "}
                            {seasonLabel} season.
                        </p>
                    )
                ) : phase === "draft" ? (
                    playerTeamAssignment ? (
                        <TeamAssignmentDisplay
                            assignment={playerTeamAssignment}
                        />
                    ) : (
                        <div className="space-y-2">
                            <p className="font-medium text-sm">
                                Teams are being formed!
                            </p>
                            <p className="text-muted-foreground text-sm">
                                Captains are drafting players onto teams. Check
                                back soon for your team assignment.
                            </p>
                        </div>
                    )
                ) : phase === "regular_season" ? (
                    <div className="space-y-3">
                        <p className="font-medium text-sm">
                            Regular season is underway!
                        </p>
                        <p className="text-muted-foreground text-sm">
                            Check the schedule and standings for the latest
                            results.
                        </p>
                        {playerTeamAssignment ? (
                            <TeamAssignmentDisplay
                                assignment={playerTeamAssignment}
                            />
                        ) : (
                            !signupStatus.signup &&
                            signupStatus.season && (
                                <WaitlistInterestPanel
                                    signupStatus={signupStatus}
                                    waitlistSeasonId={waitlistSeasonId}
                                    pitch="Want to play? Drop-outs, injuries, and scheduling conflicts open spots mid-season. Express your interest to join the waitlist or sub list."
                                    activeWaiver={activeWaiver}
                                />
                            )
                        )}
                    </div>
                ) : phase === "playoffs" ? (
                    <div className="space-y-3">
                        <p className="font-medium text-sm">
                            Playoffs are underway!
                        </p>
                        <p className="text-muted-foreground text-sm">
                            Check the playoff bracket for matchups and results.
                        </p>
                        {playerTeamAssignment ? (
                            <TeamAssignmentDisplay
                                assignment={playerTeamAssignment}
                            />
                        ) : (
                            !signupStatus.signup &&
                            signupStatus.season && (
                                <WaitlistInterestPanel
                                    signupStatus={signupStatus}
                                    waitlistSeasonId={waitlistSeasonId}
                                    pitch="Looking ahead to next season? Express your interest now to be on the waitlist for the next signup window or to sub during playoffs if a spot opens."
                                    activeWaiver={activeWaiver}
                                />
                            )
                        )}
                    </div>
                ) : phase === "complete" ? (
                    <div className="space-y-3">
                        <p className="text-muted-foreground">
                            The {seasonLabel} season is complete. Thanks for
                            playing!
                        </p>
                        {playerTeamAssignment && (
                            <TeamAssignmentDisplay
                                assignment={playerTeamAssignment}
                            />
                        )}
                    </div>
                ) : (
                    <p className="text-muted-foreground">
                        Season information will be available soon.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
