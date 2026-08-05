/**
 * Shared marker for "this save would destroy data — say so explicitly".
 *
 * Actions that delete rows with cascading dependents refuse the first attempt
 * and end their message with this sentence. Clients match on it to offer a
 * confirmation instead of showing a dead-end error, then retry with
 * `confirmDeletions`. Keeping the string in one place means the two sides
 * cannot drift apart.
 *
 * A "use server" module can only export async functions, so this cannot live
 * beside the actions that use it.
 */
export const CONFIRM_DESTRUCTIVE_SUFFIX = "Confirm the removal to proceed."

/** True when `message` is a destructive-save refusal that the user can override. */
export function isDestructiveConfirmation(message: string): boolean {
    return message.endsWith(CONFIRM_DESTRUCTIVE_SUFFIX)
}
