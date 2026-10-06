import "server-only"

import { logger } from "@/lib/logger"
import type { ActionResult } from "@/next/action-helpers"
import { withAction, ok, fail } from "@/next/action-helpers"
import { db } from "@/database/db"
import { users, signups } from "@/database/schema"
import { and, eq, inArray, ne, or, sql } from "drizzle-orm"
import { isAdminOrDirectorBySession } from "@/next/session"
import { getSeasonConfig } from "@/lib/site-config"

export interface GoogleMembershipUser {
    id: string
    oldId: number | null
    firstName: string
    lastName: string
    preferredName: string | null
    email: string
    seasonsList: string
    notificationList: string
}

export const getGoogleMembershipUsers = withAction(
    async (params?: {
        query?: string
        page?: number
        limit?: number
        filter?: "notification" | "season" | ""
    }): Promise<
        ActionResult<{
            users: GoogleMembershipUser[]
            total: number
            page: number
            limit: number
            totalPages: number
            query: string
            filter: string
        }>
    > => {
        const hasAccess = await isAdminOrDirectorBySession()
        if (!hasAccess) {
            return fail("Unauthorized")
        }

        try {
            const query = params?.query?.trim() ?? ""
            const filter = params?.filter ?? ""
            const normalizedPage =
                Number.isInteger(params?.page) && (params?.page ?? 0) > 0
                    ? (params?.page as number)
                    : 1
            const normalizedLimit =
                Number.isInteger(params?.limit) && (params?.limit ?? 0) > 0
                    ? Math.min(params?.limit as number, 200)
                    : 50

            const searchCondition =
                query.length >= 2
                    ? or(
                          sql`CAST(${users.old_id} AS TEXT) LIKE ${`%${query}%`}`,
                          sql`LOWER(${users.first_name}) LIKE ${`%${query.toLowerCase()}%`}`,
                          sql`LOWER(${users.last_name}) LIKE ${`%${query.toLowerCase()}%`}`,
                          sql`LOWER(${users.preferred_name}) LIKE ${`%${query.toLowerCase()}%`}`,
                          sql`LOWER(${users.email}) LIKE ${`%${query.toLowerCase()}%`}`
                      )
                    : undefined

            let filterCondition: ReturnType<typeof and> | undefined

            if (filter === "notification") {
                filterCondition = ne(users.notification_list, "Y")
            } else if (filter === "season") {
                const config = await getSeasonConfig()
                const currentSeasonId = config.seasonId

                const signedUpUserIds = currentSeasonId
                    ? (
                          await db
                              .select({ player: signups.player })
                              .from(signups)
                              .where(eq(signups.season, currentSeasonId))
                      ).map((r) => r.player)
                    : []

                if (signedUpUserIds.length === 0) {
                    return ok({
                        users: [],
                        total: 0,
                        page: 1,
                        limit: normalizedLimit,
                        totalPages: 1,
                        query,
                        filter
                    })
                }

                filterCondition = and(
                    inArray(users.id, signedUpUserIds),
                    ne(users.seasons_list, "Y")
                )
            }

            const whereClause =
                searchCondition && filterCondition
                    ? and(searchCondition, filterCondition)
                    : searchCondition
                      ? searchCondition
                      : filterCondition
                        ? filterCondition
                        : undefined

            const [countResult] = whereClause
                ? await db
                      .select({ count: sql<number>`count(*)` })
                      .from(users)
                      .where(whereClause)
                : await db.select({ count: sql<number>`count(*)` }).from(users)

            const total = Number(countResult.count)
            const totalPages = Math.max(1, Math.ceil(total / normalizedLimit))
            const effectivePage = Math.min(normalizedPage, totalPages)
            const offset = (effectivePage - 1) * normalizedLimit

            const allUsers = whereClause
                ? await db
                      .select({
                          id: users.id,
                          oldId: users.old_id,
                          firstName: users.first_name,
                          lastName: users.last_name,
                          preferredName: users.preferred_name,
                          email: users.email,
                          seasonsList: users.seasons_list,
                          notificationList: users.notification_list
                      })
                      .from(users)
                      .where(whereClause)
                      .orderBy(users.last_name, users.first_name)
                      .limit(normalizedLimit)
                      .offset(offset)
                : await db
                      .select({
                          id: users.id,
                          oldId: users.old_id,
                          firstName: users.first_name,
                          lastName: users.last_name,
                          preferredName: users.preferred_name,
                          email: users.email,
                          seasonsList: users.seasons_list,
                          notificationList: users.notification_list
                      })
                      .from(users)
                      .orderBy(users.last_name, users.first_name)
                      .limit(normalizedLimit)
                      .offset(offset)

            return ok({
                users: allUsers,
                total,
                page: effectivePage,
                limit: normalizedLimit,
                totalPages,
                query,
                filter
            })
        } catch (error) {
            logger.error(
                "Error loading Google Membership users",
                undefined,
                error
            )
            return fail("Failed to load users.")
        }
    }
)
