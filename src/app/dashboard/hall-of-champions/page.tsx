import type { Metadata } from "next"
import { asc, desc, eq } from "drizzle-orm"
import { PageHeader } from "@/components/layout/page-header"
import { db } from "@/database/db"
import { champions, divisions, seasons, teams, users } from "@/database/schema"
import { ChampionsList, type ChampionListRow } from "./champions-list"

export const metadata: Metadata = {
    title: "Andrea's Hall of Champions"
}

interface ChampionRow {
    id: number
    seasonId: number
    seasonYear: number
    seasonName: string
    divisionName: string
    divisionLevel: number
    captainFirstName: string
    captainLastName: string
    captainPreferredName: string | null
    teamName: string
    picture: string | null
    picture2: string | null
    caption: string | null
}

async function getChampions(): Promise<ChampionRow[]> {
    return await db
        .select({
            id: champions.id,
            seasonId: seasons.id,
            seasonYear: seasons.year,
            seasonName: seasons.season,
            divisionName: divisions.name,
            divisionLevel: divisions.level,
            captainFirstName: users.first_name,
            captainLastName: users.last_name,
            captainPreferredName: users.preffered_name,
            teamName: teams.name,
            picture: champions.picture,
            picture2: champions.picture2,
            caption: champions.caption
        })
        .from(champions)
        .innerJoin(seasons, eq(champions.season, seasons.id))
        .innerJoin(divisions, eq(champions.division, divisions.id))
        .innerJoin(teams, eq(champions.team, teams.id))
        .innerJoin(users, eq(teams.captain, users.id))
        .orderBy(desc(seasons.year), desc(seasons.id), asc(divisions.level))
}

function formatSeasonLabel(season: string, year: number): string {
    return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`
}

export default async function HallOfChampionsPage() {
    const rows = await getChampions()
    const listRows: ChampionListRow[] = rows.map((row) => ({
        id: row.id,
        seasonId: row.seasonId,
        seasonLabel: formatSeasonLabel(row.seasonName, row.seasonYear),
        divisionName: row.divisionName,
        divisionLevel: row.divisionLevel,
        teamName: row.teamName,
        captainName: `${row.captainPreferredName || row.captainFirstName} ${row.captainLastName}`,
        picture: row.picture,
        picture2: row.picture2,
        caption: row.caption
    }))

    return (
        <div className="space-y-6">
            <PageHeader
                title="Andrea's Hall of Champions"
                description="Past division champions across BSD seasons. In honor of BSD co-founder Andrea Stump."
            />

            {rows.length === 0 ? (
                <div className="rounded-md bg-muted p-8 text-center text-muted-foreground">
                    No champions have been recorded yet.
                </div>
            ) : (
                <ChampionsList rows={listRows} />
            )}
        </div>
    )
}
