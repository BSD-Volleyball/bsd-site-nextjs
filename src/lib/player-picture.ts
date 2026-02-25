export const PLAYER_PICTURE_OBJECT_PREFIX = "playerpics"

interface PlayerPictureIdentity {
    old_id: number | null
    first_name: string
    last_name: string
}

function getInitial(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) {
        return ""
    }
    return trimmed.charAt(0).toUpperCase()
}

export function getExpectedPlayerPictureFilename(
    user: PlayerPictureIdentity
): string | null {
    if (!user.old_id || user.old_id <= 0) {
        return null
    }

    const firstInitial = getInitial(user.first_name)
    const lastInitial = getInitial(user.last_name)

    if (!firstInitial || !lastInitial) {
        return null
    }

    return `${user.old_id}_${firstInitial}${lastInitial}.jpg`
}

export function getPlayerPictureObjectKey(filename: string): string {
    return `${PLAYER_PICTURE_OBJECT_PREFIX}/${filename}`
}

export function getPlayerPictureDbPath(filename: string): string {
    return `/${getPlayerPictureObjectKey(filename)}`
}
