-- Run this in the Supabase dashboard → SQL Editor.
--
-- WHY: saveHouseMapToDB() upserts with { onConflict: 'house_code,map_id' }. Postgres rejects that
-- with 400 "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- because house_maps has no such constraint, so EVERY map save fails the upsert and takes the
-- select-then-update fallback instead — two extra round trips per save, and a window where a
-- dropped connection between the delete/insert steps could lose the map.
--
-- SAFETY: checked before writing this — house_maps had 2 rows and 0 duplicate
-- (house_code, map_id) pairs, so the constraint applies cleanly with no data cleanup.
-- Step 1 re-checks anyway; if it returns any rows, resolve those before running step 2.

-- Step 1 — confirm there is nothing to clean up (expect zero rows).
SELECT house_code, map_id, count(*) AS copies, array_agg(id ORDER BY id) AS row_ids
FROM house_maps
GROUP BY house_code, map_id
HAVING count(*) > 1;

-- Step 1b — ONLY if step 1 returned rows: keep the newest row per pair, drop the rest.
-- DELETE FROM house_maps a
-- USING house_maps b
-- WHERE a.house_code = b.house_code
--   AND a.map_id = b.map_id
--   AND a.id < b.id;

-- Step 2 — add the constraint the upsert already asks for.
ALTER TABLE house_maps
  ADD CONSTRAINT house_maps_house_code_map_id_key UNIQUE (house_code, map_id);

-- Step 3 — verify (expect one row naming the new constraint).
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'house_maps'::regclass AND contype = 'u';
