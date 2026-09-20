/**
 * questions-for-survey.ts — which template questions one survey instance asks,
 * and where that instance sits on a trend line.
 *
 * A survey freezes its question list at publish (`question_ids`), so a
 * question archived afterwards still renders for the instances that asked it,
 * and a question added afterwards starts a new trend instead of appearing
 * retroactively. A draft has no snapshot yet and simply shows the live
 * template.
 *
 * Pure and client-safe.
 */

import { seasonRecencyKey } from "@/lib/season-utils"
import type { SurveyQuestionDef } from "./types"

/**
 * The questions a survey asks: the active template questions while it is a
 * draft (`questionIds === null`), otherwise exactly the snapshotted ids —
 * archived ones included, later additions left out. Always in sortOrder.
 */
export function questionsForSurvey(
    survey: { questionIds: number[] | null },
    templateQuestions: SurveyQuestionDef[]
): SurveyQuestionDef[] {
    const snapshot = survey.questionIds
    const selected =
        snapshot === null
            ? templateQuestions.filter(
                  (question) => question.archivedAt === null
              )
            : templateQuestions.filter((question) =>
                  snapshot.includes(question.id)
              )

    return [...selected].sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Sortable key placing one survey instance on a trend's x-axis. A season is
 * the better anchor (a fall survey published in January is still the fall
 * one), so it wins; otherwise the publish month orders the instance, and an
 * instance with neither sorts first.
 */
export function seriesOrderKey(instance: {
    seasonYear: number | null
    seasonName: string | null
    publishedAt: Date | null
}): number {
    if (instance.seasonYear !== null && instance.seasonName !== null) {
        return seasonRecencyKey(instance.seasonYear, instance.seasonName)
    }
    if (instance.publishedAt) {
        return (
            instance.publishedAt.getFullYear() * 12 +
            (instance.publishedAt.getMonth() + 1)
        )
    }
    return 0
}
