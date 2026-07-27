// Small dependency-free structured logger.
//
// Production (NODE_ENV === "production"): emits single-line JSON so log
// aggregators can index fields — { level, message, ...context, timestamp }.
// Development: emits readable console output.
//
// Deliberately client-safe (no "server-only" import): client components log
// through this too, and Next.js inlines process.env.NODE_ENV in both bundles.

type LogLevel = "debug" | "info" | "warn" | "error"

export type LogContext = Record<string, unknown>

function serializeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack
        }
    }
    return { message: String(error) }
}

function emit(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
): void {
    if (process.env.NODE_ENV === "production") {
        const entry: Record<string, unknown> = {
            level,
            message,
            ...context,
            ...(error !== undefined ? { error: serializeError(error) } : {}),
            timestamp: new Date().toISOString()
        }
        console[level](JSON.stringify(entry))
        return
    }

    const args: unknown[] = [message]
    if (context && Object.keys(context).length > 0) {
        args.push(context)
    }
    if (error !== undefined) {
        args.push(error)
    }
    console[level](...args)
}

export const logger = {
    debug(message: string, context?: LogContext): void {
        emit("debug", message, context)
    },
    info(message: string, context?: LogContext): void {
        emit("info", message, context)
    },
    warn(message: string, context?: LogContext): void {
        emit("warn", message, context)
    },
    error(message: string, context?: LogContext, error?: unknown): void {
        emit("error", message, context, error)
    }
}
