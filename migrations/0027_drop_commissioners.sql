-- The user_roles table is now the sole authority for commissioner
-- assignments (see scripts/archive/backfill-commissioner-roles.ts for the
-- verified backfill). Drop the legacy table.
DROP TABLE "commissioners";
