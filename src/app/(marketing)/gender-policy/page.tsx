export const metadata = {
    title: "Co-rec Play and Gender Policy - Bump Set Drink Volleyball",
    description: "BSD's policies on co-rec play and gender inclusion"
}

export default function GenderPolicyPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    Co-rec Play and Gender at BSD
                </h1>
                <p className="text-lg text-muted-foreground">
                    Our commitment to an inclusive volleyball community
                </p>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Core Commitment
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        BSD emphasizes an inclusive and diverse community dedicated to welcoming participants regardless of background, gender identity, or gender expression.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Gender Identity Recognition
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        The organization explicitly states: people may identify outside of traditional gender norms and affirms that no one should be excluded or disadvantaged based on their gender identity or expression.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Competitive Integrity
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        A key principle addresses fairness: gender identity should not be exploited or manipulated for a competitive advantage. The league aims to balance inclusion with competitive play, noting that volleyball is fun when all are included and play is competitive.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Adaptive Approach
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        Rather than claiming perfection, BSD acknowledges the complexity of these issues and commits to continuous improvement, welcoming participant feedback to evolve their practices over time.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 font-semibold text-2xl">
                        Community Involvement
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">
                        The league invites members to participate in shaping policies by contacting League Directors directly.
                    </p>
                </section>
            </div>
        </div>
    )
}
