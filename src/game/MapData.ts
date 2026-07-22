export interface MapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  tileset: string;
  baseLayer: number[][]; // 2D array of tile index
  decorLayer: number[][]; // 2D array for decorations
  collision: boolean[][]; // 2D array of colliders (true = solid)
  spawnPoints: { x: number; y: number }[];
}

// Helper to create an empty 2D grid
const createGrid = (w: number, h: number, fillVal: number): number[][] => {
  return Array.from({ length: h }, () => Array(w).fill(fillVal));
};

const createBoolGrid = (w: number, h: number, fillVal: boolean): boolean[][] => {
  return Array.from({ length: h }, () => Array(w).fill(fillVal));
};

// PRE-FIXED TILE INDEX HELPERS
const getInteriorTile = (col: number, row: number) => 1000 + (row * 22 + col);
// --- MAP 1: MY ROOM (마이 룸) ---
const buildMyRoom = (): MapDefinition => {
  const w = 45;
  const h = 35;
  const base = createGrid(w, h, getInteriorTile(1, 9)); // Wood floor
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);

  for (let x = 0; x < w; x++) {
    base[0][x] = getInteriorTile(1, 0);
    base[1][x] = getInteriorTile(1, 1);
    base[2][x] = getInteriorTile(1, 2);
    
    coll[0][x] = true;
    coll[1][x] = true;
    coll[2][x] = true;
    coll[h - 1][x] = true;
  }
  for (let y = 0; y < h; y++) {
    coll[y][0] = true;
    coll[y][w - 1] = true;
  }

  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  // Bed
  decor[cy - 5][cx - 8] = getInteriorTile(0, 11);
  decor[cy - 5][cx - 7] = getInteriorTile(1, 11);
  decor[cy - 4][cx - 8] = getInteriorTile(0, 12);
  decor[cy - 4][cx - 7] = getInteriorTile(1, 12);
  coll[cy - 5][cx - 8] = true; coll[cy - 5][cx - 7] = true;
  coll[cy - 4][cx - 8] = true; coll[cy - 4][cx - 7] = true;

  // Carpet
  decor[cy - 2][cx - 6] = getInteriorTile(10, 12);
  decor[cy - 2][cx - 5] = getInteriorTile(11, 12);
  decor[cy - 1][cx - 6] = getInteriorTile(10, 13);
  decor[cy - 1][cx - 5] = getInteriorTile(11, 13);

  // Wardrobe / Bookshelf
  decor[3][cx + 8] = getInteriorTile(16, 5);
  decor[4][cx + 8] = getInteriorTile(16, 6);
  coll[3][cx + 8] = true; coll[4][cx + 8] = true;

  decor[3][cx - 2] = getInteriorTile(12, 5);
  decor[4][cx - 2] = getInteriorTile(12, 6);
  coll[3][cx - 2] = true; coll[4][cx - 2] = true;

  // Table & Chairs
  decor[cy][cx] = getInteriorTile(15, 8);
  decor[cy][cx - 1] = getInteriorTile(16, 8);
  decor[cy][cx + 1] = getInteriorTile(16, 8);
  coll[cy][cx] = true; coll[cy][cx - 1] = true; coll[cy][cx + 1] = true;

  return {
    id: 'room',
    name: '🏠 마이 룸',
    width: w,
    height: h,
    tileset: 'interior',
    baseLayer: base,
    decorLayer: decor,
    collision: coll,
    spawnPoints: [{ x: cx, y: cy + 4 }]
  };
};

// --- MAP 2: SUBWAY (지하철역) ---
const buildSubway = (): MapDefinition => {
  const w = 55;
  const h = 28;
  const base = createGrid(w, h, getInteriorTile(3, 9)); 
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);

  for (let x = 0; x < w; x++) {
    base[0][x] = getInteriorTile(2, 16);
    base[1][x] = getInteriorTile(3, 16);
    base[2][x] = getInteriorTile(4, 16);
    
    coll[0][x] = true;
    coll[1][x] = true;
    coll[2][x] = true;
    coll[h - 1][x] = true;
  }
  for (let y = 0; y < h; y++) {
    coll[y][0] = true;
    coll[y][w - 1] = true;
  }

  for (let x = 5; x < w - 2; x += 8) {
    decor[8][x] = getInteriorTile(12, 0);
    decor[9][x] = getInteriorTile(12, 1);
    coll[8][x] = true; coll[9][x] = true;
  }

  const bx = Math.floor(w / 2);
  return {
    id: 'subway',
    name: '🚇 지하철역',
    width: w,
    height: h,
    tileset: 'interior',
    baseLayer: base,
    decorLayer: decor,
    collision: coll,
    spawnPoints: [{ x: bx, y: 12 }]
  };
};

// --- MAP 3: CLEAN CANVAS PARK (호수공원) ---
// Clean, empty grass canvas for custom map building
const buildLakePark = (): MapDefinition => {
  const w = 50;
  const h = 35;
  // Simple grass base tile (ID 2000)
  const base = createGrid(w, h, 2000); 
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);

  // Outer Map Colliders
  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id: 'park',
    name: '🌳 호수공원',
    width: w,
    height: h,
    tileset: 'outdoor',
    baseLayer: base,
    decorLayer: decor,
    collision: coll,
    spawnPoints: [{ x: 25, y: 17 }]
  };
};

// --- MAP 4: CLEAN CANVAS APT (아파트 단지) ---
const buildApartmentComplex = (): MapDefinition => {
  const w = 50;
  const h = 35;
  const base = createGrid(w, h, 2000);
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);

  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id: 'apt',
    name: '🏢 아파트 단지',
    width: w,
    height: h,
    tileset: 'outdoor',
    baseLayer: base,
    decorLayer: decor,
    collision: coll,
    spawnPoints: [{ x: 25, y: 17 }]
  };
};

export const maps: Record<string, MapDefinition> = {
  room: buildMyRoom(),
  subway: buildSubway(),
  park: buildLakePark(),
  apt: buildApartmentComplex()
};
