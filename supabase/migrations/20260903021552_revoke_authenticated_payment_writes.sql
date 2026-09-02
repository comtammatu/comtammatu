-- Revoke leftover authenticated payment writes after the 2026-09-03 soak.
-- create_supplier_payment is unused (no app callers, no PostgREST hits);
-- POS/payment mutations are SECURITY DEFINER and do not need authenticated
-- UPDATE on public.payments. Keep SELECT. Do not Production-apply from this
-- task. Rollback: 20260902162918_baseline.sql pg_dump snapshot.

REVOKE ALL ON FUNCTION public.create_supplier_payment(bigint, bigint, numeric, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.create_supplier_payment(bigint, bigint, numeric, text, text);

REVOKE UPDATE ON TABLE public.payments FROM authenticated;
