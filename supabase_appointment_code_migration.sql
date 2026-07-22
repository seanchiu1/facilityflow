-- ============================================================
-- FacilityFlow: Add appointment_code to appointment_requests
-- Run in: Supabase Dashboard → SQL Editor
-- Safe to run on an existing table with data.
-- ============================================================

-- 1. Sequence for generating monotonically-increasing code numbers
create sequence if not exists appointment_code_seq start 1;

-- 2. Add the column (nullable so we can backfill first, constraint added at end)
alter table appointment_requests
  add column if not exists appointment_code text;

-- 3. Backfill existing rows in chronological order (created_at, then id as tiebreaker)
--    Format: APT-<year of created_at>-<4-digit sequence number>
with numbered as (
  select
    id,
    created_at,
    row_number() over (order by created_at, id) as rn
  from appointment_requests
  where appointment_code is null
)
update appointment_requests ar
set appointment_code =
  'APT-' ||
  extract(year from ar.created_at)::text ||
  '-' ||
  lpad(n.rn::text, 4, '0')
from numbered n
where ar.id = n.id;

-- 4. Advance sequence past the backfilled numbers so new inserts don't collide
-- Sync sequence to existing appointment codes.
-- Fresh DB has no appointments, so max code can be 0.
-- setval(..., 0) is invalid because the sequence starts at 1.
do $$
declare
  v_max_code integer;
begin
  select coalesce(
    max(
      nullif(
        regexp_replace(appointment_code, '\D', '', 'g'),
        ''
      )::integer
    ),
    0
  )
  into v_max_code
  from public.appointment_requests
  where appointment_code is not null;

  if v_max_code <= 0 then
    perform setval('public.appointment_code_seq', 1, false);
  else
    perform setval('public.appointment_code_seq', v_max_code, true);
  end if;
end $$;

-- 5. Unique constraint now that all rows have a code
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'uq_appointment_code'
      and conrelid = 'public.appointment_requests'::regclass
  ) then
    alter table public.appointment_requests
      add constraint uq_appointment_code unique (appointment_code);
  end if;
end $$;

-- 6. Trigger function: auto-assign code on INSERT if not supplied
create or replace function fn_set_appointment_code()
returns trigger language plpgsql as $$
declare
  v_seq bigint;
begin
  if new.appointment_code is null then
    v_seq := nextval('appointment_code_seq');
    new.appointment_code :=
      'APT-' ||
      extract(year from now())::text ||
      '-' ||
      lpad(v_seq::text, 4, '0');
  end if;
  return new;
end;
$$;

-- 7. Trigger (drop + recreate is idempotent)
drop trigger if exists trg_set_appointment_code on appointment_requests;
create trigger trg_set_appointment_code
  before insert on appointment_requests
  for each row execute function fn_set_appointment_code();
