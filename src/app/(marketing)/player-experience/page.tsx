export const metadata = {
    title: "Player Experience Levels - Bump Set Drink Volleyball",
    description:
        "Understanding the different skill divisions in the BSD Volleyball League"
}

const divisions = [
    {
        name: "AA Division",
        description:
            "Bumping, setting and hitting on nearly every rally. Hitters put the ball down hard and usually face double blocking. Skilled setters can place balls strategically. Comparable to USAV B or Gaithersburg City's BB league."
    },
    {
        name: "A Division",
        description:
            "Bumping, setting and hitting on nearly every rally. The better hitter can hit hard and put the ball down, usually against single blocking. Play features longer rallies with fewer kills than AA. Players demonstrate solid defensive abilities. Similar to lower USAV B level."
    },
    {
        name: "AB Division (now split into ABA And ABB)",
        description:
            "The defining characteristic is consistency. Players attempt the fundamental techniques, but execution varies between excellent plays and occasional lapses. Many competitors here could advance with improved consistency. Resembles Gaithersburg City's B league."
    },
    {
        name: "BBB Division",
        description:
            "Clearly a step above beginning players. Teams attempt to score by bumping, setting and spiking. Players understand court positioning and can sustain extended rallies. Slightly below Gaithersburg City's B league."
    },
    {
        name: "BB Division",
        description:
            "The entry-level league where newcomers learn how to pass correctly, where to stand on the court, practice defense, setting and hitting. Includes some experienced players to maintain rally continuity."
    }
]

export default function PlayerExperiencePage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    Player Experience Levels
                </h1>
                <p className="text-lg text-muted-foreground">
                    Understanding our skill divisions
                </p>
            </div>

            <div className="space-y-8">
                {divisions.map((division, index) => (
                    <div
                        key={index}
                        className="rounded-lg border border-border bg-card p-6"
                    >
                        <h2 className="mb-3 font-semibold text-xl">
                            {division.name}
                        </h2>
                        <p className="text-muted-foreground leading-relaxed">
                            {division.description}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    )
}
