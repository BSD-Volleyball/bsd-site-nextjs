"use server"

import {
    isAdminOrDirectorBySession,
    isCommissionerBySession
} from "@/next/session"

export async function getIsAdminOrDirector(): Promise<boolean> {
    return isAdminOrDirectorBySession()
}

export async function getIsCommissioner(): Promise<boolean> {
    return isCommissionerBySession()
}
