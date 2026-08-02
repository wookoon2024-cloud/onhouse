export interface MapObjectInstance {
  id: string;
  tilesetKey: string;
  startCol: number;
  startRow: number;
  width: number;
  height: number;
  x: number; // 맵 타일 X 좌표
  y: number; // 맵 타일 Y 좌표
  layer: 'base' | 'decor';
  layerId?: string; // 바인딩된 고유 레이어 ID (Dynamic Multi-Layer 연동용)
  zIndex?: number; // 앞뒤 순서 제어용 z-index
  tiles?: number[][]; // 커스텀 묶음 오브젝트용 2D 타일 인덱스 배열 (전경)
  bgTiles?: number[][]; // 배경 브러시 타일 보존용 2D 타일 인덱스 배열 (투명 오브젝트 하단)
}

export function cleanDuplicateObjects(objects?: MapObjectInstance[]): MapObjectInstance[] {
  if (!objects || objects.length === 0) return [];
  const seenIds = new Set<string>();
  const seenPos = new Set<string>();
  const result: MapObjectInstance[] = [];

  for (let i = objects.length - 1; i >= 0; i--) {
    const candidate = objects[i];
    const posKey = candidate.tiles
      ? candidate.id
      : `${candidate.x}_${candidate.y}_${candidate.tilesetKey}_${candidate.startCol}_${candidate.startRow}`;
    if (!seenIds.has(candidate.id) && !seenPos.has(posKey)) {
      seenIds.add(candidate.id);
      seenPos.add(posKey);
      result.unshift(candidate);
    }
  }

  return result;
}

export interface CustomTileLayer {
  id: string;
  name: string;
  visible: boolean;
  grid: number[][];
  type?: 'base' | 'decor' | 'top';
}

export interface MapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  tileset: string;
  baseLayer: number[][]; // 2D array of tile index (Layer 1)
  decorLayer: number[][]; // 2D array for decorations (Layer 2)
  layers?: CustomTileLayer[]; // Dynamic multi-layers (Layer 1, Layer 2, Layer 3, Layer 4...)
  collision: boolean[][]; // 2D array of colliders (true = solid)
  spawnPoints: { x: number; y: number }[];
  objects?: MapObjectInstance[];
  sortOrder?: number; // DB Tab display order
}

export function getNormalizedLayers(map: MapDefinition): CustomTileLayer[] {
  if (!map) return [];
  if (map.layers && Array.isArray(map.layers) && map.layers.length > 0) {
    return map.layers.map((l, index) => ({
      id: l.id || (index === 0 ? 'layer_base' : index === 1 ? 'layer_decor' : `layer_${index + 1}`),
      name: l.name || (index === 0 ? '1단계(배경)' : index === 1 ? '2단계(오브젝트)' : `Layer ${index + 1}`),
      visible: l.visible !== false,
      grid: l.grid && Array.isArray(l.grid) && l.grid.length > 0
        ? l.grid
        : (index === 0
            ? (map.baseLayer || Array.from({ length: map.height }, () => Array(map.width).fill(0)))
            : (index === 1
                ? (map.decorLayer || Array.from({ length: map.height }, () => Array(map.width).fill(-1)))
                : Array.from({ length: map.height }, () => Array(map.width).fill(-1))))
    }));
  }

  const baseGrid = map.baseLayer || Array.from({ length: map.height }, () => Array(map.width).fill(0));
  const decorGrid = map.decorLayer || Array.from({ length: map.height }, () => Array(map.width).fill(-1));

  return [
    {
      id: 'layer_base',
      name: '1단계(배경)',
      visible: true,
      grid: baseGrid,
      type: 'base'
    },
    {
      id: 'layer_decor',
      name: '2단계(오브젝트)',
      visible: true,
      grid: decorGrid,
      type: 'decor'
    }
  ];
}

export const DEFAULT_CHAR_ROW_ACTIONS: Record<string, string[]> = {
  ninja_blue: ['대기', '걷기1', '걷기2', '걷기3', '공격', '피격', '환호'],
  samurai_blue: ['대기', '걷기1', '걷기2', '걷기3', '공격', '피격', '환호'],
  samurai_green: ['대기', '걷기1', '걷기2', '걷기3', '공격', '피격', '환호'],
  pig: ['대기', '걷기1'],
};

const DEFAULT_PRESET_ACTIONS = ['대기', '걷기1', '걷기2', '걷기3', '공격', '피격', '환호'];

export function getCharRowActions(spriteType: string, totalRows?: number): string[] {
  let list: string[] = [];
  try {
    const saved = localStorage.getItem('on_house_char_row_actions');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed[spriteType] && Array.isArray(parsed[spriteType])) {
        list = parsed[spriteType];
      }
    }
  } catch (e) {
    // fallback
  }

  if (!list || list.length === 0) {
    list = DEFAULT_CHAR_ROW_ACTIONS[spriteType] || DEFAULT_PRESET_ACTIONS;
  }

  if (totalRows !== undefined && totalRows > 0) {
    const result: string[] = [];
    for (let i = 0; i < totalRows; i++) {
      if (i < list.length && list[i] !== undefined) {
        result.push(list[i]);
      } else {
        result.push(i < DEFAULT_PRESET_ACTIONS.length ? DEFAULT_PRESET_ACTIONS[i] : `동작 ${i + 1}`);
      }
    }
    return result;
  }

  return list;
}

export interface CharSpriteInfo {
  cols: number;
  rows: number;
  size: number;
  frameWidth?: number;
  frameHeight?: number;
  offsetX?: number;
  offsetY?: number;
  spacingX?: number;
  spacingY?: number;
}

