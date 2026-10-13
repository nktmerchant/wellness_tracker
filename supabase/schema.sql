-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- One row per user per day. The app keeps its own copy on the device and
-- syncs here; updated_at is the edit time from the device, used for
-- last-write-wins between devices.

create table if not exists public.day_logs (
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  day         date        not null,
  activities  text[]      not null default '{}',
  meals       text[]      not null default '{}',
  sleep_hours real,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

-- Row-level security is what makes the public (anon) key safe to ship in the
-- app: every query is limited to the signed-in user's own rows.
alter table public.day_logs enable row level security;

create policy "own rows: read"   on public.day_logs for select using (auth.uid() = user_id);
create policy "own rows: insert" on public.day_logs for insert with check (auth.uid() = user_id);
create policy "own rows: update" on public.day_logs for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.day_logs for delete using (auth.uid() = user_id);
