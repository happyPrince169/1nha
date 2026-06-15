-- ---------------------------------------------------------------------------
-- Account profiles and beta upgrade interest
--
-- user_profiles      — broker's public display info (name, phone, company)
-- upgrade_interest_requests — soft registrations for future paid plans
--
-- No payment, credits, invoices, or subscription enforcement.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  display_name text,
  phone        text,
  company_name text,
  -- Role: independent_broker | team_lead | agency | other
  role         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

-- Constrain role to known values (nullable → null means not set)
alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role is null or role in (
    'independent_broker', 'team_lead', 'agency', 'other'
  ));

-- updated_at trigger — reuses set_updated_at() from migration 20240104000001
drop trigger if exists user_profiles_set_updated_at
  on public.user_profiles;

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row
  execute function public.set_updated_at();

-- RLS
alter table public.user_profiles enable row level security;

create policy "user_profiles_select_own"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "user_profiles_insert_own"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "user_profiles_update_own"
  on public.user_profiles for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- upgrade_interest_requests
-- ---------------------------------------------------------------------------
create table if not exists public.upgrade_interest_requests (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  -- Plan the user expressed interest in
  interested_plan text        not null,
  phone           text,
  note            text,
  -- status: pending | contacted | cancelled
  status          text        not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

alter table public.upgrade_interest_requests
  drop constraint if exists upgrade_interest_requests_plan_check;

alter table public.upgrade_interest_requests
  add constraint upgrade_interest_requests_plan_check
  check (interested_plan in ('pro_personal', 'team', 'unsure'));

alter table public.upgrade_interest_requests
  drop constraint if exists upgrade_interest_requests_status_check;

alter table public.upgrade_interest_requests
  add constraint upgrade_interest_requests_status_check
  check (status in ('pending', 'contacted', 'cancelled'));

-- Index for looking up a user's own requests
create index if not exists upgrade_interest_requests_user_id_idx
  on public.upgrade_interest_requests (user_id, created_at desc);

-- updated_at trigger
drop trigger if exists upgrade_interest_requests_set_updated_at
  on public.upgrade_interest_requests;

create trigger upgrade_interest_requests_set_updated_at
  before update on public.upgrade_interest_requests
  for each row
  execute function public.set_updated_at();

-- RLS
alter table public.upgrade_interest_requests enable row level security;

-- Users can see their own requests
create policy "upgrade_interest_select_own"
  on public.upgrade_interest_requests for select
  using (auth.uid() = user_id);

-- Users can submit new requests
create policy "upgrade_interest_insert_own"
  on public.upgrade_interest_requests for insert
  with check (auth.uid() = user_id);

-- Users can update their own note while request is still pending
create policy "upgrade_interest_update_own_note"
  on public.upgrade_interest_requests for update
  using  (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);
