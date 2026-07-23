import { supabase } from '../lib/supabase';
import type { MapMemo, InventoryItem } from '../types/memo';

// LocalStorage helpers for Memos
export const getLocalMemos = (houseCode: string, mapId: string): MapMemo[] => {
  try {
    const saved = localStorage.getItem(`on_house_memos_${houseCode}_${mapId}`);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const saveLocalMemos = (houseCode: string, mapId: string, memos: MapMemo[]) => {
  try {
    localStorage.setItem(`on_house_memos_${houseCode}_${mapId}`, JSON.stringify(memos));
  } catch {}
};

// Fetch Memos from Supabase DB
export const fetchHouseMemos = async (houseCode: string, mapId: string): Promise<MapMemo[]> => {
  const local = getLocalMemos(houseCode, mapId);
  try {
    const { data, error } = await supabase
      .from('house_assets')
      .select('asset_data')
      .eq('house_code', houseCode)
      .eq('asset_type', `memo_${mapId}`);

    if (error || !data) return local;

    const dbMemos: MapMemo[] = data.map((row) => row.asset_data).filter(Boolean);
    const mergedMap = new Map<string, MapMemo>();
    local.forEach(m => mergedMap.set(m.id, m));
    dbMemos.forEach(m => mergedMap.set(m.id, m));

    const result = Array.from(mergedMap.values());
    saveLocalMemos(houseCode, mapId, result);
    return result;
  } catch {
    return local;
  }
};

// Save a Memo to DB & LocalStorage
export const saveMemoToDB = async (houseCode: string, memo: MapMemo) => {
  const current = getLocalMemos(houseCode, memo.mapId);
  const updated = [...current.filter(m => m.id !== memo.id), memo];
  saveLocalMemos(houseCode, memo.mapId, updated);

  try {
    await supabase.from('house_assets').insert({
      house_code: houseCode,
      asset_type: `memo_${memo.mapId}`,
      asset_data: memo,
      updated_at: new Date().toISOString()
    });
  } catch (err) {}
};

// Delete a Memo from DB & LocalStorage
export const deleteMemoFromDB = async (houseCode: string, mapId: string, memoId: string) => {
  const current = getLocalMemos(houseCode, mapId);
  const updated = current.filter(m => m.id !== memoId);
  saveLocalMemos(houseCode, mapId, updated);

  try {
    await supabase
      .from('house_assets')
      .delete()
      .eq('house_code', houseCode)
      .eq('asset_type', `memo_${mapId}`)
      .filter('asset_data->>id', 'eq', memoId);
  } catch (err) {}
};

// LocalStorage helpers for Inventory
export const getLocalInventory = (): InventoryItem[] => {
  try {
    const saved = localStorage.getItem('on_house_player_inventory');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const saveLocalInventory = (items: InventoryItem[]) => {
  try {
    localStorage.setItem('on_house_player_inventory', JSON.stringify(items));
  } catch {}
};
