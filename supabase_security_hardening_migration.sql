-- ============================================================
-- FacilityFlow: Security Hardening (post-fresh-rebuild advisor cleanup)
-- Run in: Supabase Dashboard → SQL Editor
-- Run this AFTER supabase_vendor_project_notifications_v1c_migration.sql
-- and BEFORE the demo seed files — see FRESH_DB_REBUILD.md for the
-- updated full order.
--
-- Prerequisites (already done): every migration through
-- supabase_vendor_project_notifications_v1c_migration.sql — this file
-- only adjusts privileges/config on functions those files already
-- created. No table, policy, or function BODY is modified except the
-- two `alter function ... set search_path` statements in §1, which
-- change a configuration parameter only, not the function's logic.
--
-- Why this file exists: `supabase db advisors --linked` against the live
-- project found that 24 of 26 SECURITY DEFINER functions are executable
-- by the unauthenticated `anon` role at the Postgres grant level, despite
-- nearly every migration already containing a `revoke all ... from
-- public` line. Root cause: Supabase projects configure
-- `ALTER DEFAULT PRIVILEGES` to auto-grant EXECUTE to `anon` AND
-- `authenticated` on newly created functions in the `public` schema — a
-- `REVOKE ... FROM PUBLIC` does not undo that separate, role-specific
-- default-privilege grant. It needs an explicit `REVOKE ... FROM anon`.
--
-- This was NOT a live, confirmed vulnerability (see FRESH_DB_REBUILD.md
-- §9 for the full reasoning: every affected function either is a trigger
-- function unreachable via PostgREST RPC, or keys its logic off
-- `auth.uid()`/`current_profile_role()`, both NULL for an anon caller, so
-- every one already failed closed). This migration closes the
-- defense-in-depth gap anyway, and goes one step further where the
-- audit found it was safe to: a handful of helper functions turned out to
-- have NO legitimate direct caller at all (not the frontend, not any bare
-- RLS policy clause — only ever invoked from inside another SECURITY
-- DEFINER function's body, which runs as the function owner and needs no
-- grant on what it calls internally). Those get `authenticated` revoked
-- too, not just `anon`.
--
-- ══════════════════════════════════════════════════════════════
-- ⚠️  THE ONE RULE THAT MATTERS HERE
-- ══════════════════════════════════════════════════════════════
-- Any function referenced DIRECTLY inside a `using (...)` or
-- `with check (...)` clause on an RLS policy MUST keep
-- `grant execute ... to authenticated` — Postgres evaluates that clause
-- as the querying role (`authenticated` for every logged-in user), and
-- revoking its EXECUTE privilege does not just fail to hide data, it
-- breaks the query entirely with a permission-denied error for every
-- table whose policy calls it. This migration was built by grepping every
-- .sql file in this repo for each function's exact call sites — verified,
-- not assumed — before deciding whether `authenticated` could be revoked.
-- If you add a new function and reference it directly in a policy later,
-- it needs the same `grant ... to authenticated` treatment, permanently.
-- ══════════════════════════════════════════════════════════════
--
-- Idempotent: every statement is a plain REVOKE/GRANT/ALTER FUNCTION,
-- safe to re-run.
-- ============================================================

-- 1. search_path fix for the two oldest functions ------------------------
-- Both predate the "always set search_path = public" convention
-- established partway through this project. Fixed via ALTER FUNCTION —
-- this only sets a configuration parameter, the function body/logic is
-- completely untouched, so there is no behavior-change risk here at all.

alter function public.fn_set_appointment_code() set search_path = public;
alter function public.set_updated_at()          set search_path = public;

-- 2. slot_booking_counts — reviewed, NOT changed --------------------------
-- The advisor flags this view as SECURITY DEFINER (ERROR level). It was
-- created that way ON PURPOSE (see RLS_PRIVATE_STORAGE_PLAN.md, risk
-- R-2): appointment_requests has vendor-scoped RLS, so a plain
-- (security_invoker) view would show each vendor only THEIR OWN prior
-- bookings when computing slot capacity — meaning a vendor could double-
-- book a slot that's actually full, because they'd never see other
-- vendors' bookings against it. The view's whole purpose is to bypass
-- that per-vendor restriction for this one aggregate, non-identifying
-- count (responsible_staff + requested_date + start_time + a booked
-- COUNT — never vendor_name or vendor_user_id). Flipping this to
-- security_invoker = true, which is the "obvious" fix for the linter
-- warning, would silently reintroduce exactly the booking-capacity bug
-- this view exists to prevent — a real product regression, not a
-- hardening. Per "do not change product behavior," this is left exactly
-- as-is. Accepted, documented, not fixed — see FRESH_DB_REBUILD.md §9.

-- 3. Functions directly used by RLS policies and/or the frontend --------
-- All 18 below keep `authenticated` (verified via grep against every
-- policy file in this repo — see the rule above) and only need `anon`
-- revoked to close the gap the advisor found.

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.is_admin_or_manager() from public, anon;
grant execute on function public.is_admin_or_manager() to authenticated;

revoke all on function public.is_internal_role() from public, anon;
grant execute on function public.is_internal_role() to authenticated;

revoke all on function public.current_profile_role() from public, anon;
grant execute on function public.current_profile_role() to authenticated;

revoke all on function public.is_project_member(uuid) from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated;

revoke all on function public.is_project_vendor(uuid) from public, anon;
grant execute on function public.is_project_vendor(uuid) to authenticated;

