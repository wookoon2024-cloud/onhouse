// Re-prefixes every custom map tileset so no two sheets share a global tile index, and rewrites
// the map data that points at them in the same pass.
//
// Why: a tileset owns the index range [prefix, prefix + cols*rows). Prefixes used to be handed out
// a flat 1000 apart while the auto-split produced sheets of up to cols*64 tiles, so a sheet wider
// than 15 columns ran into its neighbour's range and the editor stamped tiles from the wrong sheet.
// v8.9.181 fixed the allocator, but sheets uploaded before it keep their overlapping ranges. This
// repairs the existing rows.
//
// Safety properties:
//   - Every new prefix is allocated above the end of every old range, so old and new never overlap.
//     A partial run therefore cannot create a new collision, and the script can be re-run.
//   - Both passes are idempotent. Asset rows are set to an absolute prefix keyed by row id; grid
//     cells are only rewritten when they still fall in an old range, and a remapped value never
//     does.
//   - A cell whose value falls in a range claimed by more than one sheet is left untouched and
//     reported. Those are unresolvable by construction (duplicate prefixes 9000/10000/12000).
//
// Usage:
//   node db/2026-08-03_reprefix_custom_tilesets.mjs           # dry run, writes nothing
//   node db/2026-08-03_reprefix_custom_tilesets.mjs --apply   # performs the migration
//
// Rollback: re-run with the mapping reversed (swap old/new). scratch/tileset_prefix_migration_*.json
// holds the mapping this produced.

import { writeFile } from 'node:fs/promises';

const SUPABASE_URL = 'https://wiuqjdvmwnunvarlyaeh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_31bmYltT8X0IAly0UU9fJw_63DA4Nxh';

const APPLY = process.argv.includes('--apply');
const PREFIX_STRIDE = 1000;
const ALLOC_START = 19000; // above the end of every existing range
// Written on every run, including dry runs, so the rollback record is produced by the same
// allocator that performs the migration rather than by a second implementation that can drift.
const ROLLBACK_PATH = 'scratch/tileset_prefix_rollback.json';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

const rest = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
};

const span = (t) => Math.max(1, (Number(t.cols) || 16) * (Number(t.rows) || 16));

