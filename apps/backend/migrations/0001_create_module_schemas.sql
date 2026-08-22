-- Creates one PostgreSQL schema per data-owning module.
--
-- See docs/architecture/architecture-baseline.md, section "Data ownership",
-- and apps/backend/README.md for which module owns which schema. No tables
-- are created here; each schema starts empty and gets its tables from the
-- slice that owns that data.
--
-- Safe to run more than once: CREATE SCHEMA IF NOT EXISTS is a no-op when
-- the schema already exists.

CREATE SCHEMA IF NOT EXISTS market;
CREATE SCHEMA IF NOT EXISTS strategy;
CREATE SCHEMA IF NOT EXISTS experiment;
CREATE SCHEMA IF NOT EXISTS news;
