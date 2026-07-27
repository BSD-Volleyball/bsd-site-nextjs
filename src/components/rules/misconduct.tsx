export function MisconductSection() {
    return (
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
                        Minor misconduct offenses are not subject to sanctions.
                        It is the referee&apos;s duty to prevent the teams from
                        approaching the sanctioning level. This is done by
                        issuing a verbal warning through the game captain.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        17.2 Misconduct Leading to Sanctions
                    </h3>
                    <p>
                        Incorrect conduct by a team member towards officials,
                        opponents, teammates, or spectators is classified in
                        three categories according to the seriousness of the
                        offense.
                    </p>
                    <ul className="mt-2 list-disc space-y-2 pl-6">
                        <li>
                            <u>Rude conduct</u>: action contrary to good manners
                            or moral principles.
                        </li>
                        <li>
                            <u>Offensive conduct</u>: defamatory or insulting
                            words or gestures or any action expressing contempt.
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
                        According to the judgment of the referee and depending
                        on the seriousness of the offense, the sanctions to be
                        applied and recorded on the score sheet are below:
                    </p>
                    <ul className="mt-2 list-disc space-y-2 pl-6">
                        <li>
                            <u>Sideout</u>: The first rude conduct in the match
                            by any team member is penalized with a point and
                            service awarded to the opponent&apos;s team.
                        </li>
                        <li>
                            <u>Expulsion</u>: The first offensive conduct by a
                            team member is sanctioned by expulsion, as is the
                            second rude conduct in the same match by the same
                            team member. A team member who is sanctioned by
                            expulsion shall not play for the rest of the game,
                            must immediately leave the court, and must remain
                            seated on the bench area.{" "}
                            <strong>
                                The opposing team is awarded a penalty point.
                            </strong>{" "}
                            <em>(This is different than USAV)</em>
                        </li>
                        <li>
                            <u>Disqualification</u>: Aggression is sanctioned by
                            disqualification, as are the second offensive
                            conduct in the same match by the same team member
                            and the third rude conduct in the same match by the
                            same team member. A team member who is sanctioned by
                            disqualification must immediately leave the court
                            and the facility.{" "}
                            <strong>
                                The opposing team is awarded a penalty point.
                            </strong>{" "}
                            <em>(This is different than USAV)</em>
                        </li>
                    </ul>
                    <p className="mt-2 text-sm">
                        NOTE: Players sanctioned with Expulsion or
                        Disqualification are subject to additional review beyond
                        the match and may receive additional league-level
                        sanctions (match suspensions, league disqualification,
                        etc).
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        17.4 Application of Misconduct Sanctions
                    </h3>
                    <p>
                        All misconduct sanctions are individual sanctions,
                        remain in force for the entire match, and are recorded
                        on the score sheet. The repetition of misconduct by the
                        same team member in the same match is sanctioned
                        progressively (the team member receives a heavier
                        sanction for each successive offense). Expulsion or
                        disqualification due to offensive conduct or aggression
                        does not require a previous sanction.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        17.5 Misconduct Before and Between Games
                    </h3>
                    <p>
                        Any misconduct occurring before or between games is
                        sanctioned in the following game.
                    </p>
                </div>

                <div>
                    <h3 className="font-medium text-foreground text-xl">
                        17.6 Misconduct After the Match Has Ended
                    </h3>
                    <p>
                        Any misconduct occurring after the match is sanctioned
                        in the following match.
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
                            <u>Expulsion</u>: signal Red+Yellow cards held
                            together
                        </li>
                        <li>
                            <u>Disqualification</u>: signal Red+Yellow cards
                            held apart
                        </li>
                    </ul>
                </div>
            </div>
        </section>
    )
}
