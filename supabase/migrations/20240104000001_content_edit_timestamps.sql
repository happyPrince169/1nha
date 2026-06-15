-- ---------------------------------------------------------------------------
-- Content edit timestamps
--
-- Adds updated_at and edited_at to generated_contents.
--
-- updated_at  — set whenever any column changes (managed by a trigger).
-- edited_at   — set only when the broker manually edits the text body,
--               so we can distinguish AI-generated from broker-edited content.
--
-- Both are nullable so existing rows are unaffected until their first update.
-- ---------------------------------------------------------------------------

alter table public.generated_contents
  add column if not exists updated_at timestamptz,
  add column if not exists edited_at  timestamptz;

-- ---------------------------------------------------------------------------
-- Trigger: keep updated_at = now() on every row update.
-- The function is created with "or replace" so it is safe to re-run.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop the trigger first so the migration is idempotent.
drop trigger if exists generated_contents_set_updated_at
  on public.generated_contents;

create trigger generated_contents_set_updated_at
  before update on public.generated_contents
  for each row
  execute function public.set_updated_at();
