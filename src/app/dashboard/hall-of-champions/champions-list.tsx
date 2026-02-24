"use client"

import { useMemo, useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"

export interface ChampionListRow {
    id: number
    seasonId: number
    seasonLabel: string
    divisionName: string
    divisionLevel: number
    teamName: string
    captainName: string
    picture: string | null
    picture2: string | null
    caption: string | null
}

export function ChampionsList({ rows }: { rows: ChampionListRow[] }) {
    const [selected, setSelected] = useState<ChampionListRow | null>(null)

    const seasonOrder = useMemo(() => {
        const seasonMap = new Map<number, { label: string; index: number }>()
        for (const row of rows) {
            if (!seasonMap.has(row.seasonId)) {
                seasonMap.set(row.seasonId, {
                    label: row.seasonLabel,
                    index: rows.findIndex((r) => r.seasonId === row.seasonId)
                })
            }
        }
        return [...seasonMap.entries()]
            .map(([seasonId, meta]) => ({
                seasonId,
                seasonLabel: meta.label,
                index: meta.index
            }))
            .sort((a, b) => a.index - b.index)
    }, [rows])

    const championsByKey = useMemo(() => {
        const map = new Map<string, ChampionListRow>()
        for (const row of rows) {
            map.set(`${row.seasonId}::${row.divisionName}`, row)
        }
        return map
    }, [rows])

    const divisionsBySeason = useMemo(() => {
        const map = new Map<number, { name: string; level: number }[]>()
        for (const season of seasonOrder) {
            const seasonDivisions = rows
                .filter((r) => r.seasonId === season.seasonId)
                .map((r) => ({ name: r.divisionName, level: r.divisionLevel }))
                .filter(
                    (d, idx, arr) =>
                        arr.findIndex((x) => x.name === d.name) === idx
                )
                .sort((a, b) => a.level - b.level)
            map.set(season.seasonId, seasonDivisions)
        }
        return map
    }, [rows, seasonOrder])

    const tableGroups = useMemo(() => {
        type Group = {
            divisions: { name: string; level: number }[]
            seasons: { seasonId: number; seasonLabel: string }[]
        }

        const isSubset = (a: Set<string>, b: Set<string>) => {
            for (const item of a) {
                if (!b.has(item)) {
                    return false
                }
            }
            return true
        }

        const groups: Group[] = []

        for (const season of seasonOrder) {
            const seasonDivisions = divisionsBySeason.get(season.seasonId) || []
            const last = groups[groups.length - 1]
            if (last) {
                const lastDivisionNames = new Set(
                    last.divisions.map((d) => d.name)
                )
                const seasonDivisionNames = new Set(
                    seasonDivisions.map((d) => d.name)
                )

                const compatible =
                    isSubset(seasonDivisionNames, lastDivisionNames) ||
                    isSubset(lastDivisionNames, seasonDivisionNames)

                if (compatible) {
                    const mergedDivisionMap = new Map<
                        string,
                        { name: string; level: number }
                    >()

                    for (const division of [
                        ...last.divisions,
                        ...seasonDivisions
                    ]) {
                        const existing = mergedDivisionMap.get(division.name)
                        if (!existing || division.level < existing.level) {
                            mergedDivisionMap.set(division.name, division)
                        }
                    }

                    last.divisions = [...mergedDivisionMap.values()].sort(
                        (a, b) => a.level - b.level
                    )
                    last.seasons.push({
                        seasonId: season.seasonId,
                        seasonLabel: season.seasonLabel
                    })
                    continue
                }
            }

            groups.push({
                divisions: [...seasonDivisions],
                seasons: [
                    {
                        seasonId: season.seasonId,
                        seasonLabel: season.seasonLabel
                    }
                ]
            })
        }

        return groups
    }, [seasonOrder, divisionsBySeason])

    return (
        <>
            <div className="space-y-4">
                {tableGroups.map((group, groupIdx) => (
                    <Card key={`group-${groupIdx}`}>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[900px] text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="w-32 py-2 pr-1 text-left font-medium text-muted-foreground">
                                                Season
                                            </th>
                                            {group.divisions.map((division) => (
                                                <th
                                                    key={`${groupIdx}-${division.name}`}
                                                    className="px-2 py-2 text-left font-medium text-muted-foreground"
                                                >
                                                    {division.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.seasons.map((season) => (
                                            <tr
                                                key={season.seasonId}
                                                className="border-b align-top last:border-0"
                                            >
                                                <td className="py-2 pr-1 font-medium">
                                                    {season.seasonLabel}
                                                </td>
                                                {group.divisions.map(
                                                    (division) => {
                                                        const champion =
                                                            championsByKey.get(
                                                                `${season.seasonId}::${division.name}`
                                                            ) || null

                                                        if (!champion) {
                                                            return (
                                                                <td
                                                                    key={`${season.seasonId}-${division.name}`}
                                                                    className="px-2 py-2 text-muted-foreground"
                                                                >
                                                                    -
                                                                </td>
                                                            )
                                                        }

                                                        return (
                                                            <td
                                                                key={`${season.seasonId}-${division.name}`}
                                                                className="px-2 py-2"
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="text-left font-medium text-primary leading-tight hover:underline disabled:text-muted-foreground disabled:no-underline"
                                                                    onClick={() =>
                                                                        setSelected(
                                                                            champion
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        !champion.picture &&
                                                                        !champion.picture2 &&
                                                                        !champion.caption
                                                                    }
                                                                >
                                                                    {
                                                                        champion.teamName
                                                                    }
                                                                </button>
                                                            </td>
                                                        )
                                                    }
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog
                open={selected !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelected(null)
                    }
                }}
            >
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    {selected ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {selected.seasonLabel}{" "}
                                    {selected.divisionName}
                                </DialogTitle>
                                <DialogDescription>
                                    {selected.teamName} led by{" "}
                                    {selected.captainName}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                {selected.picture ? (
                                    <img
                                        src={selected.picture}
                                        alt={`${selected.seasonLabel} ${selected.divisionName} champions`}
                                        className="w-full rounded-md border object-cover"
                                        loading="lazy"
                                    />
                                ) : null}

                                {selected.caption ? (
                                    <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                                        {selected.caption}
                                    </p>
                                ) : null}

                                {selected.picture2 ? (
                                    <img
                                        src={selected.picture2}
                                        alt={`${selected.seasonLabel} ${selected.divisionName} champions alternate view`}
                                        className="w-full rounded-md border object-cover"
                                        loading="lazy"
                                    />
                                ) : null}

                                {!selected.picture &&
                                !selected.picture2 &&
                                !selected.caption ? (
                                    <p className="text-muted-foreground text-sm">
                                        No media available for this champion.
                                    </p>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    )
}
