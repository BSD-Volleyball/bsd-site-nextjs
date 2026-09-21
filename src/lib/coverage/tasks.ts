/**
 * tasks.ts — the gym jobs attached to each coverage slot, shared by the
 * Coverage page and the digest email. Pure: no server imports.
 *
 * Setup belongs to the first timed slot, cleanup to the last, and mid-way to
 * the timed slot just before the last (mid-way happens once the final
 * matches are under way, so it falls to the people already there). A
 * two-slot night puts setup and mid-way on the first slot; a single-slot
 * night carries all three. The TBD slot never carries tasks.
 *
 * `TASK_GROUPS` is the reference list with every conditional line labelled;
 * `resolveTaskGroups()` keeps only the lines that apply to one night.
 */

import type { CoverageDate, CoverageSlot } from "./types"

export type TaskGroupKey = "setup" | "midway" | "cleanup"

export type TaskCondition =
    | "regular_season"
    | "playoff"
    | "last_regular_week"
    | "playoffs_next_week"

export interface TaskLine {
    text: string
    /** null = always applies. */
    when: TaskCondition | null
}

export interface TaskGroup {
    key: TaskGroupKey
    title: string
    /** Shown after the title, e.g. "plan for ~10 minutes". */
    hint: string | null
    lines: TaskLine[]
}

export const CONDITION_LABELS: Record<TaskCondition, string> = {
    regular_season: "Regular season",
    playoff: "Playoffs",
    last_regular_week: "Last week of regular season",
    playoffs_next_week: "Playoffs next week"
}

const always = (text: string): TaskLine => ({ text, when: null })
const when = (cond: TaskCondition, text: string): TaskLine => ({
    text,
    when: cond
})

export const TASK_GROUPS: TaskGroup[] = [
    {
        key: "setup",
        title: "Setup",
        hint: "plan for ~10 minutes",
        lines: [
            always(
                "Move the bins to the courts and put each bin under the ref stand. Leave the supply bin where it is."
            ),
            always(
                "For each court, check the volleyballs and inflate as needed (there should be a pump in some/most of the bins)."
            ),
            when(
                "regular_season",
                "Put the clipboard (from the bin) and the score placard (flipper) on the ref stand."
            ),
            when(
                "playoff",
                "Put the clipboard (from the bin) and the score placard (flipper) on the court's table for the work team. Set out two flags there for the line judges."
            ),
            always(
                "If it gets to 7pm and no one is raising the basketball backboards, you may need to ask at the front desk."
            )
        ]
    },
    {
        key: "midway",
        title: "Mid-way",
        hint: "after the final matches are all started",
        lines: [
            always("Move the bins back to where the supply bin is."),
            always(
                "Walk around and collect any loose BSD volleyballs and place them in the bins."
            ),
            when(
                "last_regular_week",
                "Place two flags (from the supply bin) in each bin."
            ),
            always(
                "Pull out new scoresheets from the supply bin accordion folder and leave them on top of the supply bin."
            ),
            when(
                "playoffs_next_week",
                "Pull out the Playoff scoresheets (4 matches) instead."
            )
        ]
    },
    {
        key: "cleanup",
        title: "Cleanup",
        hint: "after all matches are complete",
        lines: [
            always(
                "Walk around and collect all BSD volleyballs and clipboards and flags (if playoffs). As needed, tell people to stop playing pickup."
            ),
            always(
                "Place the volleyballs and two flags (if playoffs) in the bins, ensuring the balls are all decently balanced (new and old)."
            ),
            always(
                "Remove the completed scoresheets, load the next scoresheets that are out, and place a clipboard in each bin."
            ),
            always(
                "If the door to the back was left unlocked (slightly ajar), carry the bins into the back room and put them against the right wall. Otherwise, stack up the bins neatly beside the locked door."
            ),
            always(
                "Walk around the courts and pick up and dispose of any trash / recyclables."
            ),
            always(
                "BRING THE SCORESHEETS WITH YOU. Enter the match results / scores on the BSD website (Court Mgmt → Enter Scores) or else email/text pics of the scoresheets to a director."
            )
        ]
    }
]

type TaskContext = Pick<CoverageDate, "eventType" | "nextEventType">

export function conditionHolds(cond: TaskCondition, ctx: TaskContext): boolean {
    switch (cond) {
        case "regular_season":
            return ctx.eventType === "regular_season"
        case "playoff":
            return ctx.eventType === "playoff"
        case "last_regular_week":
            return (
                ctx.eventType === "regular_season" &&
                ctx.nextEventType === "playoff"
            )
        case "playoffs_next_week":
            return ctx.nextEventType === "playoff"
    }
}

/** The task groups with only the lines that apply to this night. */
export function resolveTaskGroups(ctx: TaskContext): TaskGroup[] {
    return TASK_GROUPS.map((g) => ({
        ...g,
        lines: g.lines.filter(
            (l) => l.when === null || conditionHolds(l.when, ctx)
        )
    }))
}

/** Which task groups fall to one slot of a night. TBD slot: none. */
export function slotTaskKeys(
    day: Pick<CoverageDate, "slots">,
    slot: Pick<CoverageSlot, "startTime">
): TaskGroupKey[] {
    if (slot.startTime === null) return []
    const timed = day.slots.filter((s) => s.startTime !== null)
    if (timed.length === 0) return []
    const index = timed.findIndex((s) => s.startTime === slot.startTime)
    if (index === -1) return []
    const keys: TaskGroupKey[] = []
    if (index === 0) keys.push("setup")
    if (index === Math.max(timed.length - 2, 0)) keys.push("midway")
    if (index === timed.length - 1) keys.push("cleanup")
    return keys
}

/** Resolved task groups for one slot of a night, in setup/midway/cleanup order. */
export function slotTaskGroups(
    day: Pick<CoverageDate, "eventType" | "nextEventType" | "slots">,
    slot: Pick<CoverageSlot, "startTime">
): TaskGroup[] {
    const keys = new Set(slotTaskKeys(day, slot))
    return resolveTaskGroups(day).filter((g) => keys.has(g.key))
}

/** Names of the people who count toward this slot: who the tasks fall to. */
export function slotAssigneeNames(
    slot: Pick<CoverageSlot, "people">
): string[] {
    return slot.people.filter((p) => p.counts).map((p) => p.name)
}
