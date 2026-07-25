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
    return Array.from(new Set(dbDeleted));
  } catch (err) {
    console.warn('[OnHouse Sync] fetchHouseDeletedMaps network/timeout, returning empty list:', err);
    return [];
  }
};

// Save deleted map IDs list to Supabase DB
export const saveHouseDeletedMapsToDB = async (houseCode: string, deletedIds: string[]) => {
  try {
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
      res.data.forEach((row: { map_id: string; map_data: MapDefinition }) => {
        if (!deletedMapIds.includes(row.map_id) && row.map_data && row.map_data.width && row.map_data.height) {
          loadedMaps[row.map_id] = row.map_data;
        }
      });
    }

    console.log(`[OnHouse Sync] Successfully loaded ${Object.keys(loadedMaps).length} maps for houseCode [${houseCode}]:`, Object.keys(loadedMaps));
    return loadedMaps;
  } catch (err) {
    console.warn(`[OnHouse Sync] Supabase fetchHouseMaps timeout/error for [${houseCode}], using fresh default maps:`, err);
    // Always fallback to pristine factory default maps
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

// Fetch custom assets (map tilesets & character sprites) for house code
export const fetchHouseAssets = async (houseCode: string) => {
  try {
    const res = await withTimeout(
      supabase
        .from('house_assets')
        .select('asset_type, asset_data')
        .eq('house_code', houseCode),
      3500
    );

    const mapTilesets: any[] = [];
    const charSprites: any[] = [];

    if (res.data) {
      res.data.forEach((row: any) => {
        if (row.asset_type === 'map_tileset' && row.asset_data) {
          mapTilesets.push(row.asset_data);
        } else if (row.asset_type === 'char_sprite' && row.asset_data) {
          charSprites.push(row.asset_data);
        }
      });
    }

    // Save house-scoped custom asset caches
    try {
      localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(mapTilesets));
      localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(charSprites));
    } catch (e) {}

    return { mapTilesets, charSprites };
  } catch (err) {
    console.warn('Supabase fetchHouseAssets warning/timeout:', err);
    let mapTilesets: any[] = [];
    let charSprites: any[] = [];
    try {
      const savedMaps = localStorage.getItem('on_house_custom_map_tilesets');
      if (savedMaps) mapTilesets = JSON.parse(savedMaps);
      const savedChars = localStorage.getItem('on_house_custom_char_sprites');
      if (savedChars) charSprites = JSON.parse(savedChars);
    } catch (e) {}
    return { mapTilesets, charSprites };
  }
};

// Save custom asset to Supabase
export const saveHouseAssetToDB = async (houseCode: string, assetType: 'map_tileset' | 'char_sprite', assetData: any) => {
  try {
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

// Delete custom asset from Supabase DB
export const deleteHouseAssetFromDB = async (houseCode: string, assetType: 'map_tileset' | 'char_sprite', assetId: string) => {
  try {
    await withTimeout(
      supabase
        .from('house_assets')
        .delete()
        .eq('house_code', houseCode)
        .eq('asset_type', assetType)
        .filter('asset_data->>id', 'eq', assetId),
      3500
    );

    return { success: true };
  } catch (err: any) {
    console.error('Error in deleteHouseAssetFromDB:', err);
    return { success: false };
  }
};
