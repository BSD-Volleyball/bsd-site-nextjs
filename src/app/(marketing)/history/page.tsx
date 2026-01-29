export const metadata = {
    title: "League History - Bump Set Drink Volleyball",
    description: "The history of the BSD Volleyball League from its IBM origins to today"
}

export default function HistoryPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    League History
                </h1>
                <p className="text-lg text-muted-foreground">
                    From corporate volleyball to an independent community league
                </p>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Origins: The IBM Company Volleyball League
                    </h2>
                    <p className="mb-4 text-muted-foreground leading-relaxed">
                        The league began as part of IBM&apos;s Watson Trophy program, operating out of Corner Kick Pub in Gaithersburg, MD. The policy of the IBM Company leagues was fair play for all – all players played all games on a rotational basis to ensure equal time for all.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                        By the late 1980s, the league offered five competitive divisions (A through E) with approximately 40 teams and 320 players each season. Winners received coveted Watson Trophy awards at an annual banquet.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        The 1993 Transition
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        When IBM sold its Federal Systems Division to Loral Corporation in 1994, the league faced dissolution. Two active members—Dale Kawamura and Andrea Stump—negotiated with Mid-Atlantic Volleyball to create an independent successor league, which continued seamlessly under the new IBM/Loral label.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Evolution Through Corporate Changes
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        Following Loral&apos;s 1996 sale to Lockheed Martin, the league rebranded as the IBM/LM League, maintaining operational continuity throughout corporate transitions.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        The Naming Contest
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        In the late 1990s, the league dropped corporate references and held a naming contest. The winning name combined the volleyball (bump, set) with the social aspects of a league held in a venue with a bar overlooking the courts (drink). League member Bill Epstein won the competition.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Leadership and Venue Changes
                    </h2>
                    <p className="mb-4 text-muted-foreground leading-relaxed">
                        Dale Kawamura retired as director in Fall 1999, with Andrea Stump and Dee Weiss assuming leadership roles that continue today.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                        The Corner Kick closed suddenly in January 2002, forcing the league to relocate to Maryland Soccerplex&apos;s Discovery Center.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Independence: Bump, Set, Drink, Inc.
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        In 2006, after parting with Mid-Atlantic Volleyball, the league incorporated as an independent entity with a board including Andrea Stump (President) and Dee Weiss (VP/Secretary/Treasurer).
                    </p>
                </section>
            </div>
        </div>
    )
}
