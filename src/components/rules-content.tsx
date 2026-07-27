import { RulesIntro } from "@/components/rules/intro"
import { CodeOfConductSection } from "@/components/rules/code-of-conduct"
import { OverallInformationSection } from "@/components/rules/overall-information"
import { PlayoffsSection } from "@/components/rules/playoffs"
import { ParticipantsSection } from "@/components/rules/participants"
import { MatchFormatsSection } from "@/components/rules/match-formats"
import { TeamFormatsSection } from "@/components/rules/team-formats"
import { PlayingActionsSection } from "@/components/rules/playing-actions"
import { PlayerAtNetSection } from "@/components/rules/player-at-net"
import { ServiceSection } from "@/components/rules/service"
import { AttackHitSection } from "@/components/rules/attack-hit"
import { BlockingSection } from "@/components/rules/blocking"
import { InterruptionsSection } from "@/components/rules/interruptions"
import { GameDelaysSection } from "@/components/rules/game-delays"
import { ExceptionalInterruptionsSection } from "@/components/rules/exceptional-interruptions"
import { IntervalsSection } from "@/components/rules/intervals"
import { ParticipantsConductSection } from "@/components/rules/participants-conduct"
import { MisconductSection } from "@/components/rules/misconduct"
import { RefereeResponsibilitiesSection } from "@/components/rules/referee-responsibilities"

export function RulesContent() {
    return (
        <>
            <RulesIntro />

            <div className="prose prose-lg dark:prose-invert max-w-none">
                {/* Section 1: Code of Conduct */}
                <CodeOfConductSection />

                {/* Section 2: BSD Overall Information */}
                <OverallInformationSection />

                {/* Section 3: Playoffs */}
                <PlayoffsSection />

                {/* Section 4: Participants */}
                <ParticipantsSection />

                {/* Section 5: Match and Game Formats */}
                <MatchFormatsSection />

                {/* Section 6: Team Formats */}
                <TeamFormatsSection />

                {/* Section 7: Playing Actions */}
                <PlayingActionsSection />

                {/* Section 8: Player at the Net */}
                <PlayerAtNetSection />

                {/* Section 9: Service */}
                <ServiceSection />

                {/* Section 10: Attack Hit */}
                <AttackHitSection />

                {/* Section 11: Blocking */}
                <BlockingSection />

                {/* Section 12: Interruptions, Delays and Intervals */}
                <InterruptionsSection />

                {/* Section 13: Game Delays */}
                <GameDelaysSection />

                {/* Section 14: Exceptional Game Interruptions */}
                <ExceptionalInterruptionsSection />

                {/* Section 15: Intervals and Change of Courts */}
                <IntervalsSection />

                {/* Section 16: Participants' Conduct */}
                <ParticipantsConductSection />

                {/* Section 17: Misconduct and Its Sanctions */}
                <MisconductSection />

                {/* Section 18: Referee Responsibilities */}
                <RefereeResponsibilitiesSection />
            </div>
        </>
    )
}
