"use server"

import { checkSignupEligibility } from "@/lib/site-config"
import { getSeasonConfig } from "@/lib/site-config"
import {
    getSessionUser,
    isAdminOrDirectorBySession,
    isCommissionerBySession,
    hasCaptainPagesAccessBySession,
    hasPermissionBySession
} from "@/lib/rbac"
import type { SeasonPhase } from "@/lib/season-phases"

export async function getSignupEligibility(): Promise<boolean> {
    const user = await getSessionUser()

    if (!user) {
        return false
    }

    return checkSignupEligibility(user.id)
}

export async function getIsAdminOrDirector(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

export async function getIsCommissioner(): Promise<boolean> {
    return isCommissionerBySession()
}

export async function getHasCaptainPagesAccess(): Promise<boolean> {
    return hasCaptainPagesAccessBySession()
}

export async function getHasPicturesAccess(): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return hasPermissionBySession("pictures:manage", {
        seasonId: config.seasonId
    })
}

export async function getHasConcernsAccess(): Promise<boolean> {
    const config = await getSeasonConfig()
    if (!config.seasonId) return false
    return hasPermissionBySession("concerns:view", {
        seasonId: config.seasonId
    })
}

export async function getSeasonPhase(): Promise<SeasonPhase | null> {
    const user = await getSessionUser()
    if (!user) return null

    const config = await getSeasonConfig()
    if (!config.seasonId) return null
    return config.phase
}
