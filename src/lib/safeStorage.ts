// LocalStorage is a best-effort CACHE in this app — Supabase is the source of truth for every
// asset and map. A quota failure must therefore never propagate: the writes below happen inside
// React state updaters, where a thrown QuotaExceededError escapes as an uncaught error and takes
// the whole view down (this is exactly what broke the map editor once storage filled up).
export const safeLocalStorageSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[Storage Warning] LocalStorage quota reached writing "${key}" (${(value.length / 1024).toFixed(0)}KB). Continuing in-memory & cloud DB save.`, err);
    return false;
  }
};

// Cache keys that used to be written but are never read back. They mirrored data already held
// under the unsuffixed key, so every house paid for the same blob twice — on a real account that
// was ~5MB of a ~10MB budget, which is what pushed storage over the edge. Purged on startup so
// existing users get the space back instead of staying wedged until they clear site data.
const DEAD_CACHE_KEY_PREFIXES = [
  'on_house_custom_map_tilesets_',
  'on_house_custom_char_sprites_',
  'on_house_char_image_overrides_',
  'on_house_char_row_actions_'
];
// 'on_house_hue' is here for correctness rather than space: it drove the retired sprite hue-shift,
// and since no UI has been able to change it for many versions, a value left over from an old build
// just silently miscolored the character on the map forever. Purging it heals those clients.
const DEAD_CACHE_KEYS = ['on_house_custom_maps_cache', 'on_house_hue'];

export const purgeDeadStorageKeys = (): number => {
  let freedBytes = 0;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (DEAD_CACHE_KEYS.includes(key) || DEAD_CACHE_KEY_PREFIXES.some((p) => key.startsWith(p))) {
        doomed.push(key);
      }
    }
    for (const key of doomed) {
      freedBytes += (key.length + (localStorage.getItem(key) || '').length) * 2;
      localStorage.removeItem(key);
    }
    if (doomed.length > 0) {
      console.log(`[Storage] 🧹 Purged ${doomed.length} write-only cache keys, freeing ${(freedBytes / 1048576).toFixed(2)}MB.`);
    }
  } catch (e) {}
  return freedBytes;
};