revoke all on function public.update_appointment_progress(uuid, integer) from public, anon;
grant execute on function public.update_appointment_progress(uuid, integer) to authenticated;

revoke all on function public.update_my_project_task_status(uuid, text) from public, anon;
grant execute on function public.update_my_project_task_status(uuid, text) to authenticated;

revoke all on function public.update_my_vendor_project_task_status(uuid, text) from public, anon;
grant execute on function public.update_my_vendor_project_task_status(uuid, text) to authenticated;

revoke all on function public.create_project_notification(
  uuid, uuid, text, text, text, uuid, uuid, uuid, uuid
) from public, anon;
grant execute on function public.create_project_notification(
  uuid, uuid, text, text, text, uuid, uuid, uuid, uuid
) to authenticated;

revoke all on function public.create_project_notifications_for_members(
  uuid, text, text, text, uuid, uuid, uuid, uuid
) from public, anon;
grant execute on function public.create_project_notifications_for_members(
  uuid, text, text, text, uuid, uuid, uuid, uuid
) to authenticated;

revoke all on function public.mark_project_notification_read(uuid) from public, anon;
grant execute on function public.mark_project_notification_read(uuid) to authenticated;

revoke all on function public.mark_all_project_notifications_read() from public, anon;
grant execute on function public.mark_all_project_notifications_read() to authenticated;

revoke all on function public.get_my_vendor_projects() from public, anon;
grant execute on function public.get_my_vendor_projects() to authenticated;

revoke all on function public.get_my_vendor_project(uuid) from public, anon;
grant execute on function public.get_my_vendor_project(uuid) to authenticated;

revoke all on function public.get_vendor_directory() from public, anon;
grant execute on function public.get_vendor_directory() to authenticated;

revoke all on function public.notify_vendor_project_event(
  uuid, uuid, text, text, text, uuid, uuid, uuid
) from public, anon;
grant execute on function public.notify_vendor_project_event(
  uuid, uuid, text, text, text, uuid, uuid, uuid
) to authenticated;

revoke all on function public.notify_internal_vendor_project_event(
  uuid, text, text, text, uuid, uuid, uuid
) from public, anon;
grant execute on function public.notify_internal_vendor_project_event(
  uuid, text, text, text, uuid, uuid, uuid
) to authenticated;

-- 4. is_project_vendor_member — tightened further than the advisor asked ---
-- Verified (grep across every .sql file) that this function is NEVER
-- referenced directly inside a bare RLS policy clause and is NEVER called
-- from the frontend. Its only four call sites are all INSIDE other
-- SECURITY DEFINER function bodies (two trigger functions in §5 below,
-- plus notify_vendor_project_event() in §3 above) — and a SECURITY
-- DEFINER function's body executes as the function's OWNER, not the
-- original caller, so those internal calls need no grant on
-- is_project_vendor_member() at all. No legitimate caller needs direct
-- access, so `authenticated` is revoked here too, not just `anon` — the
-- correct, narrowest possible grant is none.

revoke all on function public.is_project_vendor_member(uuid, uuid) from public, anon, authenticated;

-- 5. Trigger-only functions — revoke everything, grant nothing ------------
-- All seven below are `returns trigger`. Postgres invokes trigger
-- functions internally as part of the INSERT/UPDATE that fires them —
-- never via a direct SQL-level function call by the querying role — so
-- they need no EXECUTE grant to any role for the triggers themselves to
-- keep working. (Calling one directly, e.g. `select set_updated_at();`,
-- already fails with "trigger functions can only be called as triggers"
-- regardless of grants — revoking execute here removes a redundant,
-- misleading grant, not a working capability.)

revoke all on function public.fn_set_appointment_code() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.sync_project_owner_membership() from public, anon, authenticated;
revoke all on function public.enforce_vendor_member_role() from public, anon, authenticated;
revoke all on function public.enforce_document_vendor_share_membership() from public, anon, authenticated;
revoke all on function public.enforce_comment_vendor_share_membership() from public, anon, authenticated;
revoke all on function public.enforce_vendor_task_membership() from public, anon, authenticated;

-- ── Verification (run manually after this file, not part of it) ──
--
-- Expect ZERO rows (no function anywhere in public should still be
-- reachable by anon):
--   select p.proname, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and has_function_privilege('anon', p.oid, 'EXECUTE');
--
-- Expect fn_set_appointment_code and set_updated_at to show
-- {search_path=public} in proconfig:
--   select proname, proconfig from pg_proc
--   where proname in ('fn_set_appointment_code', 'set_updated_at');
--
-- Expect ONLY the 18 functions listed in §3 above (not
-- is_project_vendor_member, not any of the 7 trigger functions) to show
-- authenticated execute access:
--   select p.proname
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
--   order by p.proname;
--
-- Re-run `supabase db advisors --linked --type security` afterward —
-- the 24 anon_security_definer_function_executable /
-- authenticated_security_definer_function_executable findings for
-- trigger functions and is_project_vendor_member should be gone; the
-- remaining 18 authenticated_... findings for genuinely RPC-facing
-- functions are expected to stay (that's the intended, documented API
-- surface, not a bug) and slot_booking_counts' security_definer_view
-- finding will still appear (accepted, see §2).

-- Supabase automatic RLS helper. Event/internal use only; direct EXECUTE grants are unnecessary.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as function_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      r.function_signature
    );
  end loop;
end $$;
