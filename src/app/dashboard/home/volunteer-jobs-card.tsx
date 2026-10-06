import { RiHandHeartLine } from "@remixicon/react"
import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TryoutVolunteerJob } from "./load-staff"

function JobRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex justify-between gap-2">
            <span className="text-purple-700 dark:text-purple-300">
                {label}
            </span>
            <span className="text-right font-semibold text-purple-800 dark:text-purple-200">
                {children}
            </span>
        </div>
    )
}

export function TryoutVolunteerJobsCard({
    jobs
}: {
    jobs: TryoutVolunteerJob[]
}) {
    return (
        <Card className="min-w-[280px] flex-1 border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <RiHandHeartLine className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <CardTitle className="text-lg text-purple-700 dark:text-purple-300">
                        You're volunteering at tryouts
                    </CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-purple-700 text-sm dark:text-purple-300">
                    Thank you for helping run tryouts! Here
                    {jobs.length === 1 ? "'s your job" : " are your jobs"}:
                </p>
                {jobs.map((job) => (
                    <div
                        key={job.assignmentId}
                        className="space-y-1.5 rounded-md bg-purple-100 p-3 text-sm dark:bg-purple-900"
                    >
                        <JobRow label="Job:">{job.jobName}</JobRow>
                        <JobRow label="Date:">{job.nightLabel}</JobRow>
                        <JobRow label="Time:">{job.timeLabel}</JobRow>
                        {job.courtLabel && (
                            <JobRow label="Where:">{job.courtLabel}</JobRow>
                        )}
                        {job.notes && (
                            <p className="text-purple-600 text-sm dark:text-purple-400">
                                {job.notes}
                            </p>
                        )}
                    </div>
                ))}
                <p className="text-purple-600 text-sm dark:text-purple-400">
                    Please plan to arrive 10 minutes early.
                </p>
            </CardContent>
        </Card>
    )
}
