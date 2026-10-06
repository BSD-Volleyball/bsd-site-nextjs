import { formatSeasonLabel } from "@/lib/season-utils"
import "server-only"

import { and, eq, isNull, or } from "drizzle-orm"
import { db } from "@/database/db"
import { signups, users } from "@/database/schema"
import {
    type ActionResult,
    ok,
    requirePermission,
    requireSeasonConfig,
    withAction
} from "@/next/action-helpers"
import { formatDisplayName } from "@/lib/utils"

export interface MissingPicturePlayer {
    userId: string
    signupId: number
    displayName: string
    firstName: string
    lastName: string
    preferredName: string | null
    oldId: number | null
}

export const getPlayersNeedingPictures = withAction(
    async (): Promise<
        ActionResult<{
            seasonLabel: string
            players: MissingPicturePlayer[]
        }>
    > => {
        const config = await requireSeasonConfig()
        await requirePermission("pictures:manage", {
            seasonId: config.seasonId
        })

        const seasonLabel = formatSeasonLabel(config)

        const rows = await db
            .select({
                signupId: signups.id,
                userId: users.id,
                firstName: users.first_name,
                lastName: users.last_name,
                preferredName: users.preferred_name,
                oldId: users.old_id
            })
            .from(signups)
            .innerJoin(users, eq(signups.player, users.id))
            .where(
                and(
                    eq(signups.season, config.seasonId),
                    or(isNull(users.picture), eq(users.picture, ""))
                )
            )
            .orderBy(users.last_name, users.first_name)

        return ok({
            seasonLabel,
            players: rows.map((row) => ({
                signupId: row.signupId,
                userId: row.userId,
                firstName: row.firstName,
                lastName: row.lastName,
                preferredName: row.preferredName,
                displayName: formatDisplayName(
                    row.firstName,
                    row.lastName,
                    row.preferredName
                ),
                oldId: row.oldId
            }))
        })
    }
)
