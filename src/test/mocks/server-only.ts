// Empty stand-in for the "server-only" package under Vitest.
// The real package throws when imported outside a React Server Components
// bundle; tests run in plain Node, so it is aliased to this no-op module.
export {}
