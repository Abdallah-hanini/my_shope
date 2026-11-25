-- Phase 0 foundation migration (reviewed SQL).
-- Creates extensions required by docs/DATA.md and empty domain schemas. No tables, no data.
-- Safe to re-run: every statement is idempotent.

-- gen_random_uuid() for UUID primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Trigram indexes for fuzzy SKU / OEM / customer search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Postgres schemas by domain (docs/ARCHITECTURE.md). Tables are added in later phases.
CREATE SCHEMA IF NOT EXISTS platform;    -- outbox, audit, feature flags, report runs
CREATE SCHEMA IF NOT EXISTS iam;         -- users, roles, permissions, scopes
CREATE SCHEMA IF NOT EXISTS org;         -- companies, branches, warehouses, cost centers
CREATE SCHEMA IF NOT EXISTS accounting;  -- chart, periods, journals
CREATE SCHEMA IF NOT EXISTS inventory;   -- catalog, stock ledger, reservations, cost layers
CREATE SCHEMA IF NOT EXISTS procurement; -- suppliers, POs, receipts
CREATE SCHEMA IF NOT EXISTS sales;       -- POS, orders, invoices, payments
CREATE SCHEMA IF NOT EXISTS workshop;    -- vehicles, bookings, job cards, QC
CREATE SCHEMA IF NOT EXISTS hr;          -- employees, attendance, payroll
CREATE SCHEMA IF NOT EXISTS crm;         -- contacts, leads, campaigns, complaints
CREATE SCHEMA IF NOT EXISTS reporting;   -- canonical views and summary tables (docs/REPORTING.md)

COMMENT ON SCHEMA platform IS 'Cross-cutting infrastructure: outbox, audit, flags, report runs';
COMMENT ON SCHEMA reporting IS 'Read models for reporting; never written by request handlers';
