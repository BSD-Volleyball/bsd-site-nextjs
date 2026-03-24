// permissions.ts
// Defines roles, permissions, and the role→permission mapping.
// Roles are stored per-user in the user_roles DB table.
// To add a new role: add it to the Role type and ROLE_PERMISSIONS map.
// No server action changes are needed when adding new roles.

export type Role =
    | "admin"
    | "commissioner"
    | "captain"
    | "court_manager"
    | "ombudsman"
    | "referee"
    | "referee_coordinator"

export type Permission =
    // Season lifecycle
    | "season:control"
    // Player management
    | "player:lookup"
    | "player:edit"
    | "player:merge"
    // Signup management
    | "signups:view"
    | "signups:manage"
    // Team/division management
    | "teams:create"
    | "divisions:create"
    | "commissioners:manage"
    | "captains:select"
    // Draft
    | "draft:read"
    | "draft:manage"
    // Evaluation & rating
    | "players:evaluate"
    | "players:rate"
    // Schedule & scores
    | "schedule:view"
    | "schedule:manage"
    | "scores:enter"
    // Content & admin
    | "pictures:manage"
    | "emails:edit"
    | "audit:view"
    | "google:manage"
    | "attrition:view"
    // Player concerns
    | "concerns:view"
    | "concerns:manage"

// All permissions — used for admin wildcard.
// Keep in sync with the Permission type above.
const ALL_PERMISSIONS: Permission[] = [
    "season:control",
    "player:lookup",
    "player:edit",
    "player:merge",
    "signups:view",
    "signups:manage",
    "teams:create",
    "divisions:create",
    "commissioners:manage",
    "captains:select",
    "draft:read",
    "draft:manage",
    "players:evaluate",
    "players:rate",
    "schedule:view",
    "schedule:manage",
    "scores:enter",
    "pictures:manage",
    "emails:edit",
    "audit:view",
    "google:manage",
    "attrition:view",
    "concerns:view",
    "concerns:manage"
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    // Full system access (consolidates legacy "admin" and "director" roles)
    admin: ALL_PERMISSIONS,

    // Season-scoped: division management, draft, signups, player evaluation
    commissioner: [
        "signups:view",
        "signups:manage",
        "draft:read",
        "draft:manage",
        "players:evaluate",
        "players:rate",
        "captains:select",
        "pictures:manage",
        "player:lookup",
        "teams:create",
        "schedule:view",
        "concerns:view"
    ],

    // Season-scoped: view signups, participate in draft, rate players
    captain: ["signups:view", "draft:read", "draft:manage", "players:rate"],

    // Season-scoped: rate/evaluate players during tryouts, and upload pictures
    court_manager: [
        "players:rate",
        "players:evaluate",
        "player:lookup",
        "signups:view",
        "pictures:manage"
    ],

    // Season-scoped: handle player concerns and disputes
    ombudsman: [
        "concerns:view",
        "concerns:manage",
        "player:lookup",
        "signups:view"
    ],

    // Season-scoped: view schedules, enter match scores
    referee: ["schedule:view", "scores:enter"],

    // Season-scoped: manage referee assignments and schedules
    referee_coordinator: [
        "schedule:view",
        "schedule:manage",
        "scores:enter",
        "player:lookup"
    ]
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

const VALID_ROLES = new Set<string>(Object.keys(ROLE_PERMISSIONS))

export function isValidRole(value: string): value is Role {
    return VALID_ROLES.has(value)
}
