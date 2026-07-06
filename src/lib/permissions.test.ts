import { describe, expect, it } from "vitest"
import {
    isValidRole,
    ROLE_PERMISSIONS,
    type Permission,
    type Role
} from "@/lib/permissions"

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as Role[]

describe("ROLE_PERMISSIONS", () => {
    it("gives admin every permission except the ombudsman-only concern permissions", () => {
        const adminPermissions = new Set(ROLE_PERMISSIONS.admin)

        expect(adminPermissions.has("concerns:view")).toBe(false)
        expect(adminPermissions.has("concerns:manage")).toBe(false)

        // Admin must hold every permission granted to any non-ombudsman role
        for (const role of ALL_ROLES) {
            if (role === "ombudsman") continue
            for (const permission of ROLE_PERMISSIONS[role]) {
                expect(
                    adminPermissions.has(permission),
                    `admin should include ${role}'s ${permission}`
                ).toBe(true)
            }
        }
    })

    it("restricts concern permissions to the ombudsman role only", () => {
        const concernPermissions: Permission[] = [
            "concerns:view",
            "concerns:manage"
        ]
        for (const role of ALL_ROLES) {
            const hasConcerns = concernPermissions.some((p) =>
                ROLE_PERMISSIONS[role].includes(p)
            )
            expect(hasConcerns, `${role} concern access`).toBe(
                role === "ombudsman"
            )
        }
    })

    it("keeps privileged season controls away from non-admin roles", () => {
        for (const role of ALL_ROLES) {
            if (role === "admin") continue
            expect(ROLE_PERMISSIONS[role]).not.toContain("season:control")
            expect(ROLE_PERMISSIONS[role]).not.toContain("player:merge")
            expect(ROLE_PERMISSIONS[role]).not.toContain("audit:view")
        }
    })

    it("limits referees to schedule viewing and score entry", () => {
        expect(ROLE_PERMISSIONS.referee).toEqual([
            "schedule:view",
            "scores:enter"
        ])
    })

    it("grants schedule:manage to referee coordinators but not referees", () => {
        expect(ROLE_PERMISSIONS.referee_coordinator).toContain(
            "schedule:manage"
        )
        expect(ROLE_PERMISSIONS.referee).not.toContain("schedule:manage")
    })

    it("lets captains read the draft but not manage signups", () => {
        expect(ROLE_PERMISSIONS.captain).toContain("draft:read")
        expect(ROLE_PERMISSIONS.captain).toContain("signups:view")
        expect(ROLE_PERMISSIONS.captain).not.toContain("signups:manage")
    })

    it("has no duplicate permissions within any role", () => {
        for (const role of ALL_ROLES) {
            const permissions = ROLE_PERMISSIONS[role]
            expect(new Set(permissions).size).toBe(permissions.length)
        }
    })
})

describe("isValidRole", () => {
    it("accepts every defined role", () => {
        for (const role of ALL_ROLES) {
            expect(isValidRole(role)).toBe(true)
        }
    })

    it("rejects the removed legacy director role", () => {
        expect(isValidRole("director")).toBe(false)
    })

    it("rejects unknown, empty, and case-mismatched values", () => {
        expect(isValidRole("superuser")).toBe(false)
        expect(isValidRole("")).toBe(false)
        expect(isValidRole("Admin")).toBe(false)
        expect(isValidRole("ADMIN")).toBe(false)
    })
})
