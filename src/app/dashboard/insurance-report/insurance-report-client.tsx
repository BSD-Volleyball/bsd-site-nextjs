"use client"

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { StatusBanner } from "@/components/ui/status-banner"
import { useEffect, useState } from "react"
import { getInsuranceReport } from "./actions"
import type { InsuranceGroup } from "./report-logic"

interface InsuranceReportClientProps {
    years: number[]
    defaultYear: number
}

export function InsuranceReportClient({
    years,
    defaultYear
}: InsuranceReportClientProps) {
    const [selectedYear, setSelectedYear] = useState<string>(
        String(defaultYear)
    )
    const [groups, setGroups] = useState<InsuranceGroup[]>([])
    const [loading, setLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState("")

    useEffect(() => {
        let active = true
        setLoading(true)
        setErrorMessage("")

        getInsuranceReport(Number(selectedYear))
            .then((result) => {
                if (!active) return
                if (result.status) {
                    setGroups(result.data.groups)
                } else {
                    setErrorMessage(result.message)
                    setGroups([])
                }
            })
            .finally(() => {
                if (active) setLoading(false)
            })

        return () => {
            active = false
        }
    }, [selectedYear])

    const grandTotal = groups.reduce((sum, group) => sum + group.total, 0)

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="w-40">
                    <label
                        htmlFor="insurance-year"
                        className="mb-1 block font-medium text-muted-foreground text-sm"
                    >
                        Calendar year
                    </label>
                    <Select
                        value={selectedYear}
                        onValueChange={setSelectedYear}
                    >
                        <SelectTrigger id="insurance-year">
                            <SelectValue placeholder="Select year" />
                        </SelectTrigger>
                        <SelectContent>
                            {years.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                    {year}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {!loading && !errorMessage && (
                    <div className="text-right">
                        <div className="font-semibold text-2xl">
                            {grandTotal}
                        </div>
                        <div className="text-muted-foreground text-sm">
                            total players in {selectedYear}
                        </div>
                    </div>
                )}
            </div>

            {errorMessage && (
                <StatusBanner variant="error">{errorMessage}</StatusBanner>
            )}

            {loading && (
                <p className="text-muted-foreground">Loading report…</p>
            )}

            {!loading && !errorMessage && (
                <Accordion type="multiple" className="w-full">
                    {groups.map((group) => (
                        <AccordionItem key={group.value} value={group.value}>
                            <AccordionTrigger>
                                <span className="flex items-center gap-3">
                                    <span className="font-semibold text-base text-foreground">
                                        {group.label}
                                    </span>
                                    <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-sm">
                                        {group.total}
                                    </span>
                                </span>
                            </AccordionTrigger>
                            <AccordionContent>
                                {group.users.length === 0 ? (
                                    <p className="text-muted-foreground">
                                        No players in this age group for{" "}
                                        {selectedYear}.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-border">
                                        {group.users.map((user) => (
                                            <li
                                                key={user.userId}
                                                className="flex flex-col gap-1 py-2 sm:flex-row sm:items-baseline sm:justify-between"
                                            >
                                                <span className="font-medium text-foreground">
                                                    {user.name}
                                                </span>
                                                <span className="text-muted-foreground text-sm sm:text-right">
                                                    {user.events.join(", ")}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}
        </div>
    )
}
