import { supabase } from '../lib/supabase';
import { type MapDefinition, maps } from '../game/MapData';

export const getSavedHouseCode = (): string => {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      let roomParam = searchParams.get('house') || searchParams.get('room');

      if (!roomParam && window.location.hash) {
        roomParam = window.location.hash.replace('#', '');
      }

      if (roomParam && roomParam.trim()) {
        const formatted = roomParam.trim().toUpperCase();
        localStorage.setItem('on_house_current_code', formatted);

        // Clean up URL query param without refreshing page
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        return formatted;
      }
    }
  } catch (e) {}

  return localStorage.getItem('on_house_current_code') || 'H-1001';
};

export const setSavedHouseCode = (code: string) => {
  const formatted = code.trim().toUpperCase() || 'H-1001';
  localStorage.setItem('on_house_current_code', formatted);
  return formatted;
};

// Helper to prevent hanging indefinitely if Supabase has Cloudflare 522 or network timeout
const withTimeout = <T>(promiseLike: PromiseLike<T>, timeoutMs = 3500): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Supabase network timeout')), timeoutMs);
    Promise.resolve(promiseLike)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

// Fetch deleted map IDs list for a house code from Supabase DB
export const fetchHouseDeletedMaps = async (houseCode: string): Promise<string[]> => {
  try {
    const res = await withTimeout(
      supabase
        .from('house_assets')
        .select('asset_data')
        .eq('house_code', houseCode)
        .eq('asset_type', 'deleted_maps'),
      3000
    );

    const dbDeleted: string[] = [];
    if (res.data && res.data.length > 0) {
      res.data.forEach((row: any) => {
        if (row.asset_data && Array.isArray(row.asset_data.deletedIds)) {
          dbDeleted.push(...row.asset_data.deletedIds);
        }
      });
    }
    const finalDeleted = Array.from(new Set(dbDeleted));
    try {
      localStorage.setItem(`on_house_deleted_maps_${houseCode}`, JSON.stringify(finalDeleted));
    } catch (e) {}
    return finalDeleted;
  } catch (err) {
    console.warn('[OnHouse Sync] fetchHouseDeletedMaps network/timeout, returning cached list:', err);
    try {
      const saved = localStorage.getItem(`on_house_deleted_maps_${houseCode}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }
};

// Save deleted map IDs list to Supabase DB
export const saveHouseDeletedMapsToDB = async (houseCode: string, deletedIds: string[]) => {
  try {
    try {
      localStorage.setItem(`on_house_deleted_maps_${houseCode}`, JSON.stringify(deletedIds));
    } catch (e) {}

    await withTimeout(
      supabase
        .from('house_assets')
        .delete()
        .eq('house_code', houseCode)
        .eq('asset_type', 'deleted_maps'),
      3000
    );

    await withTimeout(
      supabase
        .from('house_assets')
        .insert({
          house_code: houseCode,
          asset_type: 'deleted_maps',
          asset_data: { deletedIds },
          updated_at: new Date().toISOString()
        }),
      3000
    );
    console.log('[OnHouse Sync] Saved deleted maps to Supabase DB:', houseCode, deletedIds);
  } catch (err) {
    console.warn('[OnHouse Sync] Failed to save deleted maps to Supabase DB:', err);
  }
};

// Fetch map order for a house code from Supabase DB
export const fetchHouseMapOrder = async (houseCode: string): Promise<string[]> => {
  try {
    const res = await withTimeout(
      supabase
        .from('house_assets')
        .select('asset_data')
        .eq('house_code', houseCode)
        .eq('asset_type', 'map_order'),
      3000
    );

    if (res.data && res.data.length > 0 && res.data[0].asset_data?.order && Array.isArray(res.data[0].asset_data.order)) {
      return res.data[0].asset_data.order;
    }
  } catch (err) {
    console.warn('[OnHouse Sync] fetchHouseMapOrder network/timeout, returning empty list:', err);
  }
  return [];
};

// Save map order to Supabase DB
export const saveHouseMapOrderToDB = async (houseCode: string, order: string[]) => {
  try {
    try {
      await withTimeout(
        supabase
          .from('house_assets')
          .upsert({
            house_code: houseCode,
            asset_type: 'map_order',
            asset_data: { order },
            updated_at: new Date().toISOString()
          }, { onConflict: 'house_code,asset_type' }),
        3000
      );
    } catch (e) {
      await withTimeout(
        supabase
          .from('house_assets')
          .delete()
          .eq('house_code', houseCode)
          .eq('asset_type', 'map_order'),
        2000
      );

      await withTimeout(
        supabase
          .from('house_assets')
          .insert({
            house_code: houseCode,
            asset_type: 'map_order',
            asset_data: { order },
            updated_at: new Date().toISOString()
          }),
        2000
      );
    }
    console.log('[OnHouse Sync] Saved map order to Supabase DB:', houseCode, order);
  } catch (err) {
    console.warn('[OnHouse Sync] Failed to save map order to Supabase DB:', err);
  }
};

// Fetch or initialize all maps for a given house code directly from DB
export const fetchHouseMaps = async (houseCode: string): Promise<Record<string, MapDefinition>> => {
  try {
    console.log(`[OnHouse Sync] Fetching maps for houseCode: ${houseCode}`);

    // 0. Fetch deleted map IDs for this house code from DB
    const deletedMapIds = await fetchHouseDeletedMaps(houseCode);

    // 1. Start with fresh DEEP CLONED factory default maps (excluding deleted ones)
    const loadedMaps: Record<string, MapDefinition> = {};
    Object.entries(maps).forEach(([id, def]) => {
      if (!deletedMapIds.includes(id)) {
        loadedMaps[id] = JSON.parse(JSON.stringify(def));
      }
    });

    // 2. Fetch from Supabase DB with timeout (3.5s) and merge/override cloud data
    const res = await withTimeout(
      supabase
        .from('house_maps')
        .select('map_id, map_data')
        .eq('house_code', houseCode),
      3500
    );

    if (res.data && res.data.length > 0) {
      // Sort rows by sortOrder property if defined
      const sortedRows = [...res.data].sort((a, b) => {
        const orderA = a.map_data?.sortOrder ?? 999;
        const orderB = b.map_data?.sortOrder ?? 999;
        return orderA - orderB;
      });

      const sortedMaps: Record<string, MapDefinition> = {};
      sortedRows.forEach((row: { map_id: string; map_data: MapDefinition }) => {
        if (!deletedMapIds.includes(row.map_id) && row.map_data && row.map_data.width && row.map_data.height) {
          sortedMaps[row.map_id] = row.map_data;
        }
      });

      // Append default maps that were not in DB and not deleted
      Object.keys(loadedMaps).forEach((id) => {
        if (!sortedMaps[id] && !deletedMapIds.includes(id)) {
          sortedMaps[id] = loadedMaps[id];
        }
      });

      try {
        localStorage.setItem(`on_house_custom_house_maps_${houseCode}`, JSON.stringify(sortedMaps));
      } catch (e) {}

      console.log(`[OnHouse Sync] Successfully loaded ${Object.keys(sortedMaps).length} maps for houseCode [${houseCode}] in sort order:`, Object.keys(sortedMaps));
      return sortedMaps;
    }

    try {
      localStorage.setItem(`on_house_custom_house_maps_${houseCode}`, JSON.stringify(loadedMaps));
    } catch (e) {}

    console.log(`[OnHouse Sync] Successfully loaded ${Object.keys(loadedMaps).length} maps for houseCode [${houseCode}]:`, Object.keys(loadedMaps));
    return loadedMaps;
  } catch (err) {
    console.warn(`[OnHouse Sync] Supabase fetchHouseMaps timeout/error for [${houseCode}], using cached map list:`, err);
    
    // Check localStorage for cached house maps and deleted maps
    try {
      const savedDeleted = localStorage.getItem(`on_house_deleted_maps_${houseCode}`);
      const deletedList: string[] = savedDeleted ? JSON.parse(savedDeleted) : [];

      const savedHouseMaps = localStorage.getItem(`on_house_custom_house_maps_${houseCode}`);
      if (savedHouseMaps) {
        const parsedHouseMaps: Record<string, MapDefinition> = JSON.parse(savedHouseMaps);
        const filteredCachedMaps: Record<string, MapDefinition> = {};
        Object.entries(parsedHouseMaps).forEach(([id, def]) => {
          if (!deletedList.includes(id)) {
            filteredCachedMaps[id] = def;
          }
        });
        if (Object.keys(filteredCachedMaps).length > 0) {
          return filteredCachedMaps;
        }
      }

      // If no custom house cache, fallback to default maps excluding deleted ones
      const fallbackMaps: Record<string, MapDefinition> = {};
      Object.entries(maps).forEach(([id, def]) => {
        if (!deletedList.includes(id)) {
          fallbackMaps[id] = JSON.parse(JSON.stringify(def));
        }
      });

      if (Object.keys(fallbackMaps).length > 0) {
        return fallbackMaps;
      }
    } catch (e) {}

    const loadedMaps: Record<string, MapDefinition> = {};
    Object.entries(maps).forEach(([id, def]) => {
      loadedMaps[id] = JSON.parse(JSON.stringify(def));
    });
    return loadedMaps;
  }
};

// Save single map to Supabase DB
export const saveHouseMapToDB = async (
  houseCode: string,
  mapId: string,
  mapData: MapDefinition
): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log(`[OnHouse Sync] Saving map '${mapId}' to Supabase DB for houseCode [${houseCode}]...`);

    // If map was previously in deleted list, un-delete it when saved!
    const deletedIds = await fetchHouseDeletedMaps(houseCode);
    if (deletedIds.includes(mapId)) {
      const nextDeleted = deletedIds.filter(id => id !== mapId);
      await saveHouseDeletedMapsToDB(houseCode, nextDeleted);
    }

    // Try upsert into Supabase DB with 3.5s timeout
    const upsertRes = await withTimeout(
      supabase
        .from('house_maps')
        .upsert({
          house_code: houseCode,
          map_id: mapId,
          map_data: mapData,
          updated_at: new Date().toISOString()
        }, { onConflict: 'house_code,map_id' }),
      3500
    );

    if (!upsertRes.error) {
      console.log(`[OnHouse Sync] Successfully saved map '${mapId}' for houseCode [${houseCode}] to Supabase DB!`);
      return { success: true };
    }

    console.warn('[OnHouse Sync] Upsert fallback triggered:', upsertRes.error.message);

    // Fallback check if existing row exists
    const selectRes = await withTimeout(
      supabase
        .from('house_maps')
        .select('id')
        .eq('house_code', houseCode)
        .eq('map_id', mapId)
        .maybeSingle(),
      3500
    );

    if (selectRes.data && selectRes.data.id) {
      const updateRes = await withTimeout(
        supabase
          .from('house_maps')
          .update({
            map_data: mapData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectRes.data.id),
        3500
      );

      if (updateRes.error) {
        return { success: false, error: updateRes.error.message };
      }
    } else {
      const insertRes = await withTimeout(
        supabase
          .from('house_maps')
          .insert({
            house_code: houseCode,
            map_id: mapId,
            map_data: mapData,
            updated_at: new Date().toISOString()
          }),
        3500
      );

      if (insertRes.error) {
        return { success: false, error: insertRes.error.message };
      }
    }

    console.log(`[OnHouse Sync] Successfully saved map '${mapId}' via fallback!`);
    return { success: true };
  } catch (err: any) {
    console.error('[OnHouse Sync] Error in saveHouseMapToDB:', err);
    return { success: false, error: err?.message || 'DB 저장 중 예외 발생' };
  }
};

// Delete map permanently from Supabase DB & house-scoped cache
export const deleteHouseMapFromDB = async (
  houseCode: string,
  mapId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Add mapId to deletedMapIds for this house
    const deletedIds = await fetchHouseDeletedMaps(houseCode);
    if (!deletedIds.includes(mapId)) {
      deletedIds.push(mapId);
      await saveHouseDeletedMapsToDB(houseCode, deletedIds);
    }

    // 2. Remove from house-scoped local cache
    const houseCacheKey = `on_house_${houseCode}_maps`;
    try {
      const cachedStr = localStorage.getItem(houseCacheKey);
      if (cachedStr) {
        const houseMaps: Record<string, MapDefinition> = JSON.parse(cachedStr);
        delete houseMaps[mapId];
        localStorage.setItem(houseCacheKey, JSON.stringify(houseMaps));
      }
    } catch (e) {}

    // 3. Delete from Supabase house_maps table
    await withTimeout(
      supabase
        .from('house_maps')
        .delete()
        .eq('house_code', houseCode)
        .eq('map_id', mapId),
      3000
    );

    return { success: true };
  } catch (err: any) {
    console.error('Error in deleteHouseMapFromDB:', err);
    return { success: false, error: err?.message || 'DB 맵 삭제 중 예외 발생' };
  }
};

export const fetchHouseAssets = async (houseCode: string) => {
  try {
    // Trigger automatic DB trash cleanup in background to free storage space!
    cleanupDatabaseTrash(houseCode).catch(() => {});

    let dbFetchFailed = false;

    // 1. Fetch map_tileset specifically (targeted & fast, ~0.5s)
    const mapTilesetsPromise = withTimeout(
      supabase
        .from('house_assets')
        .select('asset_type, asset_data')
        .eq('house_code', houseCode)
        .eq('asset_type', 'map_tileset'),
      8000
    ).catch(() => { dbFetchFailed = true; return { data: [] }; });

    // 2. Fetch char_sprites, overrides, actions, deletes in parallel
    const otherAssetsPromise = withTimeout(
      supabase
        .from('house_assets')
        .select('asset_type, asset_data')
        .eq('house_code', houseCode)
        .in('asset_type', ['char_sprite', 'char_image_override', 'char_row_actions', 'char_delete'])
        .order('id', { ascending: false })
        .limit(300),
      12000
    ).catch(() => { dbFetchFailed = true; return { data: [] }; });

    const [mapRes, otherRes] = await Promise.all([mapTilesetsPromise, otherAssetsPromise]);
    if (mapRes.error || otherRes.error) dbFetchFailed = true;
    
    const combinedData = [...(mapRes.data || []), ...(otherRes.data || [])];

    const mapTilesets: any[] = [];
    const charSprites: any[] = [];
    const charOverrides: Record<string, any> = {};
    const charRowActions: Record<string, string[]> = {};
    const deletedAssetIds = new Set<string>();
    const seenCharSpriteIds = new Set<string>();
    const seenMapTilesetIds = new Set<string>();

    if (combinedData.length > 0) {
      // Pass 1: Collect all delete records first
      combinedData.forEach((row: any) => {
        if (row.asset_data && row.asset_type === 'char_delete' && row.asset_data.id) {
          deletedAssetIds.add(row.asset_data.id);
        }
      });

      // Pass 2: Filter active assets
      combinedData.forEach((row: any) => {
        if (!row.asset_data || !row.asset_data.id) return;
        const id = row.asset_data.id;
        if (deletedAssetIds.has(id)) return;

        if (row.asset_type === 'map_tileset') {
          if (!seenMapTilesetIds.has(id)) {
            seenMapTilesetIds.add(id);
            mapTilesets.push(row.asset_data);
          }
        } else if (row.asset_type === 'char_sprite') {
          if (!seenCharSpriteIds.has(id)) {
            seenCharSpriteIds.add(id);
            charSprites.push(row.asset_data);
          }
        } else if (row.asset_type === 'char_image_override') {
          if (!charOverrides[id]) {
            charOverrides[id] = row.asset_data;
          }
        } else if (row.asset_type === 'char_row_actions' && row.asset_data.actions) {
          if (!charRowActions[id]) {
            charRowActions[id] = row.asset_data.actions;
          }
        }
      });
    }

    // Merge DB assets with existing local assets (preserving locally created assets that aren't tombstoned)
    const finalCharSprites = [...charSprites];
    try {
      const savedLocalStr = localStorage.getItem('on_house_custom_char_sprites');
      if (savedLocalStr) {
        const savedLocal: any[] = JSON.parse(savedLocalStr);
        savedLocal.forEach((loc) => {
          if (loc && loc.id && !deletedAssetIds.has(loc.id) && !seenCharSpriteIds.has(loc.id)) {
            seenCharSpriteIds.add(loc.id);
            finalCharSprites.push(loc);
            // Re-sync un-saved local asset to Supabase DB asynchronously ONLY if DB didn't fail
            if (!dbFetchFailed) saveHouseAssetToDB(houseCode, 'char_sprite', loc).catch(() => {});
          }
        });
      }
    } catch (e) {}

    const finalMapTilesets = [...mapTilesets];
    try {
      const savedLocalMapStr = localStorage.getItem('on_house_custom_map_tilesets');
      if (savedLocalMapStr) {
        const savedLocalMaps: any[] = JSON.parse(savedLocalMapStr);
        savedLocalMaps.forEach((loc) => {
          if (loc && loc.id && !deletedAssetIds.has(loc.id) && !seenMapTilesetIds.has(loc.id)) {
            seenMapTilesetIds.add(loc.id);
            finalMapTilesets.push(loc);
            if (!dbFetchFailed) saveHouseAssetToDB(houseCode, 'map_tileset', loc).catch(() => {});
          }
        });
      }
    } catch (e) {}

    // Merge DB overrides & row actions with local overrides & row actions (preserving higher row counts or local additions)
    try {
      const savedLocalOverridesStr = localStorage.getItem('on_house_char_image_overrides');
      if (savedLocalOverridesStr) {
        const savedLocalOverrides = JSON.parse(savedLocalOverridesStr);
        Object.entries(savedLocalOverrides).forEach(([id, locOv]: [string, any]) => {
          if (locOv && locOv.url) {
            const dbOv = charOverrides[id];
            // If local override has more rows or DB has no override for this ID, use local override & re-sync to DB!
            if (!dbOv || (locOv.rows && (!dbOv.rows || locOv.rows > dbOv.rows))) {
              if (dbFetchFailed) {
                // If DB fetch failed, we just silently merge it locally without logging to avoid spam
                charOverrides[id] = locOv;
              } else {
                console.log(`[OnHouse Sync] 🔄 Preserving local override for '${id}' (rows: ${locOv.rows}) over DB (rows: ${dbOv?.rows || 0})`);
                charOverrides[id] = locOv;
                saveHouseAssetToDB(houseCode, 'char_image_override', { id, ...locOv }).catch(() => {});
              }
            }
          }
        });
      }
    } catch (e) {}

    try {
      const savedLocalActionsStr = localStorage.getItem('on_house_char_row_actions');
      if (savedLocalActionsStr) {
        const savedLocalActions = JSON.parse(savedLocalActionsStr);
        Object.entries(savedLocalActions).forEach(([id, locActs]: [string, any]) => {
          if (locActs && Array.isArray(locActs) && locActs.length > 0) {
            const dbActs = charRowActions[id];
            // If local actions has more items or DB has no actions for this ID, use local actions & re-sync to DB!
            if (!dbActs || (Array.isArray(dbActs) && locActs.length > dbActs.length)) {
              if (dbFetchFailed) {
                charRowActions[id] = locActs;
              } else {
                console.log(`[OnHouse Sync] 🔄 Preserving local row actions for '${id}' (count: ${locActs.length}) over DB (count: ${dbActs?.length || 0})`);
                charRowActions[id] = locActs;
                saveHouseAssetToDB(houseCode, 'char_row_actions', { id, actions: locActs }).catch(() => {});
              }
            }
          }
        });
      }
    } catch (e) {}

    try {
      localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(finalMapTilesets));
      localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(finalCharSprites));
      localStorage.setItem('on_house_char_image_overrides', JSON.stringify(charOverrides));
      localStorage.setItem('on_house_char_row_actions', JSON.stringify(charRowActions));

      localStorage.setItem(`on_house_custom_map_tilesets_${houseCode}`, JSON.stringify(finalMapTilesets));
      localStorage.setItem(`on_house_custom_char_sprites_${houseCode}`, JSON.stringify(finalCharSprites));
      localStorage.setItem(`on_house_char_image_overrides_${houseCode}`, JSON.stringify(charOverrides));
      localStorage.setItem(`on_house_char_row_actions_${houseCode}`, JSON.stringify(charRowActions));
    } catch (e) {}

    return {
      mapTilesets: finalMapTilesets,
      charSprites: finalCharSprites,
      charOverrides,
      charRowActions
    };
  } catch (err) {
    console.warn('Supabase fetchHouseAssets warning/timeout:', err);
    let mapTilesets: any[] = [];
    let charSprites: any[] = [];
    let charOverrides: Record<string, any> = {};
    let charRowActions: Record<string, string[]> = {};
    try {
      const savedMaps = localStorage.getItem('on_house_custom_map_tilesets');
      if (savedMaps) mapTilesets = JSON.parse(savedMaps);
      const savedChars = localStorage.getItem('on_house_custom_char_sprites');
      if (savedChars) charSprites = JSON.parse(savedChars);
      const savedOverrides = localStorage.getItem('on_house_char_image_overrides');
      if (savedOverrides) charOverrides = JSON.parse(savedOverrides);
      const savedActions = localStorage.getItem('on_house_char_row_actions');
      if (savedActions) charRowActions = JSON.parse(savedActions);
    } catch (e) {}
    return { mapTilesets, charSprites, charOverrides, charRowActions };
  }
};

// Save custom asset to Supabase (Overwrites existing older rows for same asset ID to save DB space)
export const saveHouseAssetToDB = async (
  houseCode: string,
  assetType: 'map_tileset' | 'char_sprite' | 'char_image_override' | 'char_row_actions',
  assetData: any
) => {
  try {
    // Note: We deliberately SKIP synchronous deletion of older rows here to avoid 
    // expensive sequential JSONB scans (asset_data->>id) that cause DB timeouts under load.
    // The background `cleanupDatabaseTrash` function handles garbage collection of duplicates efficiently.

    const res = await withTimeout(
      supabase
        .from('house_assets')
        .insert({
          house_code: houseCode,
          asset_type: assetType,
          asset_data: assetData,
          updated_at: new Date().toISOString()
        }),
      3500
    );

    if (res.error) {
      console.error('Failed to save asset to Supabase:', res.error.message);
      return { success: false, error: res.error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error in saveHouseAssetToDB:', err);
    return { success: false, error: err?.message || 'DB 에셋 저장 실패' };
  }
};

// Delete custom asset from Supabase DB (Hard Delete: Permanently wipes matching rows to free DB space!)
export const deleteHouseAssetFromDB = async (
  houseCode: string,
  assetType: 'map_tileset' | 'char_sprite' | 'char_image_override' | 'char_row_actions',
  assetId: string
) => {
  try {
    console.log(`[OnHouse Sync] Hard deleting asset '${assetId}' (${assetType}) from DB for house [${houseCode}]...`);

    // 1. Hard delete all asset rows matching assetId in house_assets
    await withTimeout(
      supabase
        .from('house_assets')
        .delete()
        .eq('house_code', houseCode)
        .eq('asset_data->>id', assetId),
      4000
    );

    // 2. Also delete any tombstone records
    await withTimeout(
      supabase
        .from('house_assets')
        .delete()
        .eq('house_code', houseCode)
        .eq('asset_type', 'char_delete'),
      3000
    ).catch(() => {});

    return { success: true };
  } catch (err: any) {
    console.error('Error in deleteHouseAssetFromDB:', err);
    return { success: false };
  }
};

// Clean up all obsolete duplicate rows and tombstone delete records from Supabase DB to free storage space
export const cleanupDatabaseTrash = async (houseCode: string) => {
  try {
    console.log(`[OnHouse Cleanup] Running DB trash cleanup for houseCode: ${houseCode}...`);

    const { data: rows, error } = await supabase
      .from('house_assets')
      .select('id, asset_type, asset_data, updated_at')
      .eq('house_code', houseCode);

    if (error || !rows || rows.length === 0) {
      console.log('[OnHouse Cleanup] No rows to clean or query error');
      return;
    }

    const deletedIds = new Set<string>();
    rows.forEach((row: any) => {
      if (row.asset_type === 'char_delete' && row.asset_data?.id) {
        deletedIds.add(row.asset_data.id);
      }
    });

    const rowIdsToDelete: (string | number)[] = [];
    const latestRowMap = new Map<string, { dbRowId: string | number; updatedAt: string }>();

    rows.forEach((row: any) => {
      const assetId = row.asset_data?.id;

      if (row.asset_type === 'char_delete') {
        rowIdsToDelete.push(row.id);
        return;
      }

      if (assetId && deletedIds.has(assetId)) {
        rowIdsToDelete.push(row.id);
        return;
      }

      if (assetId && (row.asset_type === 'char_sprite' || row.asset_type === 'char_image_override' || row.asset_type === 'map_tileset')) {
        const groupKey = `${row.asset_type}:${assetId}`;
        const existing = latestRowMap.get(groupKey);

        if (!existing) {
          latestRowMap.set(groupKey, { dbRowId: row.id, updatedAt: row.updated_at || '' });
        } else {
          const timeExisting = new Date(existing.updatedAt).getTime() || 0;
          const timeCurrent = new Date(row.updated_at || 0).getTime() || 0;

          if (timeCurrent > timeExisting) {
            rowIdsToDelete.push(existing.dbRowId);
            latestRowMap.set(groupKey, { dbRowId: row.id, updatedAt: row.updated_at || '' });
          } else {
            rowIdsToDelete.push(row.id);
          }
        }
      }
    });

    if (rowIdsToDelete.length > 0) {
      console.log(`[OnHouse Cleanup] Found ${rowIdsToDelete.length} trash/obsolete rows to hard-delete from DB:`, rowIdsToDelete);
      
      for (let i = 0; i < rowIdsToDelete.length; i += 50) {
        const chunk = rowIdsToDelete.slice(i, i + 50);
        await supabase
          .from('house_assets')
          .delete()
          .in('id', chunk);
      }
      console.log(`[OnHouse Cleanup] ✅ Successfully hard-deleted ${rowIdsToDelete.length} trash rows from Supabase DB!`);
    } else {
      console.log('[OnHouse Cleanup] DB is already clean. No trash rows found.');
    }
  } catch (err) {
    console.warn('[OnHouse Cleanup] Error cleaning DB trash:', err);
  }
};

// ----------------------------------------------------
// Open Marketplace (오픈 마켓 상점) Service API
// ----------------------------------------------------

export interface MarketItem {
  id: string;
  type: 'character' | 'map_tileset' | 'map';
  title: string;
  description: string;
  creatorName: string;
  originalHouseCode: string;
  createdAt: string;
  downloadsCount: number;
  likesCount: number;
  previewDataUrl: string;
  payload: {
    character?: any;
    mapTileset?: any;
    mapData?: any;
    bundledTilesets?: any[];
  };
}

// Fetch all market items from Supabase DB (or fallback to LocalStorage)
export const fetchMarketItems = async (): Promise<MarketItem[]> => {
  try {
    const res = await withTimeout(
      supabase
        .from('house_assets')
        .select('asset_data')
        .eq('house_code', 'GLOBAL_MARKET')
        .eq('asset_type', 'market_item')
        .order('id', { ascending: false })
        .limit(200),
      4000
    );

    const items: MarketItem[] = [];
    if (res.data && res.data.length > 0) {
      res.data.forEach((row: any) => {
        if (row.asset_data && row.asset_data.id && row.asset_data.title) {
          items.push(row.asset_data as MarketItem);
        }
      });
    }

    // Merge with local fallback market items
    try {
      const localStr = localStorage.getItem('on_house_global_market_items');
      if (localStr) {
        const localItems: MarketItem[] = JSON.parse(localStr);
        localItems.forEach((li) => {
          if (!items.some((i) => i.id === li.id)) {
            items.unshift(li);
          }
        });
      }
    } catch (e) {}

    return items;
  } catch (err) {
    console.warn('[OnHouse Market] fetchMarketItems timeout/error, using local fallback:', err);
    try {
      const localStr = localStorage.getItem('on_house_global_market_items');
      return localStr ? JSON.parse(localStr) : [];
    } catch (e) {
      return [];
    }
  }
};

// Publish an asset or map to the global open market
export const publishItemToMarket = async (
  itemData: Omit<MarketItem, 'id' | 'createdAt' | 'downloadsCount' | 'likesCount'>
): Promise<{ success: boolean; itemId?: string; error?: string }> => {
  try {
    const newItem: MarketItem = {
      ...itemData,
      id: 'mkt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      createdAt: new Date().toISOString(),
      downloadsCount: 0,
      likesCount: 0
    };

    // Save locally
    try {
      const localStr = localStorage.getItem('on_house_global_market_items');
      const items: MarketItem[] = localStr ? JSON.parse(localStr) : [];
      items.unshift(newItem);
      localStorage.setItem('on_house_global_market_items', JSON.stringify(items));
    } catch (e) {}

    // Save to Supabase DB
    await withTimeout(
      supabase
        .from('house_assets')
        .insert({
          house_code: 'GLOBAL_MARKET',
          asset_type: 'market_item',
          asset_data: newItem,
          updated_at: new Date().toISOString()
        }),
      4000
    );

    return { success: true, itemId: newItem.id };
  } catch (err: any) {
    console.error('Error in publishItemToMarket:', err);
    return { success: true }; // Local publish succeeds
  }
};

// Increment download counter
export const incrementMarketDownload = async (itemId: string) => {
  try {
    const localStr = localStorage.getItem('on_house_global_market_items');
    if (localStr) {
      const items: MarketItem[] = JSON.parse(localStr);
      const target = items.find((i) => i.id === itemId);
      if (target) {
        target.downloadsCount = (target.downloadsCount || 0) + 1;
        localStorage.setItem('on_house_global_market_items', JSON.stringify(items));
      }
    }
  } catch (e) {}
};

// Increment like counter
export const incrementMarketLike = async (itemId: string) => {
  try {
    const localStr = localStorage.getItem('on_house_global_market_items');
    if (localStr) {
      const items: MarketItem[] = JSON.parse(localStr);
      const target = items.find((i) => i.id === itemId);
      if (target) {
        target.likesCount = (target.likesCount || 0) + 1;
        localStorage.setItem('on_house_global_market_items', JSON.stringify(items));
      }
    }
  } catch (e) {}
};

// Import a MarketItem directly into the current house DB & LocalStorage with full isolation & editability!
export const importMarketItemToMyHouse = async (
  houseCode: string,
  marketItem: MarketItem
): Promise<{ success: boolean; resultId?: string; error?: string }> => {
  try {
    await incrementMarketDownload(marketItem.id);

    // Case 1: Importing a Character Sprite
    if (marketItem.type === 'character' && marketItem.payload.character) {
      const char = marketItem.payload.character;
      const newCharId = 'custom_char_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);

      const newCharObj = {
        id: newCharId,
        name: marketItem.title || char.name || '마켓 캐릭터',
        url: char.dataUrl || char.url,
        dataUrl: char.dataUrl || char.url,
        cols: char.cols || 4,
        rows: char.rows || 7,
        size: char.size || 32,
        spriteType: char.spriteType || newCharId,
        isCustom: true
      };

      // Save to LocalStorage
      const savedStr = localStorage.getItem('on_house_custom_char_sprites');
      const existing: any[] = savedStr ? JSON.parse(savedStr) : [];
      existing.push(newCharObj);
      localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(existing));

      // Save to Supabase DB
      await saveHouseAssetToDB(houseCode, 'char_sprite', newCharObj);
      window.dispatchEvent(new Event('on_house_sprites_updated'));

      return { success: true, resultId: newCharId };
    }

    // Case 2: Importing a Map Tileset Asset
    if (marketItem.type === 'map_tileset' && marketItem.payload.mapTileset) {
      const ts = marketItem.payload.mapTileset;
      const newTilesetId = 'custom_map_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);

      const savedMapsStr = localStorage.getItem('on_house_custom_map_tilesets');
      const existingMaps: any[] = savedMapsStr ? JSON.parse(savedMapsStr) : [];
      const newPrefix = 9000 + existingMaps.length * 1000;

      const newTilesetObj = {
        id: newTilesetId,
        name: marketItem.title || ts.name || '마켓 타일셋',
        url: ts.url || ts.dataUrl,
        cols: ts.cols || 16,
        rows: ts.rows || 16,
        size: ts.size || 16,
        spacing: ts.spacing || 0,
        margin: ts.margin || 0,
        prefix: newPrefix,
        isCustom: true
      };

      existingMaps.push(newTilesetObj);
      localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(existingMaps));

      await saveHouseAssetToDB(houseCode, 'map_tileset', newTilesetObj);
      window.dispatchEvent(new Event('on_house_sprites_updated'));

      return { success: true, resultId: newTilesetId };
    }

    // Case 3: Importing a Full Map (with optional bundled tilesets)
    if (marketItem.type === 'map' && marketItem.payload.mapData) {
      const rawMap = marketItem.payload.mapData;
      const bundledTilesets = marketItem.payload.bundledTilesets || [];

      // 1. Import any bundled custom tilesets into this house first!
      const prefixRemap: Record<number, number> = {};
      const savedMapsStr = localStorage.getItem('on_house_custom_map_tilesets');
      const existingMaps: any[] = savedMapsStr ? JSON.parse(savedMapsStr) : [];

      for (const bTs of bundledTilesets) {
        if (bTs && bTs.url) {
          // Check if identical tileset already imported
          const found = existingMaps.find((m) => m.name === bTs.name && m.url === bTs.url);
          if (found) {
            if (bTs.prefix && found.prefix) {
              prefixRemap[bTs.prefix] = found.prefix;
            }
          } else {
            const newPrefix = 9000 + existingMaps.length * 1000;
            const newTsId = 'custom_map_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
            const newTsObj = {
              id: newTsId,
              name: bTs.name || '마켓 타일셋',
              url: bTs.url,
              cols: bTs.cols || 16,
              rows: bTs.rows || 16,
              size: bTs.size || 16,
              spacing: bTs.spacing || 0,
              margin: bTs.margin || 0,
              prefix: newPrefix,
              isCustom: true
            };
            existingMaps.push(newTsObj);
            await saveHouseAssetToDB(houseCode, 'map_tileset', newTsObj);
            if (bTs.prefix) {
              prefixRemap[bTs.prefix] = newPrefix;
            }
          }
        }
      }
      localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(existingMaps));

      // 2. Clone map data & remap tile prefixes if needed
      const importedMap = JSON.parse(JSON.stringify(rawMap));
      const newMapId = 'custom_preset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);

      importedMap.name = marketItem.title || rawMap.name || '마켓에서 가져온 맵';

      // Remap tile indexes in base, decor, collision
      const remapTileIndex = (idx: number) => {
        if (idx < 9000) return idx;
        const oldPrefix = Math.floor(idx / 1000) * 1000;
        const offset = idx % 1000;
        if (prefixRemap[oldPrefix]) {
          return prefixRemap[oldPrefix] + offset;
        }
        return idx;
      };

      importedMap.baseLayer = importedMap.baseLayer.map((row: number[]) => row.map(remapTileIndex));
      importedMap.decorLayer = importedMap.decorLayer.map((row: number[]) => row.map(remapTileIndex));

      // Save map locally & to DB
      localStorage.setItem('on_house_map_' + newMapId, JSON.stringify(importedMap));
      await saveHouseMapToDB(houseCode, newMapId, importedMap);

      // Save available map IDs
      try {
        const availStr = localStorage.getItem('on_house_available_map_ids');
        const availList: string[] = availStr ? JSON.parse(availStr) : ['room', 'subway', 'park', 'apt'];
        if (!availList.includes(newMapId)) {
          availList.push(newMapId);
          localStorage.setItem('on_house_available_map_ids', JSON.stringify(availList));
        }
      } catch (e) {}

      window.dispatchEvent(new Event('on_house_sprites_updated'));
      return { success: true, resultId: newMapId };
    }

    return { success: false, error: '지원하지 않는 마켓 항목입니다.' };
  } catch (err: any) {
    console.error('Error in importMarketItemToMyHouse:', err);
    return { success: false, error: err?.message || '마켓 항목 가져오기 오류' };
  }
};
