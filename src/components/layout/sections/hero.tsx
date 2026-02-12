"use client"
import { SignedOut } from "@daveyplate/better-auth-ui"
import { ArrowRight, MapPin, Users, Trophy } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export const HeroSection = () => {
    return (
        <section className="container mx-auto w-full px-4">
            <div className="py-24 xl:py-32">
                {/* Hero Content */}
                <div className="mx-auto max-w-4xl space-y-8 text-center">
                    <div className="font-bold text-4xl md:text-5xl lg:text-6xl">
                        <h1>
                            <span className="bg-gradient-to-r from-[#7033ff] to-primary bg-clip-text px-2 text-transparent">
                                Bump Set Drink
                            </span>
                            Volleyball
                        </h1>
                    </div>

                    <p className="mx-auto max-w-2xl text-lg text-muted-foreground leading-relaxed lg:text-xl">
                        A recreational co-ed volleyball league that plays on
                        Thursday nights in the Washington DC metro area. Join us
                        for competitive play across six skill divisions, meet
                        new people, and have fun!
                    </p>

                    <SignedOut>
                        <div className="mx-auto max-w-xl rounded-lg border-2 border-primary/30 bg-primary/5 px-6 py-4 text-center">
                            <p className="mb-3 font-bold text-lg">
                                Played with us before? You already have an
                                account!
                            </p>
                            <Button asChild size="lg">
                                <Link href="/auth/forgot-password">
                                    Set Password
                                </Link>
                            </Button>
                        </div>
                    </SignedOut>

                    <div className="flex flex-col items-center justify-center space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
                        <Button
                            asChild
                            size="lg"
                            className="rounded-full bg-amber-600 hover:bg-amber-700"
                        >
                            <Link href="/spring-2026-season-info">
                                Spring 2026 Season Info
                            </Link>
                        </Button>

                        <SignedOut>
                            <Button
                                asChild
                                size="lg"
                                className="group/arrow rounded-full"
                            >
                                <Link href="/auth/sign-up">
                                    Register Now
                                    <ArrowRight className="ml-2 size-5 transition-transform group-hover/arrow:translate-x-1" />
                                </Link>
                            </Button>
                        </SignedOut>

                        <Button
                            asChild
                            variant="outline"
                            size="lg"
                            className="rounded-full"
                        >
                            <Link href="/player-experience">
                                View Skill Levels
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* Stats/Features */}
                <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
                    <div className="flex flex-col items-center space-y-2 text-center">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                            <Users className="size-6 text-primary" />
                        </div>
                        <h3 className="font-semibold text-lg">
                            6 Skill Divisions
                        </h3>
                        <p className="text-muted-foreground text-sm">
                            From beginners to advanced, find your perfect level
                        </p>
                    </div>

                    <div className="flex flex-col items-center space-y-2 text-center">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                            <Trophy className="size-6 text-primary" />
                        </div>
                        <h3 className="font-semibold text-lg">Draft System</h3>
                        <p className="text-muted-foreground text-sm">
                            Meet new teammates every season through our unique
                            draft
                        </p>
                    </div>

                    <div className="flex flex-col items-center space-y-2 text-center">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                            <MapPin className="size-6 text-primary" />
                        </div>
                        <h3 className="font-semibold text-lg">
                            Maryland SoccerPlex
                        </h3>
                        <p className="text-muted-foreground text-sm">
                            Premium indoor courts in Boyds, MD
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
