export const metadata = {
    title: "FAQ - Bump Set Drink Volleyball",
    description: "Frequently asked questions about the BSD Volleyball League"
}

export default function FAQPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    Frequently Asked Questions
                </h1>
                <p className="text-lg text-muted-foreground">
                    Many new BSD players have never participated in a draft
                    league before. The beauty of this league is that you sign up
                    on your own &mdash; there&apos;s no need to find a team
                    that&apos;s trying to organize. Also? You get to play with
                    players that have roughly the same skill levels and
                    you&apos;re guaranteed to play!
                </p>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        How do BSD&apos;s tryouts work?
                    </h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            Each season we hold several weeks of tryouts. The
                            first week is limited mostly to new-to-BSD players
                            and lets the captains see each player go through
                            skills drills as well as play quick matches with a
                            team. Players are initially grouped by a rough
                            estimation of their skills (based on their
                            experience notes &amp; other info). Based on
                            feedback from the observing captains, we will shift
                            players here and there to ensure they are being seen
                            at the right levels. The goal is to have the new
                            players seen by as many captains as possible to gain
                            info on their skills &amp; speed.
                        </p>
                        <p>
                            The second and third weeks of tryouts are open to
                            all players (captains included!) and are focused on
                            gameplay. These matches lets captains see how well
                            players move and communicate and execute skills in
                            the game setting. For the second week, players are
                            placed on preseason teams based on the division they
                            last played (for returning players) or where they
                            look most suited (based on new players&apos; first
                            tryouts). Captains then give us their feedback on
                            players and we reseed the teams for the third week
                            of tryouts to balance skills &amp; speed even
                            further.
                        </p>
                    </div>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        How do BSD&apos;s drafts work?
                    </h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            With typically 5-6 divisions each season and with
                            most divisions having 6 teams, the drafts can be a
                            bit hectic. Prior to the tryouts starting, each
                            division&apos;s commissioner works to line up
                            volunteer captains who are likely qualified for that
                            division and can attend tryouts and can participate
                            in the draft. During the preseason play, the
                            commissioner will be communicating with those
                            captains, gathering feedback on players, etc.
                        </p>
                        <p>
                            After the third week of tryouts finish, the drafts
                            start! Drafts start with the highest division and
                            work their way to BB (our lowest division). The
                            Commissioner will solicit &ldquo;homework&rdquo;
                            from their captains &mdash; that homework consists
                            of each captain privately grouping the players into
                            rounds. Those homeworks are compiled with the
                            Commissioner&apos;s own groupings to arrive at a
                            consensus for the draft round that paired players
                            and captains should be selected. The Commissioner
                            and captains then meet up and conduct the actual
                            draft. When that&apos;s complete, we remove the
                            drafted players from the list of available players
                            and notify the next division&apos;s Commissioner who
                            repeats the process.
                        </p>
                        <p>
                            The result? Each season, the teams within a division
                            are typically very competitive because the players
                            are well balanced on skills and speed. And for you
                            as a player, that means you get to play on a team
                            that matches your own skill level pretty well! And
                            as a bonus, you get to meet possibly new teammates
                            and make new friends! Many of our players have told
                            us that they have made lasting friendships from
                            teammates or opponents they have met in the league.
                        </p>
                    </div>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        What is BSD&apos;s approach to team play?
                    </h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            From the beginning, this league has emphasized
                            inclusion and teamwork. Teams are comprised of 8
                            players (almost always) and comprised of as even a
                            mix of genders as our registrations allow each
                            season. As well, when winning a sideout, teams are
                            expected to rotate all players &mdash; so players
                            off the court will rotate on, and players on the
                            court will rotate off. There is no subbing. This
                            ensures everyone on a team gets a fair share of
                            playing and contributing to their team&apos;s
                            success!
                        </p>
                    </div>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        How does BSD handle playoffs?
                    </h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            BSD runs a 3-week, double-elimination playoff
                            format. At a minimum your team will get to play two
                            matches in the playoffs and it could be as many as 6
                            depending on your wins &amp; losses. We do take
                            playoffs seriously. Each match will have a work team
                            assigned who provide line judges &amp; a scorekeeper
                            &amp; a down ref. There are more restrictions on
                            subs during playoffs as well, in an effort to make
                            sure teams stay at the same level of
                            competitiveness.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    )
}
