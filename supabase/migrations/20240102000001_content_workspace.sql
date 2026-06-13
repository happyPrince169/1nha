-- ---------------------------------------------------------------------------
-- Content Workspace v1
-- Extends generated_contents with workflow / lifecycle columns.
-- All new columns are nullable so existing rows are unaffected.
-- ---------------------------------------------------------------------------

alter table public.generated_contents
  add column if not exists title           text,
  add column if not exists status          text not null default 'draft',
  add column if not exists copied_at       timestamptz,
  add column if not exists scheduled_at    timestamptz,
  add column if not exists posted_at       timestamptz,
  add column if not exists post_url        text,
  add column if not exists channel_name    text,
  add column if not exists notes           text,
  add column if not exists parent_content_id uuid
    references public.generated_contents(id) on delete set null;

-- Constrain status to known values
alter table public.generated_contents
  drop constraint if exists generated_contents_status_check;

alter table public.generated_contents
  add constraint generated_contents_status_check
  check (status in ('draft', 'scheduled', 'posted', 'archived'));

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Filter by status within a user's content (most common list view query)
create index if not exists generated_contents_user_status_idx
  on public.generated_contents (user_id, status);

-- Filter by status within a property (content workspace per-property)
create index if not exists generated_contents_property_status_idx
  on public.generated_contents (property_id, status);

-- Self-referential parent lookup (find all variations of a content)
create index if not exists generated_contents_parent_idx
  on public.generated_contents (parent_content_id)
  where parent_content_id is not null;
