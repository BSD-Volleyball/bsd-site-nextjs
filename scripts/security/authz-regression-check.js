#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const repoRoot = process.cwd()
const appRoot = path.join(repoRoot, "src", "app")

const guardPatterns = [
    /auth\.api\.getSession\s*\(/,
    /checkAdminAccess\s*\(/,
    /checkViewSignupsAccess\s*\(/,
    /checkAdminOrCommissionerAccess\s*\(/,
    /getIsAdminOrDirector\s*\(/,
    /getIsCommissioner\s*\(/,
    /getHasAdministrativeAccess\s*\(/,
    /isAdminOrDirectorBySession\s*\(/,
    /isCommissionerBySession\s*\(/,
    /hasAdministrativeAccessBySession\s*\(/,
    /hasViewSignupsAccessBySession\s*\(/
]

const publicAllowlist = new Set([
    "src/app/dashboard/pay-season/actions.ts:fetchSeasonConfig",
    "src/app/dashboard/pay-season/actions.ts:getUsers"
])

const strictExpectations = [
    {
        key: "src/app/dashboard/view-signups/actions.ts:getSignupsData",
        pattern: /checkViewSignupsAccess\s*\(/,
        description: "must gate access via checkViewSignupsAccess"
    },
    {
        key: "src/app/dashboard/player-lookup/actions.ts:getPlayersForLookup",
        pattern: /checkAdminOrCommissionerAccess\s*\(/,
        description: "must gate access via checkAdminOrCommissionerAccess"
    },
    {
        key: "src/app/dashboard/player-lookup/actions.ts:getPlayerDetails",
        pattern: /checkAdminOrCommissionerAccess\s*\(/,
        description: "must gate access via checkAdminOrCommissionerAccess"
    },
    {
        key: "src/app/dashboard/rosters/[seasonId]/actions.ts:getRosterData",
        pattern: /auth\.api\.getSession\s*\(/,
        description: "must require an authenticated session"
    },
    {
        key: "src/app/dashboard/schedule/[seasonId]/actions.ts:getSeasonScheduleData",
        pattern: /auth\.api\.getSession\s*\(/,
        description: "must require an authenticated session"
    },
    {
        key: "src/app/dashboard/playoffs/[seasonId]/actions.ts:getPlayoffData",
        pattern: /auth\.api\.getSession\s*\(/,
        description: "must require an authenticated session"
    },
    {
        key: "src/app/dashboard/edit-player/actions.ts:updateUser",
        pattern: /invalidateAllSessionsForUser\s*\(/,
        description: "must invalidate sessions when privilege changes occur"
    }
]

function walk(dir, accumulator = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walk(fullPath, accumulator)
            continue
        }
        if (entry.isFile() && entry.name === "actions.ts") {
            accumulator.push(fullPath)
        }
    }
    return accumulator
}

function toRepoRelative(filePath) {
    return path.relative(repoRoot, filePath).split(path.sep).join("/")
}

function getLineNumber(content, index) {
    return content.slice(0, index).split("\n").length
}

function extractExportedAsyncFunctions(content) {
    const regex = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g
    const matches = [...content.matchAll(regex)].map((match) => ({
        name: match[1],
        start: match.index ?? 0
    }))

    const functions = []
    for (let i = 0; i < matches.length; i++) {
        const current = matches[i]
        const next = matches[i + 1]
        functions.push({
            name: current.name,
            start: current.start,
            end: next ? next.start : content.length
        })
    }

    return functions
}

function main() {
    const actionFiles = walk(appRoot)
    const failures = []
    const functionBlocks = new Map()

    for (const filePath of actionFiles) {
        const relPath = toRepoRelative(filePath)
        const content = fs.readFileSync(filePath, "utf8")
        const functions = extractExportedAsyncFunctions(content)

        for (const fn of functions) {
            const block = content.slice(fn.start, fn.end)
            const key = `${relPath}:${fn.name}`
            const line = getLineNumber(content, fn.start)
            functionBlocks.set(key, { block, relPath, line, fnName: fn.name })

            if (publicAllowlist.has(key)) {
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