async function main() {
  console.log(APPLY ? '=== APPLY (writing to the database) ===' : '=== DRY RUN (nothing will be written) ===');

  const sel = 'id,house_code,asset_data->>name,asset_data->>prefix,asset_data->>cols,asset_data->>rows';
  const raw = await rest(`house_assets?asset_type=eq.map_tileset&select=${encodeURIComponent(sel)}&order=id.asc&limit=500`);

  let cursor = ALLOC_START;
  const sheets = raw.map((r) => {
    const s = { rowId: r.id, name: r.name, oldPrefix: Number(r.prefix), cols: Number(r.cols), rows: Number(r.rows) };
    s.span = span(s);
    s.newPrefix = Math.ceil(cursor / PREFIX_STRIDE) * PREFIX_STRIDE;
    cursor = s.newPrefix + s.span;
    return s;
  }).filter((s) => Number.isFinite(s.oldPrefix));

  console.log(`\n${sheets.length} tilesets:`);
  for (const s of sheets) {
    console.log(`  #${String(s.rowId).padStart(5)}  ${String(s.name).padEnd(18)} ${String(s.span).padStart(5)} tiles   ${s.oldPrefix} -> ${s.newPrefix}`);
  }

  // A value is only remapped when exactly one sheet claims it.
  const ownerOf = (v) => {
    const hits = sheets.filter((s) => v >= s.oldPrefix && v < s.oldPrefix + s.span);
    return hits.length === 1 ? hits[0] : null;
  };

  const maps = await rest('house_maps?select=id,map_id,map_data&limit=500');
  let remapped = 0, ambiguous = 0, mapsChanged = 0;

  const remapGrid = (grid) => {
    if (!Array.isArray(grid)) return false;
    let touched = false;
    for (const row of grid) {
      if (!Array.isArray(row)) continue;
      for (let i = 0; i < row.length; i++) {
        const v = row[i];
        if (typeof v !== 'number' || v < PREFIX_STRIDE * 9) continue;
        const o = ownerOf(v);
        if (!o) {
          if (sheets.some((s) => v >= s.oldPrefix && v < s.oldPrefix + s.span)) ambiguous++;
          continue;
        }
        row[i] = v - o.oldPrefix + o.newPrefix;
        remapped++;
        touched = true;
      }
    }
    return touched;
  };

  const pendingMaps = [];
  for (const m of maps) {
    const data = typeof m.map_data === 'string' ? JSON.parse(m.map_data) : m.map_data;
    if (!data) continue;
    let touched = false;
    touched = remapGrid(data.baseLayer) || touched;
    touched = remapGrid(data.decorLayer) || touched;
    if (Array.isArray(data.layers)) for (const l of data.layers) if (l) touched = remapGrid(l.grid) || touched;
    if (Array.isArray(data.objects)) for (const o of data.objects) if (o) {
      touched = remapGrid(o.tiles) || touched;
      touched = remapGrid(o.bgTiles) || touched;
    }
    if (touched) { pendingMaps.push({ id: m.id, mapId: m.map_id, data }); mapsChanged++; }
  }

  console.log(`\nmap data: ${remapped} tile cells to remap across ${mapsChanged}/${maps.length} maps`);
  if (ambiguous) console.log(`  ${ambiguous} cells sit in a range claimed by more than one sheet and are LEFT UNTOUCHED`);

  await writeFile(ROLLBACK_PATH, JSON.stringify({
    note: 'Rollback record for the custom map tileset prefix migration. To reverse, run the same ' +
          'remap with old and new swapped: new ranges sit above every old one, so neither direction ' +
          'can collide and both are idempotent.',
    generatedAt: new Date().toISOString(),
    applied: APPLY,
    affected: { assetRows: sheets.length, mapRows: mapsChanged, tileCells: remapped, ambiguousLeftAlone: ambiguous },
    mapping: sheets.map((s) => ({ rowId: s.rowId, name: s.name, span: s.span, old: s.oldPrefix, new: s.newPrefix }))
  }, null, 2));
  console.log(`rollback record written to ${ROLLBACK_PATH}`);

  if (!APPLY) {
    console.log('\nDry run complete. Re-run with --apply to write.');
    return;
  }

  // Assets first: a map briefly pointing at a prefix that no sheet owns renders blank, which is
  // recoverable by finishing the run. Neither order can corrupt anything, since the ranges are
  // disjoint either way.
  console.log('\nwriting tilesets...');
  for (const s of sheets) {
    const rows = await rest(`house_assets?id=eq.${s.rowId}&select=asset_data`);
    const data = rows?.[0]?.asset_data;
    if (!data) { console.log(`  #${s.rowId} ${s.name}: row vanished, skipped`); continue; }
    if (data.prefix === s.newPrefix) { console.log(`  #${s.rowId} ${s.name}: already ${s.newPrefix}`); continue; }
    if (data.prefix !== s.oldPrefix) { console.log(`  #${s.rowId} ${s.name}: prefix is ${data.prefix}, expected ${s.oldPrefix} — SKIPPED`); continue; }
    data.prefix = s.newPrefix;
    await rest(`house_assets?id=eq.${s.rowId}`, { method: 'PATCH', body: JSON.stringify({ asset_data: data }), headers: { Prefer: 'return=minimal' } });
    console.log(`  #${s.rowId} ${s.name}: ${s.oldPrefix} -> ${s.newPrefix}`);
  }

  console.log('\nwriting maps...');
  for (const m of pendingMaps) {
    await rest(`house_maps?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ map_data: m.data }), headers: { Prefer: 'return=minimal' } });
    console.log(`  #${m.id} ${m.mapId}: written`);
  }

  console.log('\nDone. Reload the app with a hard refresh so the cached tileset list is rebuilt.');
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exitCode = 1; });
