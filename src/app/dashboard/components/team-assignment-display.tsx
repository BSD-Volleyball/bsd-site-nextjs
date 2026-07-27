import { RiStarLine } from "@remixicon/react"
import type { PlayerTeamAssignment } from "../roster-actions"

export function TeamAssignmentDisplay({
    assignment
}: {
    assignment: PlayerTeamAssignment
}) {
    return (
        <div className="space-y-3">
            <div>
                <p className="font-semibold text-sm">{assignment.teamName}</p>
                <p className="pl-5 text-muted-foreground text-sm">
                    {assignment.divisionName} Division
                </p>
            </div>
            <div>
                <p className="mb-0.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Captain
                </p>
                <p className="pl-5 text-sm">
                    {assignment.captainName}{" "}
                    {assignment.captainEmail && (
                        <a
                            href={`mailto:${assignment.captainEmail}`}
                            className="text-primary hover:underline"
                        >
                            {assignment.captainEmail}
                        </a>
                    )}
                </p>
            </div>
            <div>
                <p className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Team Roster
                </p>
                <ul className="space-y-0.5">
                    {assignment.roster.map((player) => (
                        <li
                            key={`${player.displayName}-${player.lastName}`}
                            className="flex items-center gap-1.5 text-sm"
                        >
                            {player.isCaptain && (
                                <RiStarLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span
                                className={
                                    player.isCaptain ? "font-medium" : "pl-5"
                                }
                            >
                                {player.displayName} {player.lastName}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
