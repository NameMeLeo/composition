-- Composition — optional cloud mirror
--
-- Run this in the Supabase SQL editor if you want readings copied off the
-- device so a reinstall does not lose them. Everything still works locally
-- without it; the table is only touched when "Cloud mirror" is switched on.
--
-- The app writes one row per reading, keyed by the locally generated id, and
-- Row Level Security keeps every row readable and writable only by its owner.

create table if not exists public.readings (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  source      text,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);

comment on table public.readings is 'Body composition readings mirrored from the Composition PWA.';

create index if not exists readings_owner_time_idx
  on public.readings (user_id, measured_at desc);

alter table public.readings enable row level security;

drop policy if exists "readings: owner can read" on public.readings;
create policy "readings: owner can read"
  on public.readings for select
  using (auth.uid() = user_id);

drop policy if exists "readings: owner can insert" on public.readings;
create policy "readings: owner can insert"
  on public.readings for insert
  with check (auth.uid() = user_id);

drop policy if exists "readings: owner can update" on public.readings;
create policy "readings: owner can update"
  on public.readings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "readings: owner can delete" on public.readings;
create policy "readings: owner can delete"
  on public.readings for delete
  using (auth.uid() = user_id);

-- Keep updated_at honest without trusting the client.
create or replace function public.readings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists readings_touch_updated_at on public.readings;
create trigger readings_touch_updated_at
  before update on public.readings
  for each row execute function public.readings_touch_updated_at();
