export function MatchFormatsSection() {
    return (
        <section id="match-formats" className="mb-12 scroll-mt-24">
            <h2 className="mb-4 font-semibold text-2xl">
                5. Match and Game Formats
            </h2>

            <div className="space-y-6">
                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        5.1 General Match Format
                    </h3>
                    <p>
                        <strong>
                            BSD follows rally scoring for all games.
                        </strong>{" "}
                        A game is won by the team which first scores 25 points
                        with a minimum lead of two points. In the case of a
                        24-24 tie, play is continued until a two-point lead is
                        achieved (26-24; 27-25; …) with a cap at 27 points.
                    </p>
                    <p className="mt-2">
                        If a team refuses to play after being summoned to do so,
                        it is declared in default and forfeits the first game
                        with a score of 0-25. It then has 5 minutes to start the
                        next game or same score for game 2, then 5 minutes to
                        start the 3rd game or same score for game 3. BSD
                        encourages teams to make every effort not to forfeit and
                        therefore encourages opponents to be lenient with the
                        allowance of subs if a forfeit is imminent.
                    </p>
                    <p className="mt-2">
                        Before the match, the referee carries out a coin toss to
                        decide upon the first service and the sides of the court
                        in the first game. There is an additional coin toss for
                        game 3 of the match. The winner of the toss chooses:
                        EITHER the right to serve or to receive the service, OR
                        the side of the court. The loser of the toss takes the
                        remaining choice.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        5.2 Game Times
                    </h3>
                    <p>
                        Starting team scores for the second and third games in
                        each match depend on how long the previous game(s) took.
                        If the first game takes longer than 25 minutes to play,
                        the teams will start at 6-6 in game 2. If the first two
                        games combined take longer than 40 minutes to play, the
                        teams will start at 6-6 in game 3.
                    </p>
                </div>
            </div>
        </section>
    )
}
