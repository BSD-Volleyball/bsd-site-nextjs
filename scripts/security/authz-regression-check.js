#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const repoRoot = process.cwd()
const appRoot = path.join(repoRoot, "src", "app")

const guardPatterns = [
    /getSessionUser\s*\(/,
    /checkAdminAccess\s*\(/,
    /checkViewSignupsAccess\s*\(/,
    /checkAdminOrCommissionerAccess\s*\(/,
    /checkDraftReadAccess\s*\(/,
    /hasDraftPageAccess\s*\(/,
    /isAdminOrDirectorBySession\s*\(/,
    /isCommissionerBySession\s*\(/,
    /hasCaptainPagesAccessBySession\s*\(/,
    /hasPermissionBySession\s*\(/,
    /requireAdmin\s*\(/,
    /requireSession\s*\(/,
    /requireCaptainAccess\s*\(/,
    /requirePermission\s*\(/,
    /requireAnyPermission\s*\(/
]

// Server actions intentionally callable without authorization. Empty today —
// keep it that way unless a public endpoint is a deliberate product decision.
const publicAllowlist = new Set([])

// data.ts loaders that take the caller's identity as an argument (the page
// resolved the session and passes session.user.id), like src/lib functions.
// They are not endpoints; the page's guard is the access check.
const callerAuthenticatedLoaders = new Set([
    "src/app/dashboard/friends/data.ts:getFriendsPageData",
    "src/app/dashboard/tournament-team/data.ts:loadTeamForCaptain"
])

// data.ts internals exported only so a sibling actions file can share them.
// They are not loaders: every caller (a guarded loader in the same data.ts or
// a guarded server action) has already run its access check.
const sharedDataHelpers = new Set([
    "src/app/dashboard/season-config/data.ts:countUnavailablePlayersByEvent"
])

const strictExpectations = [
    {
        key: "src/app/dashboard/view-signups/data.ts:getSignupsData",
        pattern: /hasCaptainPagesAccessBySession\s*\(/,
        description: "must gate access via hasCaptainPagesAccessBySession"
    },
    {
        key: "src/app/dashboard/player-lookup/data.ts:getPlayersForLookup",
        pattern: /isCommissionerBySession\s*\(/,
        description: "must gate access via isCommissionerBySession"
    },
    {
        key: "src/app/dashboard/player-lookup/actions.ts:getPlayerDetails",
        pattern: /isCommissionerBySession\s*\(/,
        description: "must gate access via isCommissionerBySession"
    },
    {
        key: "src/app/dashboard/rosters/[seasonId]/data.ts:getRosterData",
        pattern: /requireSession\s*\(/,
        description: "must require an authenticated session via requireSession"
    },
    {
        key: "src/app/dashboard/schedule/[seasonId]/data.ts:getSeasonScheduleData",
        pattern: /requireSession\s*\(/,
        description: "must require an authenticated session via requireSession"
    },
    {
        key: "src/app/dashboard/playoffs/[seasonId]/data.ts:getPlayoffData",
        pattern: /requireSession\s*\(/,
        description: "must require an authenticated session via requireSession"
    },
    {
        key: "src/app/dashboard/edit-player/actions.ts:updateUser",
        pattern: /invalidateAllSessionsForUser\s*\(/,
        description: "must invalidate sessions when privilege changes occur"
    },
    // Ownership/scope checks a session guard alone would not catch. Each one
    // closed a real hole; keep them from being refactored away.
    {
        key: "src/app/dashboard/team-availability/find-sub-actions.ts:getSubContactDetails",
        pattern: /await\s+isSubContactTarget\s*\(/,
        description:
            "must limit contact details to actual sub candidates (isSubContactTarget)"
    },
    {
        key: "src/app/dashboard/pay-season/actions.ts:submitSeasonPayment",
        pattern: /await\s+validateFinalSignupAvailability\s*\(/,
        description:
            "must check the registration window and capacity before charging"
    },
    {
        key: "src/app/dashboard/pay-season/actions.ts:submitFreeSignup",
        pattern: /await\s+validateFinalSignupAvailability\s*\(/,
        description: "must check the registration window and capacity"
    },
    {
        key: "src/app/dashboard/send-email/actions.ts:createAndSendBroadcast",
        pattern: /await\s+commissionerTargetError\s*\(/,
        description: "must scope commissioner sends to their own divisions"
    },
    {
        key: "src/app/dashboard/send-email/actions.ts:previewBroadcast",
        pattern: /await\s+commissionerTargetError\s*\(/,
        description: "must scope commissioner previews to their own divisions"
    }
]

// A file is scanned when it is named *actions.ts, data.ts or *-data.ts, OR
// when its content starts with a "use server" directive (server actions can
// live in any filename).
function isServerActionFile(fullPath, name) {
    if (name.endsWith("actions.ts")) return true
    // Server-only data loaders (data.ts, or foo-data.ts beside foo-actions.ts)
    // are not endpoints, but they are the reads pages render from; their
    // exported functions must still guard access, so they are held to the
    // same rule.
    if (name === "data.ts" || name.endsWith("-data.ts")) return true
    if (!name.endsWith(".ts")) return false
    const content = fs.readFileSync(fullPath, "utf8")
    return /^["']use server["']/.test(content.trimStart())
}

function walk(dir, accumulator = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walk(fullPath, accumulator)
            continue
        }
        if (entry.isFile() && isServerActionFile(fullPath, entry.name)) {
            accumulator.push(fullPath)
        }
    }
    return accumulator
}

function toRepoRelative(filePath) {
    return path.relative(repoRoot, filePath).split(path.sep).join("/")
}

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(
            /(^|[^:"'`\\])\/\/[^\n]*/g,
            (m, lead) => lead + " ".repeat(m.length - lead.length)
        )
}

function getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length
}

function extractExportedAsyncFunctions(content) {
    const asyncFnRegex = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g
    const withActionRegex =
        /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*withAction\s*(?:<[^>]*>)?\s*\(/g
    const matches = [
        ...content.matchAll(asyncFnRegex),
        ...content.matchAll(withActionRegex)
    ]
        .map((match) => ({
            name: match[1],
            start: match.index ?? 0
        }))
        .sort((a, b) => a.start - b.start)

    // A block ends at the next top-level declaration of any kind, not just
    // the next export: otherwise a helper defined below an action (and any
    // guard call inside it) would be credited to the action.
    const declarationStarts = [
        ...content.matchAll(
            /^(?:export\s+)?(?:async\s+function|function|const|let|type|interface|class)\b/gm
        )
    ].map((match) => match.index ?? 0)

    const functions = []
    for (const current of matches) {
        const end =
            declarationStarts.find((start) => start > current.start) ??
            content.length
        functions.push({ name: current.name, start: current.start, end })
    }

    return functions
}

function main() {
    const actionFiles = walk(appRoot)
    const failures = []
    const functionBlocks = new Map()

    for (const filePath of actionFiles) {
        const relPath = toRepoRelative(filePath)
        // Comments are blanked (same length, so line numbers hold): a guard
        // that is only mentioned in a comment must not count as a guard.
        const content = stripComments(fs.readFileSync(filePath, "utf8"))
        const functions = extractExportedAsyncFunctions(content)

        for (const fn of functions) {
            const block = content.slice(fn.start, fn.end)
            const key = `${relPath}:${fn.name}`
            const line = getLineNumber(content, fn.start)
            functionBlocks.set(key, { block, relPath, line, fnName: fn.name })

            if (
                publicAllowlist.has(key) ||
                callerAuthenticatedLoaders.has(key) ||
                sharedDataHelpers.has(key)
            ) {
                continue
            }

            const hasGuard = guardPatterns.some((pattern) =>
                pattern.test(block)
            )
            if (!hasGuard) {
                failures.push(
                    `${key}:${line} missing access guard (expected session/role/scope check near function entry)`
                )
            }
        }
    }

    for (const expectation of strictExpectations) {
        const entry = functionBlocks.get(expectation.key)
        if (!entry) {
            failures.push(
                `${expectation.key} missing from source (strict expectation target not found)`
            )
            continue
        }

        if (!expectation.pattern.test(entry.block)) {
            failures.push(
                `${expectation.key}:${entry.line} ${expectation.description}`
            )
        }
    }

    if (failures.length > 0) {
        console.error("Authorization regression check failed:")
        for (const failure of failures) {
            console.error(`- ${failure}`)
        }
        process.exit(1)
    }

    console.log(
        `Authorization regression check passed (${functionBlocks.size} exported server actions scanned).`
    )
}

main()
