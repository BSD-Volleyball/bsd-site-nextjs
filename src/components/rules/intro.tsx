export function RulesIntro() {
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
        </>
    )
}
