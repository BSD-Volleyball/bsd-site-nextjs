export const metadata = {
    title: "Referee Expectations - Bump Set Drink Volleyball",
    description: "What is expected of referees in the BSD Volleyball League"
}

export default function RefereeExpectationsPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    Referee Expectations
                </h1>
                <p className="text-lg text-muted-foreground">
                    Guidelines for referees in the BSD Volleyball League
                </p>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Core Expectations
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="mb-2 font-medium text-lg">Professional Conduct</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                Referees must remain professional and objective at all times and avoid being antagonized by players. They should stay calm and use penalties appropriately: verbal warnings, yellow cards (awarding points to opponents), ejections, and disqualifications. All cards must be reported to League Officials.
                            </p>
                        </div>
                        <div>
                            <h3 className="mb-2 font-medium text-lg">Rule Knowledge</h3>
                            <p className="text-muted-foreground leading-relaxed">
                                Referees are responsible for learning the current BSD rules located on the BSD website.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Pre-Match Duties
                    </h2>
                    <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
                        <li>Arrive 10 minutes early</li>
                        <li>Conduct coin toss with team captains</li>
                        <li>Ensure 6-minute warm-up period</li>
                        <li>Verify benches and equipment are properly positioned</li>
                        <li>Record referee name and team information on scoresheet</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        During Play
                    </h2>
                    <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
                        <li>Monitor server foot faults and player rotations</li>
                        <li>Administer timeouts (2 per team per game)</li>
                        <li>Call illegal contacts consistently: multiple hits, held balls, and improper technique</li>
                        <li>Watch anticipated ball contacts closely to catch violations accurately</li>
                        <li>Apply uniform standards to both teams throughout</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Match Management
                    </h2>
                    <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
                        <li>Warn captains about behavioral expectations</li>
                        <li>Apply forfeit procedures (10-minute grace period, then 5-minute intervals)</li>
                        <li>Record final scores and match times</li>
                        <li>Facilitate next match setup if needed</li>
                    </ul>
                </section>
            </div>
        </div>
    )
}
