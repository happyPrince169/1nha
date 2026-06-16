-- ---------------------------------------------------------------------------
-- Link generated content to the style profile used during generation.
-- on delete set null: deleting a style profile keeps historical content rows.
-- ---------------------------------------------------------------------------
alter table generated_contents
add column if not exists style_profile_id uuid references content_style_profiles(id) on delete set null;

create index if not exists generated_contents_style_profile_id_idx
on generated_contents(style_profile_id);
