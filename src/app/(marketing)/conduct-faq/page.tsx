import Image from "next/image"

export const metadata = {
    title: "BSD Conduct Committee Webpage FAQ - Bump Set Drink Volleyball",
    description:
        "Frequently asked questions about BSD Conduct Committee reporting and process"
}

export default function ConductCommitteeFAQPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    BSD Conduct Committee Webpage FAQ
                </h1>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        How do I report an issue like harassment or misconduct?
                    </h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            In many situations, issues can amicably be resolved
                            with a simple face-to-face discussion, but we
                            recognize that this is not always possible. BSD
                            takes all such concerns seriously. If you experience
                            or witness harassment, misconduct, unsportsmanlike
                            behavior, or any situation that makes you feel
                            unsafe or uncomfortable, we encourage you to report
                            what you experienced or saw. You can do so via:
                        </p>
                        <ol className="list-decimal space-y-2 pl-6">
                            <li>
                                Our Anonymous Report Form. This form can be
                                accessed by pressing the{" "}
                                <a
                                    href="/dashboard/report-concern"
                                    className="text-primary underline hover:text-primary/80"
                                >
                                    &ldquo;Report a Concern&rdquo;
                                </a>{" "}
                                button on the BSD website once you log in. No
                                identifying information is required for filing a
                                report.
                            </li>
                            <li>
                                Directly emailing{" "}
                                <a href="mailto:report@bumpsetdrink.com">
                                    report@bumpsetdrink.com
                                </a>
                                . Note: this method is not anonymous in that we
                                will be able to see who emails us with a
                                concern.
                            </li>
                            <li>
                                Speaking directly with a member of the BSD
                                Conduct Committee if you prefer an in-person
                                conversation.
                            </li>
                        </ol>
                        <p>
                            The members of the Conduct Committee are not the
                            only people to whom you can make a report, but they
                            are dedicated to ensuring that everyone has a great
                            time at BSD.
                        </p>
                    </div>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Is the report form really anonymous?
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        Yes. The form does not collect your email address, name,
                        or any identifying information. Neither your Google
                        account information nor your BSD account information is
                        recorded when you submit a report. If you want
                        follow-up, or would prefer an in-person or phone
                        conversation, there is an optional contact field — but
                        it is entirely up to you.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Who sees my report?
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        Reports are reviewed by the BSD Conduct Committee, a
                        small group of three trusted members of the BSD
                        community. This committee consists of a league director
                        and two non-director players in the league. Reports are
                        not shared with captains, other players, or anyone
                        outside the committee unless action is required or
                        unless it is necessary as part of the investigation into
                        the report. The committee handles all reports with
                        discretion.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        What happens after I submit a report?
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        The Conduct Committee reviews all submissions and
                        determines appropriate next steps, which may include a
                        private conversation with the individuals involved, a
                        formal warning, suspension, or removal from the league.
                        Because reports can be anonymous, the committee may not
                        be able to follow up with reporters directly unless they
                        provide contact information. All reports are documented
                        and taken seriously, even if immediate action isn&apos;t
                        visible.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        What kinds of issues can I report?
                    </h2>
                    <div className="space-y-4 text-muted-foreground leading-relaxed">
                        <p>
                            You can report anything that affects your safety or
                            experience in the league. This includes but is not
                            limited to:
                        </p>
                        <ul className="list-disc space-y-2 pl-6">
                            <li>
                                <strong>Sexual harassment</strong> — unwanted
                                comments, contact (physical or otherwise), or
                                behavior
                            </li>
                            <li>
                                <strong>Bullying or intimidation</strong> — on
                                or off the court
                            </li>
                            <li>
                                <strong>Discrimination</strong> — based on
                                gender, race, sexual orientation, or any other
                                protected class
                            </li>
                            <li>
                                <strong>Dangerous or reckless play</strong> —
                                intentional actions that risk injury
                            </li>
                            <li>
                                <strong>Unsportsmanlike conduct</strong> —
                                verbal abuse toward players, refs, or opponents
                            </li>
                            <li>
                                <strong>Any other concern</strong> — if
                                something feels wrong, it&apos;s worth reporting
                            </li>
                        </ul>
                    </div>
                </section>

                <section className="mt-16 text-center">
                    <div className="mx-auto max-w-[70%] overflow-hidden rounded-xl border bg-background shadow-sm">
                        <Image
                            src="/bsd-ombuds.jpeg"
                            alt="The Spring 2026 BSD Conduct Committee"
                            width={1600}
                            height={1200}
                            className="h-auto w-full"
                        />
                    </div>
                    <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
                        The Spring 2026 BSD Conduct Committee: Jacob Aley, Alice
                        Hung, and Jessie Jamieson (Director)
                    </p>
                </section>
            </div>
        </div>
    )
}
