export const metadata = {
    title: "Captain Expectations - Bump Set Drink Volleyball",
    description: "What is expected of team captains in the BSD Volleyball League"
}

export default function CaptainExpectationsPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    Captain Expectations
                </h1>
                <p className="text-lg text-muted-foreground">
                    Guidelines for team captains in the BSD Volleyball League
                </p>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Core Principles
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        Captains must remember that players signed up for fun and expect to feel like you are a welcome contributor to your team. The league relies on captains to ensure everyone has a positive experience.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Pre-Draft Responsibilities
                    </h2>
                    <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
                        <li>Ideally, captains should have played in the division during the previous season</li>
                        <li>Develop ranked lists of men and women players before the draft</li>
                        <li>Review player experience information on the BSD Captain&apos;s website</li>
                        <li>Contact prospective players directly to learn more about them</li>
                        <li>Pay attention to the next-lower division to identify underrated talent</li>
                        <li>Attend tryouts to observe players&apos; mobility, skill execution, and game knowledge</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Team Formation
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        After drafting, captains must immediately contact their roster to share division assignment, schedule details, and contact information. They should project enthusiasm and remind players of league rules.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Match Management
                    </h2>
                    <p className="mb-4 text-muted-foreground leading-relaxed">
                        Captains are responsible for:
                    </p>
                    <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
                        <li>Tracking player availability and arranging substitutes when necessary</li>
                        <li>Creating fair lineups that give players a fair opportunity to contribute</li>
                        <li>Avoiding lineup strategies that isolate players from meaningful play</li>
                        <li>Considering individual player strengths in offensive formations</li>
                    </ul>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        During Games
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        Captains should observe player performance to adjust lineups mid-season. Provide praise rather than criticism during timeouts. Maintain professionalism with referees and opposing teams, remembering this is a social league, designed for fun.
                    </p>
                </section>
            </div>
        </div>
    )
}
