export function TeamFormatsSection() {
    return (
        <section id="team-formats" className="mb-12 scroll-mt-24">
            <h2 className="mb-4 font-semibold text-2xl">6. Team Formats</h2>

            <div className="space-y-6">
                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        6.1 Team Starting Line-Up
                    </h3>
                    <p>
                        If a referee believes there are changes in a line up
                        being made due to the lineup of the other team, he/she
                        has the right to request written lineups from both teams
                        prior to the start of a game.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        6.2 Positions
                    </h3>
                    <p>
                        At the moment the ball is hit by the server, each team
                        must be positioned within its own court in the
                        rotational order (except the server). The positions of
                        the players are numbered as follows: The three players
                        along the net are front-row players and occupy positions
                        4 (front-left), 3 (front-center) and 2 (front-right);
                        the other three are back-row players occupying positions
                        5 (back-left), 6 (back-center) and 1 (back-right).
                    </p>
                    <p className="mt-2">
                        <u>Relative positions between players</u>: Each back-row
                        player must be positioned further back from the net than
                        the corresponding front-row player; the front-row
                        players and the back-row players, respectively, must be
                        positioned laterally so that the outside players are
                        closer to the sidelines than the middle players. The
                        positions of players are determined and controlled
                        according to the positions of their feet contacting the
                        ground as follows: each front-row player must have at
                        least a part of his/her foot closer to the center line
                        than the feet of the corresponding back-row player; each
                        right- (left-) side player must have at least a part of
                        his/her foot closer to the right (left) side line than
                        the feet of the center player in that row.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        6.3 Positional Fault
                    </h3>
                    <p>
                        The team commits a positional fault, if any player is
                        not in his/her correct position at the moment the ball
                        is hit by the server. A positional fault leads to the
                        following consequences: the team is sanctioned with a
                        point and service to the opponent; and players&apos;
                        positions must be rectified.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        6.4 Rotation
                    </h3>
                    <p>
                        Rotational order is determined by the team&apos;s
                        starting line-up and controlled with the service order
                        and players&apos; positions throughout the game. When
                        the receiving team has gained the right to serve, its
                        players rotate one position clockwise including off the
                        courts if there are more than 6 players participating.
                    </p>
                    <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/30">
                        <p className="font-medium text-amber-900 dark:text-amber-100">
                            BSD-Specific Rule
                        </p>
                        <p className="text-amber-800 dark:text-amber-200">
                            Rotating off the courts when there are more than 6
                            players participating is specific to BSD.
                        </p>
                    </div>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        6.5 Rotational Fault
                    </h3>
                    <p>
                        A rotational fault is committed when the SERVICE is not
                        made according to the rotational order. It leads to the
                        following consequences: the team is sanctioned with a
                        point and service to the opponent; the players&apos;
                        rotational order must be rectified.
                    </p>
                    <p className="mt-2">
                        Additionally, the referee should determine the exact
                        moment when the fault was committed and all points
                        scored subsequently by the team at fault must be
                        cancelled. The opponent&apos;s points remain valid. If
                        that moment cannot be determined, no point(s)
                        cancellation takes place, and a point and service to the
                        opponent is the only sanction.
                    </p>
                </div>
            </div>
        </section>
    )
}
