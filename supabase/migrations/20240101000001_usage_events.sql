-- ---------------------------------------------------------------------------
-- usage_events table
--
-- Lightweight event log for tracking user actions.
-- Rows are append-only — never update or delete them.
-- The metadata column holds arbitrary JSON context per event.
-- ---------------------------------------------------------------------------

create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- Index for per-user lookups and weekly aggregation queries
create index if not exists usage_events_user_id_created_at_idx
  on public.usage_events (user_id, created_at desc);

-- Index for filtering by event type
create index if not exists usage_events_event_type_idx
  on public.usage_events (event_type);

-- Row-Level Security — users can only see their own events
alter table public.usage_events enable row level security;

create policy "Users can insert their own usage events"
  on public.usage_events for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own usage events"
  on public.usage_events for select
  using (auth.uid() = user_id);
