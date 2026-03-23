export function RulesContent() {
    return (
        <>
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    BSD Volleyball Rules
                </h1>
                <p className="text-muted-foreground text-xl">
                    Official rules and regulations for the Bump Set Drink
                    Volleyball League
                </p>
            </div>

            {/* Referee Expectations preamble */}
            <div className="mb-12 rounded-lg border border-border bg-muted/40 p-6">
                <p className="mb-3 text-muted-foreground leading-relaxed">
                    The essence of a good referee lies in the concept of
                    fairness and consistency: to be fair to every participant,
                    and to be viewed as fair by the spectators.
                </p>
                <p className="mb-3 text-muted-foreground leading-relaxed">
                    This demands a huge element of trust — the referee must be
                    trusted to officiate a fair match: by being accurate in
                    his/her judgment; by understanding why the rule is written;
                    by being an efficient organizer; by allowing the competition
                    to flow and by directing it to a conclusion; by being an
                    educator — using the rules to penalize the unfair or
                    admonish the impolite; by promoting the game — that is, by
                    allowing the spectacular elements in the game to shine and
                    good players to do what they do best: play the game.
                </p>
                <p className="font-medium text-foreground">
                    A good referee will use the rules to make the competition a
                    fulfilling experience for all concerned.
                </p>
            </div>

            {/* Table of Contents */}
            <div className="mb-12 rounded-lg border border-border bg-muted/40 p-6">
                <h2 className="mb-4 font-semibold text-lg">
                    Table of Contents
                </h2>
                <ol className="grid list-none gap-1 pl-0 sm:grid-cols-2">
                    {[
                        [
                            "#code-of-conduct",
                            "1. Spectator/Player Code of Conduct"
                        ],
                        ["#overall-information", "2. BSD Overall Information"],
                        ["#playoffs", "3. BSD Overall Information — Playoffs"],
                        ["#participants", "4. Participants"],
                        ["#match-formats", "5. Match and Game Formats"],
                        ["#team-formats", "6. Team Formats"],
                        ["#playing-actions", "7. Playing Actions"],
                        ["#player-at-net", "8. Player at the Net"],
                        ["#service", "9. Service"],
                        ["#attack-hit", "10. Attack Hit"],
                        ["#blocking", "11. Blocking"],
                        [
                            "#interruptions",
                            "12. Interruptions, Delays and Intervals"
                        ],
                        ["#game-delays", "13. Game Delays"],
                        [
                            "#exceptional-interruptions",
                            "14. Exceptional Game Interruptions"
                        ],
                        ["#intervals", "15. Intervals and Change of Courts"],
                        ["#participants-conduct", "16. Participants' Conduct"],
                        ["#misconduct", "17. Misconduct and Its Sanctions"],
                        [
                            "#referee-responsibilities",
                            "18. Referee Responsibilities"
                        ]
                    ].map(([href, label]) => (
                        <li key={href}>
                            <a
                                href={href}
                                className="text-primary text-sm hover:underline"
                            >
                                {label}
                            </a>
                        </li>
                    ))}
                </ol>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
                {/* Section 1: Code of Conduct */}
                <section id="code-of-conduct" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        1. Spectator/Player Code of Conduct
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="mb-2 font-medium text-foreground text-xl">
                                1.1 I WILL:
                            </h3>
                            <ol className="list-decimal space-y-2 pl-6">
                                <li>
                                    Abide by the official rules of BSD
                                    Volleyball.
                                </li>
                                <li>
                                    Display good sportsmanship at all times,
                                    including all team members and captain.
                                </li>
                                <li>
                                    Educate myself on the unique rules of this
                                    facility and abide by them.
                                </li>
                                <li>
                                    Generate goodwill by being polite and
                                    respectful to those around me at this event.
                                </li>
                                <li>
                                    Immediately notify a League Director and/or
                                    Facilities personnel in the event that I
                                    witness any illegal activity.
                                </li>
                                <li>
                                    Acknowledge that the benches are for the
                                    players primarily and spectators will not
                                    sit there if there is not enough room.
                                </li>
                                <li>
                                    Acknowledge that spectators may rightfully
                                    choose to remain in a seat for an entire
                                    match without switching sides of the court
                                    when the teams switch.
                                </li>
                                <li>
                                    Ensure my children who attend as spectators
                                    are not on any court surface and instead
                                    remain in the seating area above the courts
                                    or on the opposite side of the netting if
                                    the court is not in use.
                                </li>
                            </ol>
                        </div>

                        <div>
                            <h3 className="mb-2 font-medium text-foreground text-xl">
                                1.2 I WILL NOT:
                            </h3>
                            <ol className="list-decimal space-y-2 pl-6">
                                <li>
                                    Harass or intimidate (either verbally or
                                    non-verbally) other players or the
                                    officials, including line judges and
                                    scorers.
                                </li>
                                <li>
                                    Participate in any game or game-like
                                    activities unless I have filled out the
                                    waiver for the BSD league.
                                </li>
                                <li>Bring and/or carry any firearms.</li>
                                <li>
                                    Bring, purchase, or consume alcohol at the
                                    Adventist HealthCare Fieldhouse or any part
                                    of South Germantown Park.
                                </li>
                            </ol>
                        </div>

                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                            <p className="font-semibold text-foreground">
                                WARNING!
                            </p>
                            <p>
                                Injury from flying objects incidental to the
                                sport of volleyball may occur at this event.
                                Attend at your own risk. Please pay close
                                attention to your surroundings and be alert at
                                all times, especially during active play.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 2: BSD Overall Information */}
                <section
                    id="overall-information"
                    className="mb-12 scroll-mt-24"
                >
                    <h2 className="mb-4 font-semibold text-2xl">
                        2. BSD Overall Information
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.1 Facility Information
                            </h3>
                            <p>
                                The Bump Set Drink league usually reserves only
                                4 volleyball courts at the Discovery Sports
                                Center. Any other volleyball courts which may be
                                open are for walk-in volleyball. The Discovery
                                Sports Center charges $5 per person to play on
                                the walk-in courts. Courts reserved for
                                BumpSetDrink league play will be open for
                                &ldquo;free&rdquo; pickup (league members only)
                                on a schedule designated on the website for each
                                season.
                            </p>
                            <p className="mt-2">
                                Please remember that the Discovery Sports Center
                                is a county-operated facility. It is prohibited
                                to possess alcohol in the Discovery Sports
                                Center or in the parking lots.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.2 Registration
                            </h3>
                            <p>
                                All registrations are final. No refunds will be
                                offered for any reason. If a player chooses to
                                not to play in the league after they are
                                selected for a team, for a reason other than a
                                change in situation (e.g. injury or work), the
                                league directors reserve the right to ban the
                                person from future registration.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.3 Conduct
                            </h3>
                            <p>
                                Rude behavior or offensive conduct is not
                                permissible. Such behavior will lead to
                                immediate match suspension by the referee.
                                Suspension from the league, due to repeated poor
                                conduct, will be recommended by the league
                                officials on a case by case basis. Multiple
                                suspensions can lead to a permanent ban from the
                                league.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.4 Rule Changes
                            </h3>
                            <p>
                                Any of the rules contained herein, as well as
                                rules covering items not explicitly stated
                                within these rules, may be modified as deemed
                                appropriate by the league officials.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.5 Commissioner Time-out
                            </h3>
                            <p>
                                When team captains require the assistance of a
                                league official who is actively playing in a
                                match, those captains must approach the referee
                                who is officiating the game in which the league
                                official is playing. When the ball is not in
                                play, they may request to speak with the
                                official. The referee should then call an
                                official&apos;s time-out for this purpose. The
                                time-out will NOT be charged against either
                                team.
                            </p>
                            <p className="mt-2 text-sm italic">
                                Note: Please do not disturb the league officials
                                during their scheduled matches unless it is
                                absolutely necessary. Before disturbing a
                                scheduled match, please try to find another
                                league official who is not playing.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.6 Team Composition
                            </h3>
                            <p>
                                Each team will have a roster with a maximum of 8
                                players. All eligible players present at a match
                                play in all games in that match. Teams with more
                                than 6 players present must rotate players on
                                and off the court, with the rotation occurring
                                off either (or both) side of the court when a
                                side out is granted.
                            </p>
                            <p className="mt-2">
                                A team shall consist of a minimum of 5 players
                                and a maximum of 6 players on the court.
                            </p>
                            <p className="mt-2">
                                If a team roster has only 3 players of 1 sex on
                                it, then they must have a minimum of 2 people of
                                that sex in the rotation if they are present and
                                are able to play (i.e. 4-2 or 3-3).
                            </p>
                            <p className="mt-2">
                                If a team roster has only 2 players of 1 sex on
                                it, then they must have a minimum of 1 person of
                                that sex in the rotation if they are present and
                                are able to play (i.e. 5-1 or 4-2).
                            </p>
                            <p className="mt-2">
                                If the team cannot field the appropriate number
                                of players, and does not want to utilize the
                                substitution rule, they may play with &ldquo;a
                                ghost player&rdquo; that rotates in the position
                                of the player that the ghost position is
                                representing. This ghost player should start in
                                the 6th service position (&lsquo;center
                                back&rsquo; if starting with service or
                                &lsquo;server position&rsquo; if starting with
                                receive of service) position and rotate as the
                                team rotates. The ghost position does rotate off
                                the court. The team will lose the serve when the
                                ghost player rotates to the service position.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.7 Substitutes
                            </h3>
                            <p>
                                A substitute list will be maintained by the
                                league commissioner(s) and will be available to
                                captains for help with suggestions. Captains may
                                choose a substitute to play from this list or
                                any other person if a regular player from the
                                team will be missing AND the opposing captain
                                agrees.
                            </p>
                            <p className="mt-2">
                                No team may choose as a substitute any regular
                                player currently in the league if that player is
                                scheduled to play in a match at the same time
                                (i.e. a lower division player may not abandon
                                his/her team to substitute for another team at a
                                higher level.)
                            </p>
                            <p className="mt-2">
                                Team captains must notify opposing captains, at
                                the beginning of a match, of any substitute
                                players who are participating in the match.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.8 Permanent Substitutes
                            </h3>
                            <p>
                                If a player is unable to participate on the team
                                for the remainder of the season, a permanent
                                substitute may be obtained. The permanent
                                substitute will assume the position of the
                                player that is being replaced on the team&apos;s
                                roster.
                            </p>
                            <p className="mt-2">
                                A permanent substitute may be added to a
                                team&apos;s roster, prior to the beginning of
                                the playoffs, either by unanimous approval of
                                the remaining team captains or by approval of a
                                majority of the remaining team captains and
                                either the league commissioner or the league
                                director. The permanent substitute may not be a
                                player on another roster in the current season.
                            </p>
                            <p className="mt-2">
                                Once the playoffs begin, no changes may be made
                                to a team&apos;s roster except as provided below
                                in playoff rules.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.9 Grace Periods
                            </h3>
                            <p>
                                For the first match of the evening, a grace
                                period of 10 minutes after the scheduled start
                                time of the match will be allowed before the
                                first game will be forfeited. Each subsequent
                                game will be forfeited every 5 minutes. Play
                                will start as soon as each team has at least 5
                                players.
                            </p>
                            <p className="mt-2">
                                For matches other than the first match of the
                                evening, the first game will forfeit at game
                                time. Each subsequent game will be forfeited
                                every 5 minutes. Play will start as soon as each
                                team has at least 5 players.
                            </p>
                            <p className="mt-2">
                                The score of each forfeited game will be
                                recorded as 25-0. If a team forfeits, the games
                                may still be played. The score, however, will
                                still be recorded as stated above.
                            </p>
                            <p className="mt-2">
                                Referees may choose not to officiate a forfeited
                                game. It is the league officials&apos; view that
                                a forfeit should be avoided as much as
                                reasonably possible. If anyone is available to
                                substitute, all attempts should be made to play
                                the match as scheduled.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.10 Match Times and Game Lengths
                            </h3>
                            <p>
                                Games will be 25 points with a 27 point cap. For
                                games that are <em>shortened</em> (see below),
                                teams will start at 6 points each. Rally scoring
                                will be in effect for all games.
                            </p>
                            <p className="mt-2">
                                Match times are scheduled at 7:00, 8:10, and
                                9:20 unless otherwise indicated by league
                                officials. There will be a 6 minute warm-up
                                period before the start of each match.{" "}
                                <strong>
                                    The start of a match is when the referee
                                    signals for the first serve of game #1.
                                </strong>{" "}
                                If game #1 ends more than 25 minutes after the
                                start of the match, game #2 will be{" "}
                                <em>shortened</em>. If game #2 ends more than 40
                                minutes after the start of the match, game #3
                                will be <em>shortened</em>. Due to the
                                league&apos;s contractual obligations with the
                                Adventist HealthCare Fieldhouse, there is no
                                discretion on the referee&apos;s part to change
                                these parameters. Unless a match ends early, or
                                a ref is not done playing in their match, the
                                start of the next match should be 6 minutes
                                after the previous match ends.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.11 Standings
                            </h3>
                            <p>
                                Standings will be determined by game win/loss
                                records from each match. If two or more teams
                                are tied for a position, positions will be
                                resolved by the following criteria, applied one
                                at a time, in order:
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    The team with the best game record against
                                    the teams with which it is tied.
                                </li>
                                <li>
                                    The team with the best point differential
                                    (points scored minus points given up)
                                    against the team(s) with which it is tied.
                                </li>
                                <li>
                                    The team with the best overall point
                                    differential.
                                </li>
                                <li>
                                    The team with the most points scored against
                                    the teams with which it is tied.
                                </li>
                                <li>
                                    The team with the most points scored
                                    overall.
                                </li>
                                <li>
                                    A coin toss between the involved captains.
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.12 Court Setup/Takedown
                            </h3>
                            <p>
                                In general, the courts should already be set up
                                and ready for play before the first match. If
                                they are not, it is the responsibility of the
                                teams playing in the first match to contact the
                                Adventist HealthCare Fieldhouse personnel to set
                                them up.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                2.13 Attire
                            </h3>
                            <p>
                                Uniforms (or shirts with numbers) are not
                                required for players. All players should dress
                                appropriately. Players must abide by all dress
                                code requirements required for play at the
                                Adventist HealthCare Fieldhouse, including
                                non-marking footwear.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 3: Playoffs */}
                <section id="playoffs" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        3. BSD Overall Information — Playoffs
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                3.1 Team Eligibility
                            </h3>
                            <p>
                                All teams are eligible to play in the playoffs.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                3.2 Player Eligibility
                            </h3>
                            <p>
                                All players currently on the team at the start
                                of the playoffs are eligible for the entire
                                playoffs. Once the playoffs start, only changes
                                outlined below may be made to the team rosters.
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    Players listed on the team&apos;s roster are
                                    automatically eligible to play for that team
                                    during playoffs. See the{" "}
                                    <em>Permanent Substitutes</em> section above
                                    for more information on replacing players
                                    during the regular season.
                                </li>
                                <li>
                                    As during the regular season, teams may play
                                    with only 5 players. A &ldquo;hole&rdquo;
                                    (empty spot) will be maintained for the
                                    missing 6th player; when that
                                    &ldquo;hole&rdquo; reaches the serving
                                    position after a rotation, an automatic
                                    sideout will be awarded the opposing team.
                                </li>
                                <li>
                                    Substitutes may be arranged only if a team
                                    would have to play with a &ldquo;hole&rdquo;
                                    (e.g., have only 1 woman available that
                                    night on a 5-men/3-women team).{" "}
                                    <strong>
                                        Known playoff substitutes must be
                                        approved unanimously by the remaining
                                        captains prior to 5pm on the day of a
                                        playoff match.
                                    </strong>{" "}
                                    As in the regular season, substitutes should
                                    be reasonable, ie:{" "}
                                    <strong>
                                        should not improve the team.
                                    </strong>{" "}
                                    If any substitute player is from a team that
                                    is still in the playoffs, that player MUST
                                    rejoin his/her team immediately when their
                                    match is ready to start.
                                </li>
                                <li>
                                    Opposing captains are encouraged to support
                                    teams needing subs during playoffs but can
                                    object with a good reason. As practical
                                    guidance, substitute players from lower
                                    divisions are nearly always approved;
                                    substitute players from the same division
                                    can be considered but might not be approved.
                                </li>
                                <li>
                                    If a team finds out at match time or during
                                    the match that they will have to play with a
                                    hole, the captain may seek an exceptional
                                    sub. That substitute player should be
                                    approved by all captains currently at the
                                    facility AND the division commissioner.
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                3.3 Playoff Structure
                            </h3>
                            <p>
                                A double elimination playoff will be used to
                                determine the winner for each division. All
                                teams will be seeded according to the standings
                                at the end of the regular season.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                3.4 Match Format
                            </h3>
                            <p>
                                Playoff matches will consist of the best 2 out
                                of 3 games. The first team to win 2 games wins
                                the match. In games 1 and 2, teams start at 4
                                points each; teams play to 25 and must win by 2
                                points with a 30 point cap. If a third
                                (deciding) game is required, the format is the
                                same but with no cap. During this third game,
                                teams will change sides when the first team
                                reaches 15 points.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                3.5 Work Teams
                            </h3>
                            <p>
                                During the playoffs, captains will be required
                                to provide work teams for certain matches in
                                which their team will not be participating. Work
                                teams will be assigned based on a schedule drawn
                                up by the league commissioner.
                            </p>
                            <p className="mt-2">
                                A work team consists of 4 players: one to keep
                                score, two to call lines and a 2nd (or down)
                                referee. All teams in the league will be
                                required to provide a 2nd (or down) referee
                                except the lowest level division. The lowest
                                level division will only be required to provide
                                a work team of 3 players.
                            </p>
                            <p className="mt-2">
                                A team that fails to provide sufficient players
                                to work an assigned match will be penalized{" "}
                                <strong>3 points</strong> in their own next
                                match for <u>each</u> player missing in the
                                games that they are to work. For example, if a
                                team does not show up <em>at all</em> to work an
                                assigned match, 12 points would be awarded to
                                the opposing team at the start of <u>each</u>{" "}
                                game of the team&apos;s next match. It is the
                                team&apos;s responsibility to be aware of when
                                they are the assigned work team for a match.
                                There is no grace period for the work team. A
                                team of 8 players should be able to have 4
                                persons present for the beginning of their work
                                match (including 7pm starts).
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 4: Participants */}
                <section id="participants" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        4. Participants
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                4.1 Team Composition
                            </h3>
                            <p>
                                All players present shall be considered playing
                                in the match unless injured even if they are
                                waiting to rotate in.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                4.2 Location of the Team
                            </h3>
                            <p>
                                All players waiting to rotate in shall be behind
                                the black line indicating the end of the
                                playable area.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                4.3 Captain
                            </h3>
                            <p>
                                Unless otherwise communicated to the referee,
                                each person who participates in the pre-match
                                coin toss will be considered the{" "}
                                <strong>game captain</strong> for their
                                respective team. During the match, when the ball
                                is out of play, only the game captain is
                                authorized to speak to the referees: to ask for
                                an explanation on the application or
                                interpretation of the Rules, and also to submit
                                the requests or questions of his/her teammates.
                                If the game captain does not agree with the
                                explanation of the 1st referee, he/she may
                                choose to protest against such decision and
                                immediately indicates to the referee that he/she
                                wishes to call over a league official to
                                protest. The league officials will rule on the
                                referee&apos;s application or interpretation of
                                the Rules but not the referee&apos;s judgment.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 5: Match and Game Formats */}
                <section id="match-formats" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        5. Match and Game Formats
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                5.1 General Match Format
                            </h3>
                            <p>
                                <strong>
                                    BSD follows rally scoring for all games.
                                </strong>{" "}
                                A game is won by the team which first scores 25
                                points with a minimum lead of two points. In the
                                case of a 24-24 tie, play is continued until a
                                two-point lead is achieved (26-24; 27-25; …)
                                with a cap at 27 points.
                            </p>
                            <p className="mt-2">
                                If a team refuses to play after being summoned
                                to do so, it is declared in default and forfeits
                                the first game with a score of 0-25. It then has
                                5 minutes to start the next game or same score
                                for game 2, then 5 minutes to start the 3rd game
                                or same score for game 3. BSD encourages teams
                                to make every effort not to forfeit and
                                therefore encourages opponents to be lenient
                                with the allowance of subs if a forfeit is
                                imminent.
                            </p>
                            <p className="mt-2">
                                Before the match, the referee carries out a coin
                                toss to decide upon the first service and the
                                sides of the court in the first game. There is
                                an additional coin toss for game 3 of the match.
                                The winner of the toss chooses: EITHER the right
                                to serve or to receive the service, OR the side
                                of the court. The loser of the toss takes the
                                remaining choice.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                5.2 Game Times
                            </h3>
                            <p>
                                Starting team scores for the second and third
                                games in each match depend on how long the
                                previous game(s) took. If the first game takes
                                longer than 25 minutes to play, the teams will
                                start at 6-6 in game 2. If the first two games
                                combined take longer than 40 minutes to play,
                                the teams will start at 6-6 in game 3.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 6: Team Formats */}
                <section id="team-formats" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        6. Team Formats
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                6.1 Team Starting Line-Up
                            </h3>
                            <p>
                                If a referee believes there are changes in a
                                line up being made due to the lineup of the
                                other team, he/she has the right to request
                                written lineups from both teams prior to the
                                start of a game.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                6.2 Positions
                            </h3>
                            <p>
                                At the moment the ball is hit by the server,
                                each team must be positioned within its own
                                court in the rotational order (except the
                                server). The positions of the players are
                                numbered as follows: The three players along the
                                net are front-row players and occupy positions 4
                                (front-left), 3 (front-center) and 2
                                (front-right); the other three are back-row
                                players occupying positions 5 (back-left), 6
                                (back-center) and 1 (back-right).
                            </p>
                            <p className="mt-2">
                                <u>Relative positions between players</u>: Each
                                back-row player must be positioned further back
                                from the net than the corresponding front-row
                                player; the front-row players and the back-row
                                players, respectively, must be positioned
                                laterally so that the outside players are closer
                                to the sidelines than the middle players. The
                                positions of players are determined and
                                controlled according to the positions of their
                                feet contacting the ground as follows: each
                                front-row player must have at least a part of
                                his/her foot closer to the center line than the
                                feet of the corresponding back-row player; each
                                right- (left-) side player must have at least a
                                part of his/her foot closer to the right (left)
                                side line than the feet of the center player in
                                that row.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                6.3 Positional Fault
                            </h3>
                            <p>
                                The team commits a positional fault, if any
                                player is not in his/her correct position at the
                                moment the ball is hit by the server. A
                                positional fault leads to the following
                                consequences: the team is sanctioned with a
                                point and service to the opponent; and
                                players&apos; positions must be rectified.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                6.4 Rotation
                            </h3>
                            <p>
                                Rotational order is determined by the
                                team&apos;s starting line-up and controlled with
                                the service order and players&apos; positions
                                throughout the game. When the receiving team has
                                gained the right to serve, its players rotate
                                one position clockwise including off the courts
                                if there are more than 6 players participating.
                            </p>
                            <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/30">
                                <p className="font-medium text-amber-900 dark:text-amber-100">
                                    BSD-Specific Rule
                                </p>
                                <p className="text-amber-800 dark:text-amber-200">
                                    Rotating off the courts when there are more
                                    than 6 players participating is specific to
                                    BSD.
                                </p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                6.5 Rotational Fault
                            </h3>
                            <p>
                                A rotational fault is committed when the SERVICE
                                is not made according to the rotational order.
                                It leads to the following consequences: the team
                                is sanctioned with a point and service to the
                                opponent; the players&apos; rotational order
                                must be rectified.
                            </p>
                            <p className="mt-2">
                                Additionally, the referee should determine the
                                exact moment when the fault was committed and
                                all points scored subsequently by the team at
                                fault must be cancelled. The opponent&apos;s
                                points remain valid. If that moment cannot be
                                determined, no point(s) cancellation takes
                                place, and a point and service to the opponent
                                is the only sanction.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 7: Playing Actions */}
                <section id="playing-actions" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        7. Playing Actions
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.1 Ball &ldquo;In&rdquo;
                            </h3>
                            <p>
                                The ball is &ldquo;in&rdquo; when it touches the
                                floor of the playing court including the
                                boundary lines.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.2 Ball &ldquo;Out&rdquo;
                            </h3>
                            <p>
                                The ball is &ldquo;out&rdquo; (out of play) when
                                one of the following occurs:
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    The part of the ball which contacts the
                                    floor is completely outside the boundary
                                    lines.
                                </li>
                                <li>
                                    The ball crosses completely the lower space
                                    under the net.
                                </li>
                                <li>
                                    The ball touches the antennae, ropes, posts
                                    or the net itself outside the side bands.
                                </li>
                                <li>
                                    The ball crosses the vertical plane of the
                                    net either partially or totally outside the
                                    crossing space (see &ldquo;pursuit
                                    rule&rdquo; exception below).
                                </li>
                                <li>
                                    The ball makes contact with the ceiling or
                                    obstruction above the opponent&apos;s
                                    playing area.
                                </li>
                                <li>
                                    The ball contacts the ceiling or obstruction
                                    above the team&apos;s playing area and
                                    crosses the plane of the net into the
                                    opponent&apos;s court.
                                </li>
                                <li>
                                    The ball contacts the ceiling or overhead
                                    objects, regardless of height, over
                                    non-playing areas.
                                </li>
                                <li>
                                    The ball touches an object outside the
                                    court, the ceiling or a person out of play.{" "}
                                    <em>
                                        (If benches, bleachers, low-hanging
                                        baskets or other floor obstructions are
                                        fewer than 2m (6&apos;6 3/4&quot;) from
                                        the court and interfere with play of the
                                        ball, the ball becomes out of play and a
                                        playover may be directed at the
                                        referee&apos;s discretion.)
                                    </em>
                                </li>
                            </ul>
                            <p className="mt-3">
                                A ball is out of play{" "}
                                <em>and a playover is directed</em> when one of
                                the following occurs:
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    The ball comes to rest on an overhead object
                                    above the team&apos;s playing area and is
                                    still a playable ball.
                                </li>
                                <li>
                                    An official, media equipment or personnel or
                                    spectator interferes with a player&apos;s
                                    legal attempt to play the ball.
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.3 Pursuit Rule
                            </h3>
                            <p>
                                The Pursuit Rule allows for play of what might
                                otherwise seem an unplayable ball. It is allowed
                                only if the referee has indicated that the rule
                                is in effect prior to the match (i.e., if
                                sufficient space exists on the sides of the net
                                to allow players to safely chase down balls).
                                This rule provides that a ball is still playable
                                when it has crossed the net plane to the
                                opponent&apos;s free zone totally or partly
                                through the <em>external space</em>. In this
                                case, the ball may be played back within the
                                team hits, provided that the opponent&apos;s
                                court is not touched by the player, and the
                                ball, when played back, crosses the net plane
                                again totally or partly through the external
                                space on the same side of the court. The
                                opponent team may not prevent or interfere with
                                a team pursuing a ball in this manner.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.4 Playing the Ball
                            </h3>
                            <p>
                                Each team must play within its own playing area
                                and space. The ball may, however, be retrieved
                                from beyond the free zone when the area is free
                                of obstructions. If obstructions or other safety
                                concerns prohibit retrieval from beyond the free
                                zone, the player retrieving a ball over a
                                non-playing area must be in contact with the
                                playing surface when contact with the ball is
                                made. Non-playing areas are defined as the: (1)
                                walls, bleachers or other spectator seating
                                areas; (2) team benches and any area behind the
                                team benches; (3) area between the scorer&apos;s
                                table and the team benches; (4) any other area
                                outlined in the pre-match conference by the
                                referee. If nets are used to separate courts,
                                only the player attempting to play the ball may
                                move the net to play the ball. When competition
                                is scheduled or is occurring on adjacent
                                court(s), it is a fault for a player to enter
                                the adjacent court(s) to play a ball or after
                                playing a ball. The free zone, including the
                                service zone on an adjacent court, is a playing
                                area.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.5 Team Hits
                            </h3>
                            <p>
                                A hit is any contact with the ball by a player
                                in play except for a block. The team is entitled
                                to a maximum of three hits (in addition to
                                blocking), for returning the ball. If more are
                                used, the team commits the fault of: &ldquo;FOUR
                                HITS.&rdquo;
                            </p>
                            <p className="mt-2">
                                <u>Consecutive Contacts</u>: A player may not
                                hit the ball two times consecutively unless it
                                is the first or second touch on a side and the
                                contact is one singular motion. If on the second
                                touch, the ball must be contacted by a teammate
                                before going across the net or it is a fault.
                            </p>
                            <p className="mt-2">
                                <u>Acts</u>: When two or more teammates touch
                                the ball simultaneously, it is counted as one
                                hit. If teammates collide, no fault is
                                committed. Any player may play the ball next if
                                the simultaneous hit is not the third team hit.
                                If they reach for the ball, but only one of them
                                touches it, one hit is counted. When two
                                opponents touch the ball simultaneously over the
                                net and the ball remains in play, the team
                                receiving the ball is entitled to another three
                                hits. If such a ball goes &ldquo;out,&rdquo; it
                                is the fault of the team on the opposite side if
                                the referee cannot determine the last contact.
                                If simultaneous hits by two opponents over the
                                net lead to extended contact with the ball, play
                                continues.
                            </p>
                            <p className="mt-2">
                                <u>Assisted Hit</u>: Within the playing area, a
                                player is not permitted to take support from a
                                teammate or any structure/object in order to hit
                                the ball. However, a player who is about to
                                commit a fault (touch the net or cross the
                                center line, etc.) may be stopped or held back
                                by a teammate.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.6 Characteristics of the Hit
                            </h3>
                            <p>
                                The ball may touch any part of the body. The
                                ball must not be caught and/or thrown. It can
                                rebound in any direction. The ball may touch
                                various parts of the body, provided that the
                                contacts take place simultaneously for the
                                second and third team hits. Exceptions: at
                                blocking, consecutive contacts may be made by
                                one or more player(s) provided that the contacts
                                occur during one action; at the first hit of the
                                team, the ball may contact various parts of the
                                body consecutively provided that the contacts
                                occur during one action.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.7 Faults in Playing the Ball
                            </h3>
                            <ul className="list-disc space-y-2 pl-6">
                                <li>
                                    <strong>Four Hits:</strong> a team hits the
                                    ball four times consecutively.
                                </li>
                                <li>
                                    <strong>Assisted Hit:</strong> a player
                                    takes support from a teammate or any
                                    structure/object in order to hit the ball
                                    within the playing area.
                                </li>
                                <li>
                                    <strong>Catch:</strong> the ball is caught
                                    and/or thrown; it does not rebound from the
                                    hit.
                                </li>
                                <li>
                                    <strong>Double Contact:</strong> a player
                                    hits the ball twice in succession or the
                                    ball contacts various parts of his/her body
                                    in succession, for third team hit.
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.8 Ball Crossing the Net
                            </h3>
                            <p>
                                The ball sent to the opponent&apos;s court must
                                go over the net within the crossing space. The
                                crossing space is the part of the vertical plane
                                of the net limited as follows: by the top of the
                                net; at the sides, by the antennae, and their
                                imaginary extension; above, by the ceiling. The
                                ball that is heading towards the opponent&apos;s
                                court through the lower space is in play until
                                the moment it has completely crossed the
                                vertical plane of the net.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.9 Ball Touching the Net
                            </h3>
                            <p>
                                While crossing the net, the ball may touch it.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                7.10 Ball in the Net
                            </h3>
                            <p>
                                A ball driven into the net may be recovered
                                within the limits of the three team hits. If the
                                ball rips the mesh of the net or tears it down,
                                the rally is cancelled and replayed.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 8: Player at the Net */}
                <section id="player-at-net" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        8. Player at the Net
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                8.1 Reaching Beyond the Net
                            </h3>
                            <p>
                                In blocking, a player may touch the ball beyond
                                the net, provided that he/she does not interfere
                                with the opponent&apos;s play before or during
                                the latter&apos;s attack hit. After an attack
                                hit, a player is permitted to pass his/her hand
                                beyond the net, provided that the contact has
                                been made within his/her own playing space.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                8.2 Penetration Under the Net
                            </h3>
                            <p>
                                It is permitted to penetrate into the
                                opponent&apos;s space under the net, provided
                                that this does not interfere with the
                                opponent&apos;s play. Penetration into the
                                opponent&apos;s court, beyond the center line:
                                To touch the opponent&apos;s court with a foot
                                (feet) or hand(s) is permitted, provided that
                                some part of the penetrating foot (feet) or
                                hand(s) remains either in contact with or
                                directly above the center line; A player may
                                enter the opponent&apos;s court after the ball
                                goes out of play. Players may penetrate into the
                                opponent&apos;s free zone provided that they do
                                not interfere with the opponent&apos;s play.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                8.3 Contact with the Net
                            </h3>
                            <p>
                                Contact with the net by a player is a fault,
                                unless it is incidental or is hair. Players may
                                touch the post, ropes, or any other object
                                outside the antennae, including the net itself,
                                provided that it does not interfere with play.
                                When the ball is driven into the net, causing it
                                to touch an opponent, no fault is committed.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                8.4 Player&apos;s Faults at the Net
                            </h3>
                            <ul className="list-disc space-y-2 pl-6">
                                <li>
                                    A player touches the ball or an opponent in
                                    the opponent&apos;s space before or during
                                    the opponent&apos;s attack hit.
                                </li>
                                <li>
                                    A player interferes with the opponent&apos;s
                                    play while penetrating into the
                                    opponent&apos;s space under the net.
                                </li>
                                <li>
                                    A player&apos;s foot (feet) or hand(s)
                                    penetrates completely into the
                                    opponent&apos;s court.
                                </li>
                                <li>
                                    A player interferes with the opponent&apos;s
                                    play by (amongst others): touching the net
                                    or the antenna during his/her action of
                                    playing the ball; taking support from the
                                    net simultaneously with playing the ball; or
                                    making actions which hinder an
                                    opponent&apos;s legitimate attempt to play
                                    the ball such as moving toward the net to
                                    attempt to deflect a ball being driven into
                                    the net by the opponent.
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 9: Service */}
                <section id="service" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">9. Service</h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                9.1 Service
                            </h3>
                            <p>
                                The service is the act of putting the ball into
                                play, by the back right player, placed in the
                                service zone.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                9.2 First Service in a Game
                            </h3>
                            <p>
                                The service of game 2 will be started with the
                                service of the team that did not serve first in
                                the previous game.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                9.3 Service Order
                            </h3>
                            <p>
                                The players must follow the service order by
                                rotating around the court and on the side (if
                                more than 6 players present) in a clockwise
                                manner. After the first service in a game, the
                                player to serve is determined as follows: when
                                the serving team wins the rally, the player who
                                served before serves again; when the receiving
                                team wins the rally, it gains the right to serve
                                and rotates before actually serving.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                9.4 Authorization of the Service
                            </h3>
                            <p>
                                The referee authorizes the service, after having
                                checked that the two teams are ready to play and
                                that the server is in possession of the ball.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                9.5 Execution of the Service
                            </h3>
                            <p>
                                The ball shall be hit with one hand or any part
                                of the arm after being tossed or released from
                                the hand(s). Only one toss or release of the
                                ball is allowed. Dribbling or moving the ball in
                                the hands is permitted. At the moment of the
                                service hit or takeoff for a jump service, the
                                server must not touch the court (the end line
                                included) or the floor outside the service zone.
                                After the hit, he/she may step or land outside
                                the service zone, or inside the court. The
                                entire service action must take place on the
                                playing area. The server must hit the ball
                                within 8 seconds after the referee whistles for
                                service. If the ball, after having been tossed
                                or released by the server, lands without
                                touching the player, it is considered a service
                                tossing error. A service tossing error is a
                                sideout and point for the other team. A service
                                executed before the referee&apos;s whistle is
                                cancelled and repeated. After the whistle for
                                service, no other actions (requests for line-up
                                check, time-out, substitution, etc.) may be
                                considered until after the ball has been served
                                and the rally completed.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                9.6 Screening
                            </h3>
                            <p>
                                The players of the serving team must not prevent
                                their opponents, through individual or
                                collective screening, from seeing the server and
                                the flight path of the ball. A player, or group
                                of players, of the serving team make(s) a screen
                                by waving arms, jumping or moving sideways,
                                during the execution of the service, or by
                                standing grouped to hide the server and the
                                flight path of the ball.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                9.7 Faults Made During the Service
                            </h3>
                            <p>
                                The following serving faults lead to a change of
                                service even if the opponent is out of position:
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>The server violates the service order.</li>
                                <li>
                                    The server does not execute the service
                                    properly.
                                </li>
                                <li>
                                    The toss touches a foreign object before
                                    being touched by the server.
                                </li>
                            </ul>
                            <p className="mt-3">
                                After the service has been correctly hit, the
                                following serving faults also lead to a change
                                of service but only if the opponent is not out
                                of position:
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    The ball touches a player of the serving
                                    team.
                                </li>
                                <li>
                                    The ball fails to cross the vertical plane
                                    of the net completely through the crossing
                                    space.
                                </li>
                                <li>
                                    The ball lands &ldquo;out&rdquo; on the
                                    opponent&apos;s side.
                                </li>
                                <li>The ball passes over a player screen.</li>
                                <li>
                                    The ball touches any overhead obstruction.
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                9.8 Serving Faults and Positional Faults
                            </h3>
                            <p>
                                If the server makes a fault at the moment of the
                                service hit (improper execution, wrong
                                rotational order, etc.) and the opponent is out
                                of position, it is the serving fault which is
                                sanctioned. Instead, if the execution of the
                                service has been correct, but the service
                                subsequently becomes faulty (goes out, goes over
                                a screen, etc.), positional faults of either
                                team have taken place first and are sanctioned.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 10: Attack Hit */}
                <section id="attack-hit" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        10. Attack Hit
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                10.1 Characteristics of the Attack Hit
                            </h3>
                            <p>
                                All actions which direct the ball toward the
                                opponents, with the exception of service and
                                block, are considered as attack hits. During an
                                attack hit, tipping is permitted only if the
                                ball is cleanly hit, and not caught or thrown.
                                An attack hit is completed at the moment the
                                ball completely crosses the vertical plane of
                                the net or is touched by an opponent.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                10.2 Restrictions of the Attack Hit
                            </h3>
                            <p>
                                A front-row player may complete an attack hit at
                                any height, provided that the contact with the
                                ball has been made within the player&apos;s own
                                playing space. A back-row player may complete an
                                attack hit at any height starting from behind
                                the front zone: at takeoff, the player&apos;s
                                feet must neither have touched nor crossed over
                                the attack line; after his/her hit, the player
                                may land within the front zone. A back-row
                                player may also complete an attack hit from the
                                front zone if, at the moment of the contact,
                                part of the ball is lower than the top of the
                                net. No player is permitted to complete an
                                attack hit on the OPPONENT&apos;S service, when
                                the ball is in the front zone and entirely
                                higher than the top of the net.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                10.3 Faults of the Attack Hit
                            </h3>
                            <ul className="list-disc space-y-2 pl-6">
                                <li>
                                    A player first contacts the ball within the
                                    playing space of the opposing team.
                                </li>
                                <li>
                                    A player hits the ball &ldquo;out&rdquo; on
                                    either side.
                                </li>
                                <li>
                                    A back-row player completes an attack hit
                                    from the front zone if, at the moment of
                                    contact the ball is entirely higher than the
                                    top of the net.
                                </li>
                                <li>
                                    A player completes an attack hit on the
                                    opponent&apos;s service, when the ball is in
                                    the front zone and entirely higher than the
                                    top of the net.
                                </li>
                                <li>
                                    NOTE: If an attack-hit fault occurs
                                    simultaneously with a blocking fault by the
                                    opponents, a double fault is committed and a
                                    replay is called.
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 11: Blocking */}
                <section id="blocking" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        11. Blocking
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                11.1 Blocking
                            </h3>
                            <p>
                                Blocking is the action of players close to the
                                net to intercept the ball coming from the
                                opponent by reaching higher than the top of the
                                net, regardless of the height of the ball
                                contact. Only front-row players are permitted to
                                complete a block, but at the moment of contact
                                with the ball, a part of the body must be higher
                                than the top of the net.
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    <u>Block Attempt</u>: A block attempt is the
                                    action of blocking without touching the
                                    ball.
                                </li>
                                <li>
                                    <u>Completed Block</u>: A block is completed
                                    whenever the ball is touched by a blocker.
                                </li>
                                <li>
                                    <u>Collective Block</u>: A collective block
                                    is executed by two or three players close to
                                    each other and is completed when one of them
                                    touches the ball.
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                11.2 Block Contact
                            </h3>
                            <p>
                                Consecutive (quick and continuous) contacts with
                                the ball may occur by one or more blockers,
                                provided that the contacts are made during one
                                action. Accordingly, it is a double contact
                                fault if a player has successive contacts while
                                using a blocking action when directing a ball
                                toward the opponent&apos;s space.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                11.3 Blocking Within the Opponent&apos;s Space
                            </h3>
                            <p>
                                In blocking, the player may place his/her hands
                                and arms beyond the net provided that this
                                action does not interfere with the
                                opponent&apos;s play. Thus, it is not permitted
                                to touch the ball beyond the net until an
                                opponent has executed an attack hit. Blocking
                                the ball beyond the net above the
                                opponent&apos;s team area shall be permitted,
                                provided: (a) the block contact occurs after the
                                opponents have hit the ball in such a manner
                                that the ball would, in the referee&apos;s
                                judgment, clearly cross the net if not touched
                                by a player, and no member of the attacking team
                                is in a position to make a play on the ball; or
                                (b) the ball is falling near the net, and no
                                member of the attacking team could, in the 1st
                                referee&apos;s judgment, make a play on the
                                ball.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                11.4 Block and Team Hits
                            </h3>
                            <p>
                                A block contact is not counted as a team hit.
                                Consequently, after a block contact, a team is
                                entitled to three hits to return the ball. The
                                first hit after the block may be executed by any
                                player, including the one who has touched the
                                ball during the block.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                11.5 Blocking Faults
                            </h3>
                            <ul className="list-disc space-y-2 pl-6">
                                <li>
                                    The blocker touches the ball in the
                                    OPPONENT&apos;S space either before or
                                    simultaneously with the opponent&apos;s
                                    attack hit.
                                </li>
                                <li>
                                    A back-row player completes a block or
                                    participates in a completed block.
                                </li>
                                <li>
                                    The ball is sent &ldquo;out&rdquo; off the
                                    block.
                                </li>
                                <li>
                                    Blocking the ball in the opponent&apos;s
                                    space from outside the antenna.
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 12: Interruptions, Delays and Intervals */}
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
                                An interruption is the time between one
                                completed rally and the referee&apos;s whistle
                                for the next service. The only regular game
                                interruptions are TIME-OUTS and SUBSTITUTIONS.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                12.2 Number of Regular Game Interruptions
                            </h3>
                            <p>
                                Each team may request a maximum of two time-outs
                                per game.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                12.3 Sequence of Regular Game Interruptions
                            </h3>
                            <p>
                                Request for one or two time-outs may follow one
                                another, within the same interruption.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                12.4 Request for Regular Game Interruptions
                            </h3>
                            <p>
                                Regular game interruptions may only be requested
                                by the game captain. A time-out before the start
                                of a game is permitted.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                12.5 Time-Outs
                            </h3>
                            <p>
                                Time-out requests must be made by showing the
                                corresponding hand signal, when the ball is out
                                of play and before the whistle for service. All
                                requested time-outs are limited to 30 seconds;
                                if both teams indicate readiness earlier, the
                                referee may signal the end of the timeout
                                sooner. The players may remain on the court or
                                go to the free zone near their team bench.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                12.6 Injury
                            </h3>
                            <p>
                                When there is an injury to a player in play the
                                following protocol will be followed. The referee
                                will wait 30 seconds to see how the player is.
                                If the player is still not recovered after 30
                                seconds, the referee will call a 3 minute time
                                out to assess the magnitude of the injury. If
                                after 3 minutes, the team is unable to determine
                                the status of the injured player then they may
                                use their remaining 30 second time outs. If an
                                injured player is unable to continue to play
                                then as much time is needed to safely remove the
                                player from the playing area is taken. An
                                injured player may return for a following game
                                if able to do so.
                            </p>
                            <p className="mt-2">
                                After the loss of a player to injury, a team may
                                either substitute a player who is currently
                                rotated out or may rotate to fill the empty
                                spot.
                            </p>
                            <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/30">
                                <p className="font-medium text-amber-900 dark:text-amber-100">
                                    BSD-Specific Rule
                                </p>
                                <p className="text-amber-800 dark:text-amber-200">
                                    The option to rotate to fill the empty spot
                                    after injury (rather than only substituting)
                                    is specific to BSD. If the team is left with
                                    fewer than 5 players able to play, they may
                                    request an &ldquo;exceptional sub&rdquo;,
                                    requiring approval of all captains at the
                                    facility and the division commissioner.
                                </p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                12.7 Line Up Checks
                            </h3>
                            <p>
                                A line-up check is not considered a regular game
                                interruption and is permitted prior to
                                reauthorizing the serve for a rally that was not
                                completed. A line-up check may not be requested
                                at any point after the service authorization,
                                even if the referee must authorize the serve a
                                second time due to external interference (i.e.,
                                a ball on the court, for example). Only captains
                                may request a line-up check.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                12.8 Substitution for Expulsion or
                                Disqualification
                            </h3>
                            <p>
                                An EXPELLED or DISQUALIFIED player must leave
                                the game immediately. If there are more than 6
                                players on the team than the team will rotate to
                                the open position; the lineup stays the same.
                            </p>
                            <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/30">
                                <p className="font-medium text-amber-900 dark:text-amber-100">
                                    BSD-Specific Rule
                                </p>
                                <p className="text-amber-800 dark:text-amber-200">
                                    The rotation-to-open-position approach for
                                    expulsion/disqualification is specific to
                                    BSD. If the expulsion will cause the team to
                                    play with a hole, then a substitute shall
                                    attempt to be found as long as it does not
                                    cause an undue delay.
                                </p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                12.9 Improper Requests
                            </h3>
                            <p>
                                It is improper to request any regular game
                                interruption: during a rally or at the moment
                                of, or after the whistle to serve, by a
                                nonauthorized team member, after having
                                exhausted the authorized number of time-outs.
                                The first improper request by a team in the
                                match that does not affect or delay the game
                                shall be rejected. Any further improper request
                                in the match by the same team constitutes a
                                delay.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 13: Game Delays */}
                <section id="game-delays" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        13. Game Delays
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                13.1 Types of Delays
                            </h3>
                            <p>
                                An improper action of a team that defers
                                resumption of the game is a delay and includes,
                                among others: delaying regular game
                                interruptions; prolonging interruptions, after
                                having been instructed to resume the game;
                                repeating an improper request; delaying the game
                                by a team member.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                13.2 Delay Sanctions
                            </h3>
                            <p>
                                &ldquo;Delay warning&rdquo; and &ldquo;delay
                                penalty&rdquo; are team sanctions. Delay
                                sanctions remain in force for the entire match.
                                All delay sanctions are recorded on the score
                                sheet. The first delay in the match by a team
                                member is sanctioned with a &ldquo;DELAY
                                WARNING.&rdquo; The second and subsequent delays
                                of any type by any member of the same team in
                                the same match constitute a fault and are
                                sanctioned with a &ldquo;DELAY PENALTY&rdquo;: a
                                point and service to the opponent. Delay
                                sanctions imposed before or between games are
                                applied in the following game.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 14: Exceptional Game Interruptions */}
                <section
                    id="exceptional-interruptions"
                    className="mb-12 scroll-mt-24"
                >
                    <h2 className="mb-4 font-semibold text-2xl">
                        14. Exceptional Game Interruptions
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                14.1 Injury/Illness
                            </h3>
                            <p>
                                Should a serious accident occur while the ball
                                is in play, the referee must stop the game
                                immediately and permit medical assistance to
                                enter the court. The rally is then replayed.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                14.2 External Interference
                            </h3>
                            <p>
                                If there is any external interference during the
                                game, the play has to be stopped and the rally
                                is replayed.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                14.3 Prolonged Interruptions
                            </h3>
                            <p>
                                If unforeseen circumstances interrupt the match,
                                the League Commissioners shall decide the
                                measures to be taken to reestablish normal
                                conditions. If the match is resumed on another
                                playing court, the interrupted game will resume
                                exactly where it was stopped on the previous
                                court.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 15: Intervals and Change of Courts */}
                <section id="intervals" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        15. Intervals and Change of Courts
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                15.1 Intervals
                            </h3>
                            <p>
                                An interval is the time between games. All
                                intervals last a maximum of 3 minutes.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                15.2 Change of Courts
                            </h3>
                            <p>
                                After game 1 and 2, the teams change courts. For
                                the 3rd game the Captains and referee do another
                                coin toss for serve or side choices.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 16: Participants' Conduct */}
                <section
                    id="participants-conduct"
                    className="mb-12 scroll-mt-24"
                >
                    <h2 className="mb-4 font-semibold text-2xl">
                        16. Participants&apos; Conduct
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                16.1 Sportsmanlike Conduct
                            </h3>
                            <p>
                                Participants must know the &ldquo;Official BSD
                                Volleyball Rules&rdquo; and abide by them.
                                Participants must accept referees&apos;
                                decisions with sportsmanlike conduct, without
                                disputing them. In case of doubt, clarification
                                may be requested only through the game captain.
                                Participants must refrain from actions, verbal
                                or non-verbal, aimed at influencing the
                                decisions of the referees or covering up faults
                                committed by their team.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                16.2 Fair Play
                            </h3>
                            <p>
                                <strong>
                                    Participants must behave respectfully and
                                    courteously in the spirit of FAIR PLAY, not
                                    only towards the referees, but also toward
                                    other officials, opponents, teammates, and
                                    spectators.
                                </strong>{" "}
                                Communication between team members during the
                                match is permitted.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Section 17: Misconduct and Its Sanctions */}
                <section id="misconduct" className="mb-12 scroll-mt-24">
                    <h2 className="mb-4 font-semibold text-2xl">
                        17. Misconduct and Its Sanctions
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                17.1 Minor Misconduct
                            </h3>
                            <p>
                                Minor misconduct offenses are not subject to
                                sanctions. It is the referee&apos;s duty to
                                prevent the teams from approaching the
                                sanctioning level. This is done by issuing a
                                verbal warning through the game captain.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                17.2 Misconduct Leading to Sanctions
                            </h3>
                            <p>
                                Incorrect conduct by a team member towards
                                officials, opponents, teammates, or spectators
                                is classified in three categories according to
                                the seriousness of the offense.
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    <u>Rude conduct</u>: action contrary to good
                                    manners or moral principles.
                                </li>
                                <li>
                                    <u>Offensive conduct</u>: defamatory or
                                    insulting words or gestures or any action
                                    expressing contempt.
                                </li>
                                <li>
                                    <u>Aggression</u>: actual physical attack or
                                    aggressive or threatening behavior.
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                17.3 Sanction Scale
                            </h3>
                            <p>
                                According to the judgment of the referee and
                                depending on the seriousness of the offense, the
                                sanctions to be applied and recorded on the
                                score sheet are below:
                            </p>
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    <u>Sideout</u>: The first rude conduct in
                                    the match by any team member is penalized
                                    with a point and service awarded to the
                                    opponent&apos;s team.
                                </li>
                                <li>
                                    <u>Expulsion</u>: The first offensive
                                    conduct by a team member is sanctioned by
                                    expulsion, as is the second rude conduct in
                                    the same match by the same team member. A
                                    team member who is sanctioned by expulsion
                                    shall not play for the rest of the game,
                                    must immediately leave the court, and must
                                    remain seated on the bench area.{" "}
                                    <strong>
                                        The opposing team is awarded a penalty
                                        point.
                                    </strong>{" "}
                                    <em>(This is different than USAV)</em>
                                </li>
                                <li>
                                    <u>Disqualification</u>: Aggression is
                                    sanctioned by disqualification, as are the
                                    second offensive conduct in the same match
                                    by the same team member and the third rude
                                    conduct in the same match by the same team
                                    member. A team member who is sanctioned by
                                    disqualification must immediately leave the
                                    court and the facility.{" "}
                                    <strong>
                                        The opposing team is awarded a penalty
                                        point.
                                    </strong>{" "}
                                    <em>(This is different than USAV)</em>
                                </li>
                            </ul>
                            <p className="mt-2 text-sm">
                                NOTE: Players sanctioned with Expulsion or
                                Disqualification are subject to additional
                                review beyond the match and may receive
                                additional league-level sanctions (match
                                suspensions, league disqualification, etc).
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                17.4 Application of Misconduct Sanctions
                            </h3>
                            <p>
                                All misconduct sanctions are individual
                                sanctions, remain in force for the entire match,
                                and are recorded on the score sheet. The
                                repetition of misconduct by the same team member
                                in the same match is sanctioned progressively
                                (the team member receives a heavier sanction for
                                each successive offense). Expulsion or
                                disqualification due to offensive conduct or
                                aggression does not require a previous sanction.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                17.5 Misconduct Before and Between Games
                            </h3>
                            <p>
                                Any misconduct occurring before or between games
                                is sanctioned in the following game.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                17.6 Misconduct After the Match Has Ended
                            </h3>
                            <p>
                                Any misconduct occurring after the match is
                                sanctioned in the following match.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                17.7 Summary of Misconduct and Cards Used
                            </h3>
                            <ul className="list-disc space-y-2 pl-6">
                                <li>
                                    <u>Warning</u>: no sanction — verbal warning
                                </li>
                                <li>
                                    <u>Sideout</u>: signal Red card
                                </li>
                                <li>
                                    <u>Expulsion</u>: signal Red+Yellow cards
                                    held together
                                </li>
                                <li>
                                    <u>Disqualification</u>: signal Red+Yellow
                                    cards held apart
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 18: Referee Responsibilities */}
                <section
                    id="referee-responsibilities"
                    className="mb-12 scroll-mt-24"
                >
                    <h2 className="mb-4 font-semibold text-2xl">
                        18. Referee Responsibilities
                    </h2>

                    <div className="space-y-6 text-muted-foreground leading-relaxed">
                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                18.1 Match Duties
                            </h3>
                            <p>
                                Prior to the match, the referee: inspects the
                                conditions of the playing area (including making
                                sure the benches are not closer to the middle of
                                the court than the 10 foot line, and that no
                                obstructions or people are between the benches
                                and the score table on both sides); the balls
                                and other equipment, including the tightness of
                                the net; performs the coin toss with the team
                                captains; goes over the pre-match list with both
                                captains; controls the teams&apos; warm-up
                                period. During the match, he/she is authorized:
                                to issue warnings to the teams; to sanction
                                misconduct and delays; to decide upon:
                            </p>
                            <ol className="mt-2 list-[lower-alpha] list-alpha space-y-2 pl-6">
                                <li>
                                    The faults of the server and of the
                                    positions of the serving team, including the
                                    screen.
                                </li>
                                <li>The faults in playing the ball.</li>
                                <li>
                                    The faults above the net, and the faulty
                                    contact of the player with the net,
                                    primarily on the attacker&apos;s side.
                                </li>
                                <li>
                                    The attack hit faults of the back-row
                                    players.
                                </li>
                                <li>
                                    The ball crossing completely the lower space
                                    under the net.
                                </li>
                                <li>
                                    The completed block by back-row players.
                                </li>
                            </ol>
                            <p className="mt-2">
                                At the end of the match, he/she checks the score
                                sheet and signs it. Whenever necessary, the
                                referee checks that the actual positions of the
                                players on the court correspond to those at the
                                start of the game.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                18.2 Official Signals
                            </h3>
                            <p>
                                Please refer to the signal page on the website
                                for the official signals. Referees are
                                responsible for knowing all signals.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-foreground text-xl">
                                18.3 Guidelines for Dealing with Blood
                            </h3>
                            <p>
                                If a player incurs an injury that causes
                                bleeding, the referee shall immediately stop the
                                game. The player shall leave the court for
                                evaluation/treatment. If the player cannot
                                continue play they must be replaced. If a
                                player&apos;s clothes becomes saturated with
                                blood, a change of clothes will be authorized.
                                This change should be accomplished as quickly as
                                possible to cause no additional delay of game.
                                If the referee observes blood on the playing
                                surface or equipment, the game shall be stopped
                                immediately and measures taken to clean any
                                contaminated area or equipment using universal
                                precautions.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </>
    )
}
