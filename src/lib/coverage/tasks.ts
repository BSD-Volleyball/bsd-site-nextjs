/**
 * tasks.ts — the gym jobs attached to each coverage slot, shared by the
 * Coverage page and the digest email. Pure: no server imports.
 *
 * Setup belongs to the first timed slot, mid-way and cleanup to the last
 * (mid-way starts once the final matches are under way). A single-slot night
 * carries all three. The TBD slot never carries tasks.
 */

import type { CoverageDate, CoverageSlot } from "./types"

export type TaskGroupKey = "setup" | "midway" | "cleanup"

export interface TaskGroup {
    key: TaskGroupKey
    title: string
    /** Shown after the title, e.g. "plan for ~10 minutes". */
    hint: string | null
    items: string[]
}

type TaskContext = Pick<CoverageDate, "eventType" | "nextEventType">

function setupTasks(ctx: TaskContext): TaskGroup {
    const items = [
        "Move the bins to the courts and put each bin under the ref stand. Leave the supply bin where it is.",
        "For each court, check the volleyballs and inflate as needed (there should be a pump in some/most of the bins)."
    ]
    if (ctx.eventType === "playoff") {
        items.push(
            "Put the clipboard (from the bin) and the score placard (flipper) on the court's table for the work team. Set out two flags there for the line judges."
        )
    } else {
        items.push(
            "Put the clipboard (from the bin) and the score placard (flipper) on the ref stand."
        )
    }
    items.push(
        "If it gets to 7pm and no one is raising the basketball backboards, you may need to ask at the front desk."
    )
    return { key: "setup", title: "Setup", hint: "plan for ~10 minutes", items }
}

function midwayTasks(ctx: TaskContext): TaskGroup {
    const items = [
        "Move the bins back to where the supply bin is.",
        "Walk around and collect any loose BSD volleyballs and place them in the bins."
    ]
    if (ctx.eventType === "regular_season" && ctx.nextEventType === "playoff") {
        items.push(
            "Last week of the regular season: place two flags (from the supply bin) in each bin."
        )
    }
    if (ctx.nextEventType === "playoff") {
        items.push(
            "Playoffs next week: pull out the Playoff scoresheets (4 matches) from the supply bin accordion folder and leave them on top of the supply bin."
        )
    } else if (ctx.nextEventType === "regular_season") {
        items.push(
            "Pull out new scoresheets from the supply bin accordion folder and leave them on top of the supply bin."
        )
    }
    return {
        key: "midway",
        title: "Mid-way",
        hint: "after the final matches are all started",
        items
    }
}

function cleanupTasks(ctx: TaskContext): TaskGroup {
    const playoff = ctx.eventType === "playoff"
    const hasNext = ctx.nextEventType !== null
    return {
        key: "cleanup",
        title: "Cleanup",
        hint: "after all matches are complete",
        items: [
            `Walk around and collect all BSD volleyballs and clipboards${playoff ? " and flags" : ""}. As needed, tell people to stop playing pickup.`,
            `Place the volleyballs${playoff ? " and two flags" : ""} in the bins, ensuring the balls are all decently balanced (new and old).`,
            `Remove the completed scoresheets${hasNext ? ", load the next scoresheets that are out," : ""} and place a clipboard in each bin.`,
            "If the door to the back was left unlocked (slightly ajar), carry the bins into the back room and put them against the right wall. Otherwise, stack up the bins neatly beside the locked door.",
            "Walk around the courts and pick up and dispose of any trash / recyclables.",
            "BRING THE SCORESHEETS WITH YOU. Enter the match results / scores on the BSD website (Court Mgmt → Enter Scores) or else email/text pics of the scoresheets to a director."
        ]
    }
}

/**
 * Task groups for one slot of a night. `slot` must be one of `day.slots`;
 * the TBD slot (null start time) gets none.
 */
export function slotTaskGroups(
    day: Pick<CoverageDate, "eventType" | "nextEventType" | "slots">,
    slot: Pick<CoverageSlot, "startTime">
): TaskGroup[] {
    if (slot.startTime === null) return []
    const timed = day.slots.filter((s) => s.startTime !== null)
    if (timed.length === 0) return []
    const groups: TaskGroup[] = []
    if (timed[0].startTime === slot.startTime) groups.push(setupTasks(day))
    if (timed[timed.length - 1].startTime === slot.startTime) {
        groups.push(midwayTasks(day), cleanupTasks(day))
    }
    return groups
}

/** Names of the people who count toward this slot: who the tasks fall to. */
export function slotAssigneeNames(
    slot: Pick<CoverageSlot, "people">
): string[] {
    return slot.people.filter((p) => p.counts).map((p) => p.name)
}
