export function InterruptionsSection() {
    return (
        <section id="interruptions" className="mb-12 scroll-mt-24">
            <h2 className="mb-4 font-semibold text-2xl">
                12. Interruptions, Delays and Intervals
            </h2>

            <div className="space-y-6 text-muted-foreground leading-relaxed">
                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.1 Interruptions
                    </h3>
                    <p>
                        An interruption is the time between one completed rally
                        and the referee&apos;s whistle for the next service. The
                        only regular game interruptions are TIME-OUTS and
                        SUBSTITUTIONS.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.2 Number of Regular Game Interruptions
                    </h3>
                    <p>
                        Each team may request a maximum of two time-outs per
                        game.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.3 Sequence of Regular Game Interruptions
                    </h3>
                    <p>
                        Request for one or two time-outs may follow one another,
                        within the same interruption.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.4 Request for Regular Game Interruptions
                    </h3>
                    <p>
                        Regular game interruptions may only be requested by the
                        game captain. A time-out before the start of a game is
                        permitted.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.5 Time-Outs
                    </h3>
                    <p>
                        Time-out requests must be made by showing the
                        corresponding hand signal, when the ball is out of play
                        and before the whistle for service. All requested
                        time-outs are limited to 30 seconds; if both teams
                        indicate readiness earlier, the referee may signal the
                        end of the timeout sooner. The players may remain on the
                        court or go to the free zone near their team bench.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.6 Injury
                    </h3>
                    <p>
                        When there is an injury to a player in play the
                        following protocol will be followed. The referee will
                        wait 30 seconds to see how the player is. If the player
                        is still not recovered after 30 seconds, the referee
                        will call a 3 minute time out to assess the magnitude of
                        the injury. If after 3 minutes, the team is unable to
                        determine the status of the injured player then they may
                        use their remaining 30 second time outs. If an injured
                        player is unable to continue to play then as much time
                        is needed to safely remove the player from the playing
                        area is taken. An injured player may return for a
                        following game if able to do so.
                    </p>
                    <p className="mt-2">
                        After the loss of a player to injury, a team may either
                        substitute a player who is currently rotated out or may
                        rotate to fill the empty spot.
                    </p>
                    <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/30">
                        <p className="font-medium text-amber-900 dark:text-amber-100">
                            BSD-Specific Rule
                        </p>
                        <p className="text-amber-800 dark:text-amber-200">
                            The option to rotate to fill the empty spot after
                            injury (rather than only substituting) is specific
                            to BSD. If the team is left with fewer than 5
                            players able to play, they may request an
                            &ldquo;exceptional sub&rdquo;, requiring approval of
                            all captains at the facility and the division
                            commissioner.
                        </p>
                    </div>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.7 Line Up Checks
                    </h3>
                    <p>
                        A line-up check is not considered a regular game
                        interruption and is permitted prior to reauthorizing the
                        serve for a rally that was not completed. A line-up
                        check may not be requested at any point after the
                        service authorization, even if the referee must
                        authorize the serve a second time due to external
                        interference (i.e., a ball on the court, for example).
                        Only captains may request a line-up check.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.8 Substitution for Expulsion or Disqualification
                    </h3>
                    <p>
                        An EXPELLED or DISQUALIFIED player must leave the game
                        immediately. If there are more than 6 players on the
                        team than the team will rotate to the open position; the
                        lineup stays the same.
                    </p>
                    <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/30">
                        <p className="font-medium text-amber-900 dark:text-amber-100">
                            BSD-Specific Rule
                        </p>
                        <p className="text-amber-800 dark:text-amber-200">
                            The rotation-to-open-position approach for
                            expulsion/disqualification is specific to BSD. If
                            the expulsion will cause the team to play with a
                            hole, then a substitute shall attempt to be found as
                            long as it does not cause an undue delay.
                        </p>
                    </div>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        12.9 Improper Requests
                    </h3>
                    <p>
                        It is improper to request any regular game interruption:
                        during a rally or at the moment of, or after the whistle
                        to serve, by a nonauthorized team member, after having
                        exhausted the authorized number of time-outs. The first
                        improper request by a team in the match that does not
                        affect or delay the game shall be rejected. Any further
                        improper request in the match by the same team
                        constitutes a delay.
                    </p>
                </div>
            </div>
        </section>
    )
}