export function getCustomCharSpriteInfo(spriteType: string): CharSpriteInfo {
  try {
    const savedOverrides = localStorage.getItem('on_house_char_image_overrides');
    if (savedOverrides) {
      const overrides = JSON.parse(savedOverrides);
      if (overrides[spriteType]) {
        const item = overrides[spriteType];
        return {
          cols: item.cols || 4,
          rows: item.rows || 7,
          size: item.size || 16,
          frameWidth: item.frameWidth,
          frameHeight: item.frameHeight,
          offsetX: item.offsetX || 0,
          offsetY: item.offsetY || 0,
          spacingX: item.spacingX || 0,
          spacingY: item.spacingY || 0
        };
      }
    }
    const savedCustom = localStorage.getItem('on_house_custom_char_sprites');
    if (savedCustom) {
      const customList = JSON.parse(savedCustom);
      const matched = customList.find((item: any) => item.id === spriteType);
      if (matched) {
        return {
          cols: matched.cols || 4,
          rows: matched.rows || 7,
          size: matched.size || 16,
          frameWidth: matched.frameWidth,
          frameHeight: matched.frameHeight,
          offsetX: matched.offsetX || 0,
          offsetY: matched.offsetY || 0,
          spacingX: matched.spacingX || 0,
          spacingY: matched.spacingY || 0
        };
      }
    }
  } catch (e) {}

  if (spriteType === 'pig') return { cols: 2, rows: 1, size: 16 };
  return { cols: 4, rows: 7, size: 16 };
}

export function getCharGridDimensions(spriteType: string): { cols: number; rows: number } {
  const info = getCustomCharSpriteInfo(spriteType);
  return { cols: info.cols, rows: info.rows };
}

export function getCharDisplaySize(spriteType: string): number {
  const info = getCustomCharSpriteInfo(spriteType);
  return info.size || 16;
}

// Helper to create an empty 2D grid
const createGrid = (w: number, h: number, fillVal: number): number[][] => {
  return Array.from({ length: h }, () => Array(w).fill(fillVal));
};

const createBoolGrid = (w: number, h: number, fillVal: boolean): boolean[][] => {
  return Array.from({ length: h }, () => Array(w).fill(fillVal));
};

export const createCustomMap = (id: string, name: string, tileset: string = 'outdoor'): MapDefinition => {
  const w = 40;
  const h = 30;
  // Initialize with -1 for 100% clean, black canvas (no auto-prefilled grass/floor tiles!)
  const base = createGrid(w, h, -1);
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);
  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id,
    name,
    width: w, height: h,
    tileset,
    baseLayer: base, decorLayer: decor, collision: coll,
    layers: [
      { id: 'layer_base', name: '1단계(배경)', visible: true, grid: base, type: 'base' },
      { id: 'layer_decor', name: '2단계(오브젝트)', visible: true, grid: decor, type: 'decor' }
    ],
    spawnPoints: [{ x: 20, y: 15 }]
  };
};

// The 7 built-in preset map layouts (room/subway/park/apt/village/water/forest) have been removed
// entirely per product decision — new maps are always blank custom canvases (createCustomMap).
// These stay exported as empty so existing call sites that look something up in them degrade to
// "not found" instead of needing to be ripped out one by one.
export const PRESET_MAP_TEMPLATES: Record<string, { name: string; builder: () => MapDefinition }> = {};
export const maps: Record<string, MapDefinition> = {};

export const isCellCollision = (map: MapDefinition, tx: number, ty: number): boolean => {
  if (!map || tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return true;
  if (map.collision && map.collision[ty] && map.collision[ty][tx]) return true;
  return false;
};

// Check if a player at pixel position (px, py) collides with map bounds or collision cells
export const isPlayerCollidingAt = (map: MapDefinition, px: number, py: number): boolean => {
  if (!map) return true;
  const box = {
    left: px + 3,
    right: px + 13,
    top: py + 10,
    bottom: py + 16
  };

  const tileLeft = Math.floor(box.left / 16);
  const tileRight = Math.floor(box.right / 16);
  const tileTop = Math.floor(box.top / 16);
  const tileBottom = Math.floor(box.bottom / 16);

  if (tileLeft < 0 || tileRight >= map.width || tileTop < 0 || tileBottom >= map.height) {
    return true;
  }

  for (let ty = tileTop; ty <= tileBottom; ty++) {
    for (let tx = tileLeft; tx <= tileRight; tx++) {
      if (isCellCollision(map, tx, ty)) {
        return true;
      }
    }
  }
  return false;
};

export const findValidSpawnPosition = (map: MapDefinition): { x: number; y: number } => {
  if (!map) return { x: 10, y: 10 };

  // 1. Try pre-configured spawn points first
  if (map.spawnPoints && map.spawnPoints.length > 0) {
    for (const sp of map.spawnPoints) {
      if (!isPlayerCollidingAt(map, sp.x * 16, sp.y * 16)) {
        return { x: sp.x, y: sp.y };
      }
    }
  }

  // 2. Try map center
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);
  if (!isPlayerCollidingAt(map, cx * 16, cy * 16)) {
    return { x: cx, y: cy };
  }

  // 3. BFS search from center/spawnPoint to find nearest non-collision tile
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [];

  const startX = map.spawnPoints?.[0]?.x ?? cx;
  const startY = map.spawnPoints?.[0]?.y ?? cy;
  queue.push({ x: startX, y: startY });
  visited.add(`${startX},${startY}`);

  const directions = [
    { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 },
    { x: 1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (!isPlayerCollidingAt(map, curr.x * 16, curr.y * 16)) {
      return { x: curr.x, y: curr.y };
    }

    for (const d of directions) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      const key = `${nx},${ny}`;
      if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height && !visited.has(key)) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  // Fallback if map is 100% collision
  return { x: startX, y: startY };
};
