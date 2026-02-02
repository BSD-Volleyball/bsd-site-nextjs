import Link from "next/link"
import { Button } from "@/components/ui/button"

export const metadata = {
    title: "Spring 2026 Season Info - Bump Set Drink Volleyball",
    description: "Information about the BSD Volleyball League Spring 2026 season including registration, schedule, and format"
}

export default function Spring2026SeasonInfoPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    Spring 2026 Season Info
                </h1>
                <p className="text-lg text-muted-foreground">
                    Everything you need to know about the upcoming season
                </p>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
                <section className="mb-10">
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            This league is a social but competitive league. Players sign up individually and are drafted by captains to form competitive teams in each division. Players rotate in and out (no subbing occurs) to encourage fair and equal playing time for all. Teams often socialize together after matches, so it can be a great way to meet new people! All matches are played on Thursday evenings starting at 7:00 PM at the Adventist HealthCare Fieldhouse (part of the{" "}
                            <Link href="https://www.mdsoccerplex.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                Maryland Soccerplex
                            </Link>
                            ) in Germantown, MD.
                        </p>
                    </div>
                </section>

                <section className="mb-10">
                    <h2 className="mb-4 font-semibold text-2xl">Format</h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            The league will be divided into multiple divisions to accommodate up to 36 teams. The number of divisions &amp; teams in each division and the number of men &amp; women per team varies each season based on registrations; these will be determined by the league commissioners after registration closes. The league commissioners and team captains will hold drafts to determine the teams in each division. If there are not enough captains for all of the teams in a particular division, teams may be assigned by the league commissioners.
                        </p>
                    </div>
                </section>

                <section className="mb-10">
                    <h2 className="mb-4 font-semibold text-2xl">Age Requirements</h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            Players must be 14 years old by the start of preseason. Players 14-15 years must be paired with a parent or guardian. Players 16-17 are required to have a parent or guardian present during their matches.
                        </p>
                    </div>
                </section>

                <section className="mb-10">
                    <h2 className="mb-4 font-semibold text-2xl">Spring 2026 Season Details</h2>
                    <div className="rounded-lg border border-border bg-card p-6">
                        <ul className="space-y-3 text-muted-foreground">
                            <li className="flex gap-3">
                                <span className="font-semibold text-foreground">Mon Feb 23</span>
                                <span>— Registration closes ($90 all players thru this date; $100 afterward)</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-semibold text-foreground">Mar 05, Mar 12, Mar 19</span>
                                <span>— Preseason tryouts (the first tryouts are focused mostly on NEW players)</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-semibold text-foreground">Mar 26</span>
                                <span>— NO PLAY (division drafts take place during this time)</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-semibold text-foreground">Apr 02 thru May 07</span>
                                <span>— Regular Season</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-semibold text-foreground">May 14, May 21, May 28</span>
                                <span>— PLAYOFFS!</span>
                            </li>
                        </ul>
                    </div>
                </section>

                <section className="mb-10">
                    <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-6 dark:bg-amber-950/30">
                        <h3 className="mb-3 font-semibold text-foreground">Important Disclaimer</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            Information that you provide in your registration will be distributed to league commissioners and captains for the purposes of league drafts and administration of the league.
                        </p>
                    </div>
                </section>

                <section className="mb-10">
                    <div className="rounded-lg border border-border bg-muted/50 p-6">
                        <p className="text-muted-foreground leading-relaxed">
                            <strong className="text-foreground">NOTE:</strong> You are not guaranteed to be drafted in any particular division. Everyone who registers to play and is drafted on a team is expected to play, no matter what division you are drafted in.
                        </p>
                    </div>
                </section>

                <section className="mb-10">
                    <h2 className="mb-4 font-semibold text-2xl">Need More Information?</h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            Send a note to{" "}
                            <Link href="mailto:comments@bumpsetdrink.com" className="text-primary underline">
                                comments@bumpsetdrink.com
                            </Link>
                        </p>
                    </div>
                </section>

                <section className="mb-10">
                    <div className="rounded-lg border border-primary/50 bg-primary/5 p-6">
                        <h3 className="mb-3 font-semibold text-foreground">New to the League?</h3>
                        <p className="text-muted-foreground leading-relaxed">
                            It is important for you to provide as much information as possible about your skill level on the registration form (leagues and levels played, clinics, tournaments, and any other information). It is also important that you be there for the first night of preseason if possible (as well as the other nights)! Doing so will help captains draft you at a division suitable for your skill level.
                        </p>
                    </div>
                </section>

                <section className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <Button asChild size="lg">
                        <Link href="/auth/sign-up">Register Now</Link>
                    </Button>
                    <Button asChild variant="outline" size="lg">
                        <Link href="/auth/sign-in">Sign In</Link>
                    </Button>
                </section>
            </div>
        </div>
    )
}
