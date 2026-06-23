-- ---------------------------------------------------------------------------
-- Ensure decimal-capable property columns can store 5 decimal places.
--
-- The app now rounds area / frontage / alley_width to 5 decimals on save. If a
-- column is numeric(p, s) with s < 5 the database would silently re-round to s,
-- so this migration WIDENS only those columns. It is conditional + idempotent:
--   • numeric with scale < 5            → widened to numeric(14, 5)  (safe widen)
--   • numeric with scale >= 5 / no scale → left unchanged (already sufficient)
--   • double precision / real           → left unchanged (stores 5dp; float caveat)
--   • integer types                     → ABORTS (manual review — would truncate)
--   • column missing                    → skipped with a notice
--
-- price is intentionally NOT touched: it is stored as integer raw VND (no
-- decimals needed). No RLS / policy / data changes here.
-- ---------------------------------------------------------------------------
do $$
declare
  col   text;
  dtype text;
  scale int;
begin
  foreach col in array array['area', 'frontage', 'alley_width'] loop
    select data_type, numeric_scale
      into dtype, scale
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'properties'
       and column_name  = col;

    if dtype is null then
      raise notice 'properties.% not found — skipping', col;
    elsif dtype = 'numeric' and (scale is null or scale >= 5) then
      raise notice 'properties.% is numeric(scale=%) — already supports 5 decimals', col, scale;
    elsif dtype = 'numeric' then
      execute format('alter table public.properties alter column %I type numeric(14,5)', col);
      raise notice 'properties.% widened from numeric(scale=%) to numeric(14,5)', col, scale;
    elsif dtype in ('double precision', 'real') then
      raise notice 'properties.% is % — stores 5 decimals (floating-point caveat), unchanged', col, dtype;
    elsif dtype in ('integer', 'bigint', 'smallint') then
      raise exception 'properties.% is % (integer) — manual review required before storing decimals', col, dtype;
    else
      raise notice 'properties.% is % — left unchanged', col, dtype;
    end if;
  end loop;
end $$;
