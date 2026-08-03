import React, { useRef, useEffect, useState } from 'react';
import { type MapDefinition, type MapObjectInstance, type CustomTileLayer, cleanDuplicateObjects, maps, getNormalizedLayers, createCustomMap } from '../game/MapData';
import { Trash2, Save, X, Undo, Redo, Pipette, Paintbrush, PaintBucket, Eraser, Info, Sparkles, Plus, Download, Upload, Pencil, MousePointer, Copy, Layers, MoveUp, MoveDown, ShieldAlert } from 'lucide-react';
import { getTileDrawInfo, getTilesetInfo } from '../game/CanvasGame';
import { publishItemToMarket, getSavedHouseCode } from '../services/HouseService';
import { useEditLock } from '../hooks/useEditLock';

import interiorTilesUrl from '../assets/interior_tiles.png';
import outdoorTilesUrl from '../assets/outdoor_tiles.png';
import villageTilesUrl from '../assets/village_tiles.png';
import wallTilesUrl from '../assets/wall_tiles.png';
import houseTilesUrl from '../assets/house_tiles.png';
import natureTilesUrl from '../assets/nature_tiles.png';
import waterTilesUrl from '../assets/water_tiles.png';
import fieldTilesUrl from '../assets/field_tiles.png';

interface TilesetOption {
  id: string;
  name: string;
  url: string;
  cols: number;
  rows: number;
  size?: number;
  prefix?: number;
  isCustom?: boolean;
}

const getCustomMapTilesets = (): TilesetOption[] => {
  try {
    const saved = localStorage.getItem('on_house_custom_map_tilesets');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
};

interface MapEditorViewProps {
  activeMaps: Record<string, MapDefinition>;
  availableMapIds: string[];
  initialMapId?: string;
  onSaveMap: (mapId: string, updatedMap: MapDefinition) => void;
  onAddMap: (presetId?: string, customName?: string) => string;
  onDeleteMap: (mapId: string) => void;
  onRenameMap?: (mapId: string, newName: string) => void;
  onReorderMaps?: (newOrder: string[]) => void;
  onClose: () => void;
}

export const MapEditorView: React.FC<MapEditorViewProps> = ({
  activeMaps,
  availableMapIds,
  initialMapId,
  onSaveMap,
  onAddMap,
  onDeleteMap,
  onRenameMap,
  onReorderMaps,
  onClose
}) => {
  const [tabMapIds, setTabMapIds] = useState<string[]>(availableMapIds);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  useEffect(() => {
    setTabMapIds(availableMapIds);
  }, [availableMapIds]);

  const handleTabDragStart = (e: React.DragEvent, mId: string) => {
    setDraggedTabId(mId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", mId);
  };

  const handleTabDragOver = (e: React.DragEvent, mId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTabId !== mId) {
      setDragOverTabId(mId);
    }
  };

  const handleTabDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverTabId(null);
    if (!draggedTabId || draggedTabId === targetId) return;

    const currentOrder = [...tabMapIds];
    const fromIndex = currentOrder.indexOf(draggedTabId);
    const toIndex = currentOrder.indexOf(targetId);

    if (fromIndex !== -1 && toIndex !== -1) {
      currentOrder.splice(fromIndex, 1);
      currentOrder.splice(toIndex, 0, draggedTabId);
      setTabMapIds(currentOrder);
      if (onReorderMaps) {
        onReorderMaps(currentOrder);
      }
    }
    setDraggedTabId(null);
  };

  const handleTabDragEnd = () => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const handleTabDragLeave = () => {
    setDragOverTabId(null);
  };
  const [selectedMapId, setSelectedMapId] = useState<string>(initialMapId && activeMaps[initialMapId] ? initialMapId : (availableMapIds[0] || 'room'));
  // Claim the map being edited. Whoever opened it first keeps write access; everyone else views.
  const editLock = useEditLock('map', selectedMapId);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [customNameInput, setCustomNameInput] = useState<string>('');
  const [editLayer, setEditLayer] = useState<'base' | 'decor' | 'collision'>('decor');
  const [leftSidebarTab, setLeftSidebarTab] = useState<'basic' | 'size' | 'option'>('basic');
  
  // Brush & Tools
  const [selectedTile, setSelectedTile] = useState<number>(1199);
  const [brushSize, setBrushSize] = useState<number>(1);
  const [customBrushInput, setCustomBrushInput] = useState<string>('5');
  const [tool, setTool] = useState<'brush' | 'bucket' | 'eyedropper' | 'select' | 'object' | 'collision'>('select');
  const [collisionSubMode, setCollisionSubMode] = useState<'delete' | 'add'>('delete');
  const [autoCollision, setAutoCollision] = useState<boolean>(true);

  // Palette Drag Selection Box State (Step 1)
  const [paletteDragStart, setPaletteDragStart] = useState<{ col: number; row: number } | null>(null);
  const [paletteSelection, setPaletteSelection] = useState<{ startCol: number; startRow: number; cols: number; rows: number; tilesetKey: string } | null>(null);


  // Object Selection & Smart Editing State (Step 3 & 4)
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const selectedObjectId = selectedObjectIds[0] || null;
  const setSelectedObjectId = (id: string | null) => setSelectedObjectIds(id ? [id] : []);
  const [copiedObject, setCopiedObject] = useState<MapObjectInstance | null>(null);
  const [isDraggingObject, setIsDraggingObject] = useState<boolean>(false);
  const [objectDragStart, setObjectDragStart] = useState<{ originX: number; originY: number; startTx: number; startTy: number } | null>(null);

  // Map Canvas Box Drag Selection State (For merging 1x1 map tiles directly into a single object!)
  const [mapBoxSelectStart, setMapBoxSelectStart] = useState<{ tx: number; ty: number } | null>(null);
  const [mapBoxSelection, setMapBoxSelection] = useState<{ startCol: number; startRow: number; cols: number; rows: number } | null>(null);

  const getActiveToolInstruction = (): string => {
    if (tool === 'collision' || editLayer === 'collision') {
      return collisionSubMode === 'add'
        ? '추가 모드: 캔버스를 클릭하거나 드래그하여 이동 불가 벽을 설치합니다.'
        : '삭제 모드: 캔버스를 클릭하거나 드래그하여 이동 불가 벽을 지웁니다.';
    }
    if (tool === 'select') return '선택(V): 클릭하여 오브젝트/타일 선택 및 드래그 이동/그룹화';
    if (tool === 'eyedropper') return '스포이드(E): 캔버스 타일을 클릭하여 스포이드로 픽 (Alt + 클릭)';
    if (tool === 'object') return '오브젝트(O): 독립 스탬프 형태로 건물/가구 배치';
    if (tool === 'bucket') return '채우기(F): 연결된 동일 타일 영역 전체 채우기';
    if (selectedTile === -1) return '지우개(X): 마우스 클릭 및 드래그로 타일 및 오브젝트 지우기';
    return '브러시(B): 선택한 타일으로 캔버스 타일 그리기';
  };

  // Eyedropper Toast Notification
  const [pickedToast, setPickedToast] = useState<string | null>(null);
  const [isAltPressed, setIsAltPressed] = useState<boolean>(false);
  
  // Open Market Share Modal State for Maps
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [publishTitle, setPublishTitle] = useState<string>('');
  const [publishDesc, setPublishDesc] = useState<string>('');
  const [publishCreator, setPublishCreator] = useState<string>('');
  const [includeCustomTilesets, setIncludeCustomTilesets] = useState<boolean>(true);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  
  // View Settings & Zoom (0.5x to 4.0x)
  const [zoom, setZoom] = useState<number>(1.5); 
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showBase, setShowBase] = useState<boolean>(true);
  const [showDecor, setShowDecor] = useState<boolean>(true);
  const [showCollision, setShowCollision] = useState<boolean>(true);
  
  // Hover cursor highlight
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [hoverPaletteTile, setHoverPaletteTile] = useState<{ col: number; row: number } | null>(null);

  // Resizable Palette Width (280px to 850px) & Palette Scale (1.0x to 3.0x)
  const [paletteWidth, setPaletteWidth] = useState<number>(380);
  const [paletteZoom, setPaletteZoom] = useState<number>(2.0);
  const isResizingPalette = useRef<boolean>(false);

  // Map dimensions local input & Photoshop Anchor
  const [widthInput, setWidthInput] = useState<string>('40');
  const [heightInput, setHeightInput] = useState<string>('30');
  const [canvasAnchor, setCanvasAnchor] = useState<'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se'>('c');

  const sanitizeMapIfEmptyCustom = (map: MapDefinition, mId: string): MapDefinition => {
    if (!map) return map;
    const isCustomMapId = mId.startsWith('custom_') || !['room','subway','park','apt','village','water','forest'].includes(mId);
    const norm = getNormalizedLayers(map);
    const baseGrid = norm[0]?.grid || map.baseLayer;
    const isAllDefaultBase = baseGrid && baseGrid.every(row => row.every(tile => tile === 0 || tile === 2000 || tile === 1000 || tile === -1));
    const hasNoDecorOrObjects = (!map.objects || map.objects.length === 0) && (!map.decorLayer || map.decorLayer.every(r => r.every(t => t === -1)));

    if (isCustomMapId && isAllDefaultBase && hasNoDecorOrObjects) {
      const cleanGrid = Array.from({ length: map.height }, () => Array(map.width).fill(-1));
      return {
        ...map,
        baseLayer: cleanGrid,
        decorLayer: cleanGrid,
        layers: [
          { id: 'layer_base', name: '1단계(배경)', visible: true, grid: cleanGrid, type: 'base' },
          { id: 'layer_decor', name: '2단계(오브젝트)', visible: true, grid: cleanGrid, type: 'decor' }
        ]
      };
    }
    return map;
  };

  const getInitialMap = (): MapDefinition => {
    const targetId = availableMapIds[0] || 'room';
    // No built-in default maps ship anymore — fall back to a fresh blank map as a last resort
    // so the editor never receives undefined (this path shouldn't normally be reached since the
    // editor is gated behind having at least one map, but stay safe regardless).
    const rawMap = activeMaps[targetId] || activeMaps.room || Object.values(activeMaps)[0] || maps.room || createCustomMap(targetId, '새 맵');
    return sanitizeMapIfEmptyCustom(rawMap, targetId);
  };

  const [localMap, setLocalMap] = useState<MapDefinition>(getInitialMap);
  const [originalMap, setOriginalMap] = useState<MapDefinition>(getInitialMap);

  // Dynamic Multi-Layer State & Helper Actions
  const currentLayers = getNormalizedLayers(localMap);
  const [activeLayerId, setActiveLayerId] = useState<string>(() => currentLayers[1]?.id || currentLayers[0]?.id || 'layer_decor');

  const handleAddLayer = () => {
    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);
    setLocalMap(prev => {
      const currentLayers = getNormalizedLayers(prev);
      const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newLayer: CustomTileLayer = {
        id: newLayerId,
        name: `Layer ${currentLayers.length + 1}`,
        visible: true,
        grid: Array.from({ length: prev.height }, () => Array(prev.width).fill(-1))
      };
      const updatedLayers = [...currentLayers, newLayer];
      setActiveLayerId(newLayerId);
      return {
        ...prev,
        layers: updatedLayers
      };
    });
  };

  const handleDuplicateLayer = () => {
    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);
    setLocalMap(prev => {
      const currentLayers = getNormalizedLayers(prev);
      const targetLayer = currentLayers.find(l => l.id === activeLayerId) || currentLayers[currentLayers.length - 1];
      if (!targetLayer) return prev;

      const newLayerId = `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const clonedGrid = targetLayer.grid.map(r => [...r]);
      const newLayer: CustomTileLayer = {
        id: newLayerId,
        name: `${targetLayer.name} 복사`,
        visible: true,
        grid: clonedGrid
      };

      const targetIdx = currentLayers.findIndex(l => l.id === targetLayer.id);
      const updatedLayers = [...currentLayers];
      updatedLayers.splice(targetIdx + 1, 0, newLayer);

      setActiveLayerId(newLayerId);
      return {
        ...prev,
        layers: updatedLayers
      };
    });
  };

  const handleDeleteLayer = () => {
    const currentLayers = getNormalizedLayers(localMap);
    if (currentLayers.length <= 1) {
      alert('최소 1개의 레이어는 유지되어야 합니다.');
      return;
    }

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);
    setLocalMap(prev => {
      const currentLayers = getNormalizedLayers(prev);
      const updatedLayers = currentLayers.filter(l => l.id !== activeLayerId);
      const nextActiveId = updatedLayers[updatedLayers.length - 1]?.id || 'layer_base';

      // Delete all objects that belonged to this activeLayerId!
      const remainingObjects = (prev.objects || []).filter(o =>
        o.layerId ? o.layerId !== activeLayerId : true
      );

      setActiveLayerId(nextActiveId);
      return {
        ...prev,
        baseLayer: updatedLayers[0]?.grid || prev.baseLayer,
        decorLayer: updatedLayers[1]?.grid || prev.decorLayer,
        layers: updatedLayers,
        objects: remainingObjects
      };
    });
  };

  const handleMoveLayer = (index: number, delta: number) => {
    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);
    setLocalMap(prev => {
      const currentLayers = getNormalizedLayers(prev);
      const targetIndex = index + delta;
      if (targetIndex < 0 || targetIndex >= currentLayers.length) return prev;

      const updatedLayers = [...currentLayers];
      const temp = updatedLayers[index];
      updatedLayers[index] = updatedLayers[targetIndex];
      updatedLayers[targetIndex] = temp;

      return {
        ...prev,
        layers: updatedLayers
      };
    });
  };

  const handleToggleLayerVisibility = (layerId: string) => {
    setLocalMap(prev => {
      const currentLayers = getNormalizedLayers(prev);
      const updatedLayers = currentLayers.map(l => {
        if (l.id === layerId) {
          return { ...l, visible: !l.visible };
        }
        return l;
      });
      return {
        ...prev,
        layers: updatedLayers
      };
    });
  };

  // Helper to trim empty (-1) rows and columns around the edges of a 2D tiles grid, adjusting origin coordinates
  const trimTilesGrid = (
    tilesGrid: number[][],
    originX: number,
    originY: number,
    bgGrid?: number[][]
  ): { trimmedGrid: number[][]; trimmedBgGrid?: number[][]; x: number; y: number; width: number; height: number } => {
    const rows = tilesGrid.length;
    if (rows === 0) return { trimmedGrid: [], x: originX, y: originY, width: 0, height: 0 };
    const cols = tilesGrid[0].length;

    let minR = rows, maxR = -1, minC = cols, maxC = -1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hasFg = tilesGrid[r][c] !== -1;
        const hasBg = bgGrid && bgGrid[r] && bgGrid[r][c] !== -1;
        if (hasFg || hasBg) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    if (maxR === -1 || maxC === -1) {
      return { trimmedGrid: tilesGrid, trimmedBgGrid: bgGrid, x: originX, y: originY, width: cols, height: rows };
    }

    const trimmedGrid: number[][] = [];
    const trimmedBgGrid: number[][] = [];
    for (let r = minR; r <= maxR; r++) {
      trimmedGrid.push(tilesGrid[r].slice(minC, maxC + 1));
      if (bgGrid && bgGrid[r]) {
        trimmedBgGrid.push(bgGrid[r].slice(minC, maxC + 1));
      }
    }

    return {
      trimmedGrid,
      trimmedBgGrid: bgGrid ? trimmedBgGrid : undefined,
      x: originX + minC,
      y: originY + minR,
      width: maxC - minC + 1,
      height: maxR - minR + 1
    };
  };

  // Undo / Redo stacks
  const [history, setHistory] = useState<MapDefinition[]>([]);
  const [redoHistory, setRedoHistory] = useState<MapDefinition[]>([]);

  // Canvas painting state
  const isPainting = useRef(false);
  const lastPaintedCellRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [customMapTilesets, setCustomMapTilesets] = useState<TilesetOption[]>(getCustomMapTilesets);
  const [activeTileset, setActiveTileset] = useState<string>(localMap?.tileset || 'interior');

  // Brush History State (Placed AFTER activeTileset to prevent TDZ ReferenceError)
  const [brushHistory, setBrushHistory] = useState<Array<{
    selectedTile: number;
    paletteSelection: { startCol: number; startRow: number; cols: number; rows: number; tilesetKey: string } | null;
    activeTileset: string;
    brushSize?: number;
  }>>([]);

  const addCurrentBrushToHistory = (
    tile: number = selectedTile,
    palSel: typeof paletteSelection = paletteSelection,
    tsKey: string = activeTileset,
    bSize: number = brushSize
  ) => {
    if (tile === -1) return; // Do not add eraser (-1) to history

    setBrushHistory(prev => {
      // Check if current brush is identical to latest item in history
      const isSameAsLatest = prev.length > 0 && 
        prev[0].selectedTile === tile &&
        prev[0].activeTileset === tsKey &&
        prev[0].brushSize === bSize &&
        JSON.stringify(prev[0].paletteSelection) === JSON.stringify(palSel);
      
      if (isSameAsLatest) return prev;

      const filtered = prev.filter(item => 
        !(item.selectedTile === tile && 
          item.activeTileset === tsKey && 
          item.brushSize === bSize &&
          JSON.stringify(item.paletteSelection) === JSON.stringify(palSel))
      );
      
      return [{ selectedTile: tile, paletteSelection: palSel, activeTileset: tsKey, brushSize: bSize }, ...filtered].slice(0, 10);
    });
  };

  useEffect(() => {
    const syncCustomTilesets = () => {
      setCustomMapTilesets(getCustomMapTilesets());
    };

    window.addEventListener('on_house_sprites_updated', syncCustomTilesets);
    window.addEventListener('storage', syncCustomTilesets);
    syncCustomTilesets();

    return () => {
      window.removeEventListener('on_house_sprites_updated', syncCustomTilesets);
      window.removeEventListener('storage', syncCustomTilesets);
    };
  }, []);

  const getTilesetInfoLocal = (ts: string) => {
    const foundCustom = customMapTilesets.find(t => t.id === ts);
    if (foundCustom) {
      return {
        url: foundCustom.url,
        cols: foundCustom.cols,
        rows: foundCustom.rows,
        label: `🎨 ${foundCustom.name}`,
        prefix: foundCustom.prefix || 9000
      };
    }

    const globalInfo = getTilesetInfo(ts);
    let url = outdoorTilesUrl;
    switch (ts) {
      case 'interior': url = interiorTilesUrl; break;
      case 'outdoor': url = outdoorTilesUrl; break;
      case 'village': url = villageTilesUrl; break;
      case 'wall': url = wallTilesUrl; break;
      case 'house': url = houseTilesUrl; break;
      case 'nature': url = natureTilesUrl; break;
      case 'water': url = waterTilesUrl; break;
      case 'field': url = fieldTilesUrl; break;
    }
    return {
      url,
      cols: globalInfo.cols,
      rows: globalInfo.rows,
      label: globalInfo.label,
      prefix: globalInfo.prefix
    };
  };

  const tilesetInfo = getTilesetInfoLocal(activeTileset);
  const tilesetUrl = tilesetInfo.url;
  const tilesetCols = tilesetInfo.cols;
  const tilesetRows = tilesetInfo.rows;

  // Viewport & Space Panning Refs
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isSpaceHeld, setIsSpaceHeld] = useState<boolean>(false);
  const isSpacePressed = useRef<boolean>(false);
  const isPanningViewport = useRef<boolean>(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Refs for handleUndo / handleRedo to avoid stale closures in event listeners
  const handleUndoRef = useRef<() => void>(() => {});
  const handleRedoRef = useRef<() => void>(() => {});

  // Helper handlers for Smart Object Management - Non-destructive Layer Overlay
  const handleDeleteSelectedObject = (targetId?: string) => {
    const idsToDelete = targetId ? [targetId] : selectedObjectIds;
    if (idsToDelete.length === 0) return;

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const targetObjs = (prev.objects || []).filter(o => idsToDelete.includes(o.id));
      if (targetObjs.length === 0) return prev;

      const newCollision = prev.collision.map(r => [...r]);
      const newDecor = prev.decorLayer.map(r => [...r]);

      targetObjs.forEach(obj => {
        const tsInfo = getTilesetInfoLocal(obj.tilesetKey);
        for (let ody = 0; ody < obj.height; ody++) {
          for (let odx = 0; odx < obj.width; odx++) {
            const ptx = obj.x + odx;
            const pty = obj.y + ody;
            if (ptx >= 0 && ptx < prev.width && pty >= 0 && pty < prev.height) {
              if (autoCollision) newCollision[pty][ptx] = false;
              if (tsInfo) {
                const localIdx = (obj.startRow + ody) * tsInfo.cols + (obj.startCol + odx);
                const expectedTile = getPrefixedIndex(localIdx, obj.tilesetKey);
                if (newDecor[pty][ptx] === expectedTile) {
                  newDecor[pty][ptx] = -1;
                }
              }
            }
          }
        }
      });

      return {
        ...prev,
        decorLayer: newDecor,
        collision: newCollision,
        objects: (prev.objects || []).filter(o => !idsToDelete.includes(o.id))
      };
    });

    setSelectedObjectIds([]);
  };

  // Helper function to extract exact tile value at (r, c) for any MapObjectInstance
  const getTileValueForCell = (obj: MapObjectInstance, r: number, c: number): number => {
    const effTsKey = obj.tilesetKey || activeTileset;
    if (obj.tiles && obj.tiles[r] && obj.tiles[r][c] !== undefined && obj.tiles[r][c] !== -1) {
      const rawVal = obj.tiles[r][c];
      return getPrefixedIndex(rawVal, effTsKey);
    }
    const tsInfo = getTilesetInfoLocal(effTsKey) || getTilesetInfo(effTsKey);
    if (tsInfo) {
      const localIdx = (obj.startRow + r) * tsInfo.cols + (obj.startCol + c);
      return getPrefixedIndex(localIdx, effTsKey);
    }
    return -1;
  };

  // 🔗 Merge 2 or more selected objects into a single unified MapObjectInstance!
  const handleMergeSelectedObjects = () => {
    if (selectedObjectIds.length < 2) return;

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const currentObjs = prev.objects || [];
      const targetObjs = currentObjs.filter(o => selectedObjectIds.includes(o.id));
      if (targetObjs.length < 2) return prev;

      const minX = Math.min(...targetObjs.map(o => o.x));
      const minY = Math.min(...targetObjs.map(o => o.y));
      const maxX = Math.max(...targetObjs.map(o => o.x + o.width));
      const maxY = Math.max(...targetObjs.map(o => o.y + o.height));

      const cols = maxX - minX;
      const rows = maxY - minY;

      const tilesGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));

      const sortedTargets = [...targetObjs].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

      sortedTargets.forEach(obj => {
        const offsetX = obj.x - minX;
        const offsetY = obj.y - minY;

        for (let r = 0; r < obj.height; r++) {
          for (let c = 0; c < obj.width; c++) {
            const targetR = offsetY + r;
            const targetC = offsetX + c;
            if (targetR >= 0 && targetR < rows && targetC >= 0 && targetC < cols) {
              const val = getTileValueForCell(obj, r, c);
              if (val !== -1) {
                tilesGrid[targetR][targetC] = val;
              }
            }
          }
        }
      });

      const { trimmedGrid, x: trimmedX, y: trimmedY, width: trimmedW, height: trimmedH } = trimTilesGrid(tilesGrid, minX, minY);

      const primaryTsKey = targetObjs[0].tilesetKey || activeTileset;
      const mergedObj: MapObjectInstance = {
        id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tilesetKey: primaryTsKey,
        startCol: 0,
        startRow: 0,
        width: trimmedW,
        height: trimmedH,
        x: trimmedX,
        y: trimmedY,
        layer: editLayer === "base" ? "base" : "decor",
        layerId: activeLayerId,
        zIndex: Date.now(),
        tiles: trimmedGrid
      };

      const remainingObjs = currentObjs.filter(o => {
        if (selectedObjectIds.includes(o.id)) return false;
        const oMinX = o.x;
        const oMinY = o.y;
        const oMaxX = o.x + o.width;
        const oMaxY = o.y + o.height;
        const overlaps = !(oMaxX <= minX || oMinX >= maxX || oMaxY <= minY || oMinY >= maxY);
        return !overlaps;
      });
      remainingObjs.push(mergedObj);

      setSelectedObjectIds([mergedObj.id]);
      setPickedToast(`✨ ${targetObjs.length}개 오브젝트가 1개의 통합 오브젝트로 병합되었습니다!`);
      setTimeout(() => setPickedToast(null), 2500);

      return {
        ...prev,
        objects: remainingObjs
      };
    });
  };

  // 💥 Explode / Dissolve selected object(s) into background grid tiles!
  const handleExplodeSelectedObjects = () => {
    if (selectedObjectIds.length === 0) return;

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const currentObjs = prev.objects || [];
      const targetObjs = currentObjs.filter(o => selectedObjectIds.includes(o.id));
      if (targetObjs.length === 0) return prev;

      const normLayers = getNormalizedLayers(prev);
      const updatedLayers = normLayers.map(l => ({
        ...l,
        grid: l.grid.map(r => [...r])
      }));

      const newDecor = (prev.decorLayer || []).map(r => [...r]);
      const newBase = (prev.baseLayer || []).map(r => [...r]);
      let restoredCount = 0;

      const newStandaloneObjs: MapObjectInstance[] = [];

      targetObjs.forEach(obj => {
        // Find target layer by obj.layerId or editLayer fallback
        let targetIndex = updatedLayers.findIndex(l => l.id === obj.layerId);
        if (targetIndex === -1) {
          targetIndex = updatedLayers.findIndex(l => l.id === activeLayerId);
        }
        if (targetIndex === -1) {
          targetIndex = obj.layer === "base" ? 0 : 1;
        }

        const targetGrid = updatedLayers[targetIndex].grid;
        const isBase = targetIndex === 0;

        for (let r = 0; r < obj.height; r++) {
          for (let c = 0; c < obj.width; c++) {
            const tileX = obj.x + c;
            const tileY = obj.y + r;
            if (tileX >= 0 && tileX < prev.width && tileY >= 0 && tileY < prev.height) {
              const bgVal = (obj.bgTiles && obj.bgTiles[r] && obj.bgTiles[r][c] !== undefined) ? obj.bgTiles[r][c] : -1;
              let fgVal = getTileValueForCell(obj, r, c);

              // A. If object has a background brush tile stored: restore background tile to map layer grid!
              if (bgVal !== -1) {
                targetGrid[tileY][tileX] = bgVal;
                if (isBase) {
                  newBase[tileY][tileX] = bgVal;
                } else {
                  newDecor[tileY][tileX] = bgVal;
                }
                restoredCount++;

                // If object also has a foreground object tile (e.g. 1x1 transparent window), restore standalone 1x1 object!
                if (fgVal !== -1) {
                  const drawInfo = getTileDrawInfo(fgVal, obj.tilesetKey || prev.tileset);
                  const tsKey = drawInfo?.tilesetKey || obj.tilesetKey || prev.tileset;
                  const tsInfo = getTilesetInfoLocal(tsKey) || getTilesetInfo(tsKey);
                  let startCol = 0, startRow = 0;
                  if (drawInfo && tsInfo) {
                    startCol = drawInfo.localIdx % tsInfo.cols;
                    startRow = Math.floor(drawInfo.localIdx / tsInfo.cols);
                  }
                  newStandaloneObjs.push({
                    id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    tilesetKey: tsKey,
                    startCol,
                    startRow,
                    width: 1,
                    height: 1,
                    x: tileX,
                    y: tileY,
                    layer: obj.layer,
                    layerId: obj.layerId,
                    zIndex: Date.now() + Math.random()
                  });
                }
              } else {
                // Standard dissolve into layer grid
                if (fgVal === -1) {
                  const neighbors: number[] = [];
                  if (c > 0) { const v = getTileValueForCell(obj, r, c - 1); if (v !== -1) neighbors.push(v); }
                  if (c < obj.width - 1) { const v = getTileValueForCell(obj, r, c + 1); if (v !== -1) neighbors.push(v); }
                  if (r > 0) { const v = getTileValueForCell(obj, r - 1, c); if (v !== -1) neighbors.push(v); }
                  if (r < obj.height - 1) { const v = getTileValueForCell(obj, r + 1, c); if (v !== -1) neighbors.push(v); }
                  if (neighbors.length >= 1) {
                    fgVal = neighbors[0];
                  }
                }

                if (fgVal !== -1) {
                  targetGrid[tileY][tileX] = fgVal;
                  if (isBase) {
                    newBase[tileY][tileX] = fgVal;
                  } else {
                    newDecor[tileY][tileX] = fgVal;
                  }
                  restoredCount++;
                }
              }
            }
          }
        }
      });

      const remainingObjs = [...currentObjs.filter(o => !selectedObjectIds.includes(o.id)), ...newStandaloneObjs];

      setSelectedObjectIds([]);
      setPickedToast(`💥 ${targetObjs.length}개 오브젝트가 해제되었습니다!`);
      setTimeout(() => setPickedToast(null), 2500);

      return {
        ...prev,
        baseLayer: newBase,
        decorLayer: newDecor,
        layers: updatedLayers,
        objects: remainingObjs
      };
    });
  };

  const handleCopySelectedObject = () => {
    const targetIds = selectedObjectIds.length > 0 ? selectedObjectIds : (selectedObjectId ? [selectedObjectId] : []);
    if (targetIds.length === 0) return;

    const currentObjs = localMap.objects || [];
    const targetObjs = currentObjs.filter(o => targetIds.includes(o.id));
    if (targetObjs.length === 0) return;

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    const newObjIds: string[] = [];
    const newDuplicatedObjs: MapObjectInstance[] = [];

    // Calculate duplicate offset (+1 tile right, or +1 tile down if at right boundary)
    const maxRight = Math.max(...targetObjs.map(o => o.x + o.width));
    const offsetX = (maxRight < localMap.width - 1) ? 1 : 0;
    const offsetY = (maxRight < localMap.width - 1) ? 0 : 1;

    setLocalMap(prev => {
      const newCollision = prev.collision.map(r => [...r]);

      targetObjs.forEach(obj => {
        const newId = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        newObjIds.push(newId);

        const destX = Math.max(0, Math.min(prev.width - obj.width, obj.x + offsetX));
        const destY = Math.max(0, Math.min(prev.height - obj.height, obj.y + offsetY));

        const duplicatedObj: MapObjectInstance = {
          ...obj,
          id: newId,
          x: destX,
          y: destY,
          zIndex: Date.now() + Math.random()
        };

        if (autoCollision && obj.layer !== 'base') {
          for (let ody = 0; ody < obj.height; ody++) {
            for (let odx = 0; odx < obj.width; odx++) {
              const ptx = destX + odx;
              const pty = destY + ody;
              if (ptx >= 0 && ptx < prev.width && pty >= 0 && pty < prev.height) {
                newCollision[pty][ptx] = true;
              }
            }
          }
        }

        newDuplicatedObjs.push(duplicatedObj);
      });

      return {
        ...prev,
        collision: newCollision,
        objects: [...(prev.objects || []), ...newDuplicatedObjs]
      };
    });

    if (targetObjs.length > 0) {
      setCopiedObject(targetObjs[0]);
    }

    setSelectedObjectIds(newObjIds);
    setPickedToast(`📋 ${targetObjs.length}개 오브젝트가 복사되어 옆에 생성되었습니다!`);
    setTimeout(() => setPickedToast(null), 2000);
  };

  const handlePasteObject = (targetTx?: number, targetTy?: number) => {
    if (!copiedObject) return;
    const destX = targetTx !== undefined ? targetTx : (hoverTile ? hoverTile.x : copiedObject.x + 1);
    const destY = targetTy !== undefined ? targetTy : (hoverTile ? hoverTile.y : copiedObject.y + 1);

    const newId = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const pastedObj: MapObjectInstance = {
      ...copiedObject,
      id: newId,
      x: destX,
      y: destY,
      zIndex: Date.now()
    };

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const newCollision = prev.collision.map(r => [...r]);

      if (autoCollision) {
        for (let ody = 0; ody < pastedObj.height; ody++) {
          for (let odx = 0; odx < pastedObj.width; odx++) {
            const ptx = destX + odx;
            const pty = destY + ody;
            if (ptx >= 0 && ptx < prev.width && pty >= 0 && pty < prev.height) {
              newCollision[pty][ptx] = true;
            }
          }
        }
      }

      return {
        ...prev,
        collision: newCollision,
        objects: [...(prev.objects || []), pastedObj]
      };
    });

    setSelectedObjectId(newId);
    setTool('select');
  };

  const handleBringToFront = (objId?: string) => {
    const ids = selectedObjectIds.length > 0 ? selectedObjectIds : (objId || selectedObjectId ? [objId || selectedObjectId!] : []);
    if (ids.length === 0) return;
    setLocalMap(prev => {
      const objs = prev.objects || [];
      const maxZ = Math.max(...objs.map(o => o.zIndex || 0), 0);
      return {
        ...prev,
        objects: objs.map(o => ids.includes(o.id) ? { ...o, zIndex: maxZ + 1 } : o)
      };
    });
    setPickedToast(`오브젝트 ${ids.length}개를 맨 앞으로 가져왔습니다!`);
    setTimeout(() => setPickedToast(null), 1500);
  };

  const handleSendToBack = (objId?: string) => {
    const ids = selectedObjectIds.length > 0 ? selectedObjectIds : (objId || selectedObjectId ? [objId || selectedObjectId!] : []);
    if (ids.length === 0) return;
    setLocalMap(prev => {
      const objs = prev.objects || [];
      const minZ = Math.min(...objs.map(o => o.zIndex || 0), 0);
      return {
        ...prev,
        objects: objs.map(o => ids.includes(o.id) ? { ...o, zIndex: minZ - 1 } : o)
      };
    });
    setPickedToast(`오브젝트 ${ids.length}개를 맨 뒤로 보냈습니다!`);
    setTimeout(() => setPickedToast(null), 1500);
  };

  // 🧹 Auto-Repair corrupted map data (fills punched -1 holes inside buildings/roofs and cleans floating tile fragments)
  const handleAutoRepairMap = () => {
    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const newDecor = prev.decorLayer.map(r => [...r]);
      const newBase = prev.baseLayer.map(r => [...r]);
      let repairedHoles = 0;
      let cleanedFloating = 0;

      // 1. Fill punched -1 holes in decorLayer by sampling surrounding non-empty decor tiles
      for (let y = 0; y < prev.height; y++) {
        for (let x = 0; x < prev.width; x++) {
          if (newDecor[y][x] === -1) {
            const neighbors: number[] = [];
            if (y > 0 && newDecor[y - 1][x] !== -1) neighbors.push(newDecor[y - 1][x]);
            if (y < prev.height - 1 && newDecor[y + 1][x] !== -1) neighbors.push(newDecor[y + 1][x]);
            if (x > 0 && newDecor[y][x - 1] !== -1) neighbors.push(newDecor[y][x - 1]);
            if (x < prev.width - 1 && newDecor[y][x + 1] !== -1) neighbors.push(newDecor[y][x + 1]);

            if (neighbors.length >= 1) {
              newDecor[y][x] = neighbors[0];
              repairedHoles++;
            }
          }
        }
      }

      // 2. Remove floating 1x1 objects in empty space outside map structures
      const currentObjs = prev.objects || [];
      const remainingObjs = currentObjs.filter(obj => {
        if (obj.width === 1 && obj.height === 1) {
          const tx = obj.x;
          const ty = obj.y;
          const isBaseEmpty = !newBase[ty] || newBase[ty][tx] === -1 || newBase[ty][tx] === 2000;
          const isDecorEmpty = !newDecor[ty] || newDecor[ty][tx] === -1;
          if (isBaseEmpty && isDecorEmpty && ty < 12) {
            cleanedFloating++;
            return false;
          }
        }
        return true;
      });

      setPickedToast(`🧹 맵 자동 복구 완료: 구멍 ${repairedHoles}개 메움, 잔상 조각 ${cleanedFloating}개 정리!`);
      setTimeout(() => setPickedToast(null), 3500);

      return {
        ...prev,
        decorLayer: newDecor,
        baseLayer: newBase,
        objects: remainingObjs
      };
    });
  };

  // Keyboard Shortcuts: Space (Pan map), Ctrl+Z (Undo), Ctrl+Y (Redo), Alt, B, F, E, X, V, Delete, Ctrl+C, Ctrl+V
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';

      // Space key for map panning
      if ((e.code === 'Space' || e.key === ' ') && !isInput) {
        e.preventDefault();
        if (!isSpacePressed.current) {
          isSpacePressed.current = true;
          setIsSpaceHeld(true);
        }
      }

      if (isInput) return;

      // Ctrl + Z (Undo) / Ctrl + Shift + Z or Ctrl + Y (Redo)
      const isCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isCtrl && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedoRef.current();
        } else {
          handleUndoRef.current();
        }
        return;
      }

      if (isCtrl && key === 'y') {
        e.preventDefault();
        handleRedoRef.current();
        return;
      }

      if (isCtrl && key === 'c') {
        if (selectedObjectId) {
          e.preventDefault();
          handleCopySelectedObject();
        }
        return;
      }

      if (isCtrl && key === 'v') {
        if (copiedObject) {
          e.preventDefault();
          handlePasteObject();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObjectId) {
          e.preventDefault();
          handleDeleteSelectedObject();
        }
        return;
      }

      if (e.key === 'Alt') {
        setIsAltPressed(true);
      }

      if (key === 'b') {
        setTool('brush');
        if (editLayer === 'collision') setEditLayer('decor');
        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
      } else if (key === 'f') {
        setTool('bucket');
        if (editLayer === 'collision') setEditLayer('decor');
        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
      } else if (key === 'e') {
        setTool('eyedropper');
        if (editLayer === 'collision') setEditLayer('decor');
        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
      } else if (key === 'v') {
        setTool('select');
        if (editLayer === 'collision') setEditLayer('decor');
      } else if (key === 'x') {
        setSelectedTile(-1);
        setTool('brush');
        if (editLayer === 'collision') setEditLayer('decor');
      } else if (key === 'c') {
        setTool('collision');
        setEditLayer('collision');
        setShowCollision(true);
        setCollisionSubMode('delete');
        setSelectedTile(-1);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        isSpacePressed.current = false;
        setIsSpaceHeld(false);
        isPanningViewport.current = false;
      }
      if (e.key === 'Alt') {
        setIsAltPressed(false);
      }
    };

    const handleBlur = () => {
      setIsAltPressed(false);
      setIsSpaceHeld(false);
      isSpacePressed.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [editLayer, selectedTile, activeTileset]);

  // Drag-to-resize Right Palette Panel
  const handlePaletteResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingPalette.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingPalette.current) return;
      const newW = window.innerWidth - ev.clientX;
      if (newW >= 280 && newW <= 850) {
        setPaletteWidth(newW);
      }
    };

    const handleMouseUp = () => {
      isResizingPalette.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Sync state when map tab switches
  const prevMapIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevMapIdRef.current !== selectedMapId) {
      prevMapIdRef.current = selectedMapId;
      let map = activeMaps[selectedMapId] || maps[selectedMapId];
      if (map) {
        // Sanitize: If this is a custom map where baseLayer is filled with default 2000/0 tiles and decor/objects are empty, sanitize to -1 (black canvas)!
        const isCustomMapId = selectedMapId.startsWith('custom_') || !['room','subway','park','apt','village','water','forest'].includes(selectedMapId);
        const norm = getNormalizedLayers(map);
        const baseGrid = norm[0]?.grid || map.baseLayer;
        const isAllDefaultBase = baseGrid && baseGrid.every(row => row.every(tile => tile === 0 || tile === 2000 || tile === 1000 || tile === -1));
        const hasNoDecorOrObjects = (!map.objects || map.objects.length === 0) && (!map.decorLayer || map.decorLayer.every(r => r.every(t => t === -1)));

        if (isCustomMapId && isAllDefaultBase && hasNoDecorOrObjects) {
          const cleanGrid = Array.from({ length: map.height }, () => Array(map.width).fill(-1));
          map = {
            ...map,
            baseLayer: cleanGrid,
            decorLayer: cleanGrid,
            layers: [
              { id: 'layer_base', name: '1단계(배경)', visible: true, grid: cleanGrid, type: 'base' },
              { id: 'layer_decor', name: '2단계(오브젝트)', visible: true, grid: cleanGrid, type: 'decor' }
            ]
          };
        }

        setLocalMap(map);
        setOriginalMap(map);
        setWidthInput(map.width.toString());
        setHeightInput(map.height.toString());
        setHistory([]);
        setRedoHistory([]);
        setActiveTileset(map.tileset);
        
        if (map.tileset === 'interior') setSelectedTile(1199);
        else setSelectedTile(2000);
      }
    }
  }, [selectedMapId, activeMaps]);

  // Image preloader for tilesets (Incremental real-time update per loaded image!)
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const assetUrls: Record<string, string> = {
      interior: interiorTilesUrl,
      outdoor: outdoorTilesUrl,
      village: villageTilesUrl,
      wall: wallTilesUrl,
      house: houseTilesUrl,
      nature: natureTilesUrl,
      water: waterTilesUrl,
      field: fieldTilesUrl
    };

    customMapTilesets.forEach((ct) => {
      assetUrls[ct.id] = ct.url;
    });

    Object.entries(assetUrls).forEach(([k, url]) => {
      if (!url) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setImages((prev) => ({ ...prev, [k]: img }));
      };
      img.src = url;
      if (img.complete && img.naturalWidth > 0) {
        setImages((prev) => ({ ...prev, [k]: img }));
      }
    });
  }, [customMapTilesets]);

  const cleanedBaseObjects = React.useMemo(() => {
    if (!localMap?.objects || localMap.objects.length === 0) return [];
    return cleanDuplicateObjects(localMap.objects.filter(o => o.layer === 'base'));
  }, [localMap?.objects]);

  const cleanedDecorObjects = React.useMemo(() => {
    if (!localMap?.objects || localMap.objects.length === 0) return [];
    return cleanDuplicateObjects(localMap.objects.filter(o => o.layer !== 'base'));
  }, [localMap?.objects]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !localMap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tileSize = 16 * zoom;
    const targetW = localMap.width * tileSize;
    const targetH = localMap.height * tileSize;
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const normLayers = getNormalizedLayers(localMap);

    // Source frames are not always 16px. Custom sheets are routinely 32px — the office sheet is
    // 512x2048 over a 16x64 grid — and assuming 16 samples the wrong part of the image for every
    // index past the first row, drifting further the further down the sheet the tile sits. Derive
    // the frame size from the image the way CanvasGame's renderer does.
    const frameOf = (image: HTMLImageElement, info: { cols?: number; rows?: number } | null) => ({
      w: Math.max(1, Math.floor(image.width / Math.max(1, (info && info.cols) || 16))),
      h: Math.max(1, Math.floor(image.height / Math.max(1, (info && info.rows) || 16)))
    });

    // Helper to draw an object list
    const drawObjectList = (objsList: MapObjectInstance[]) => {
      if (objsList.length === 0) return;
      const sortedObjects = [...objsList].sort((a, b) => {
        if (a.zIndex !== undefined && b.zIndex !== undefined && a.zIndex !== b.zIndex) {
          return a.zIndex - b.zIndex;
        }
        const rootA = a.y + a.height - 1;
        const rootB = b.y + b.height - 1;
        if (rootA !== rootB) return rootA - rootB;
        return (a.zIndex || 0) - (b.zIndex || 0);
      });

      sortedObjects.forEach(obj => {
        const img = images[obj.tilesetKey];
        const tsInfo = getTilesetInfoLocal(obj.tilesetKey);
        if (img && tsInfo) {
          const tileW = Math.max(1, Math.floor(img.width / tsInfo.cols));
          const tileH = Math.max(1, Math.floor(img.height / tsInfo.rows));

          for (let ody = 0; ody < obj.height; ody++) {
            for (let odx = 0; odx < obj.width; odx++) {
              const targetTx = obj.x + odx;
              const targetTy = obj.y + ody;
              if (targetTx >= 0 && targetTx < localMap.width && targetTy >= 0 && targetTy < localMap.height) {
                if (obj.tiles) {
                  // A. Render background brush tile if present
                  if (obj.bgTiles && obj.bgTiles[ody]) {
                    const bgIdx = obj.bgTiles[ody][odx] !== undefined ? obj.bgTiles[ody][odx] : -1;
                    if (bgIdx !== -1) {
                      const bgDrawInfo = getTileDrawInfo(bgIdx, obj.tilesetKey || localMap.tileset);
                      if (bgDrawInfo) {
                        const bgImg = images[bgDrawInfo.tilesetKey];
                        if (bgImg) {
                          const bgTsInfo = getTilesetInfoLocal(bgDrawInfo.tilesetKey);
                          const bgF = frameOf(bgImg, bgTsInfo);
                          const srcX = (bgDrawInfo.localIdx % bgTsInfo.cols) * bgF.w;
                          const srcY = Math.floor(bgDrawInfo.localIdx / bgTsInfo.cols) * bgF.h;
                          ctx.drawImage(
                            bgImg,
                            srcX, srcY, bgF.w, bgF.h,
                            targetTx * tileSize, targetTy * tileSize, tileSize, tileSize
                          );
                        }
                      }
                    }
                  }

                  // B. Render foreground tile on top
                  const row = obj.tiles[ody];
                  const tileIdx = row && row[odx] !== undefined ? row[odx] : -1;
                  if (tileIdx !== -1) {
                    const drawInfo = getTileDrawInfo(tileIdx, obj.tilesetKey || localMap.tileset);
                    if (drawInfo) {
                      const tImg = images[drawInfo.tilesetKey];
                      if (tImg) {
                        const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
                        const tF = frameOf(tImg, tsInfo);
                        const srcX = (drawInfo.localIdx % tsInfo.cols) * tF.w;
                        const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * tF.h;
                        ctx.drawImage(
                          tImg,
                          srcX, srcY, tF.w, tF.h,
                          targetTx * tileSize, targetTy * tileSize, tileSize, tileSize
                        );
                      }
                    }
                  }
                } else {
                  const srcX = (obj.startCol + odx) * tileW;
                  const srcY = (obj.startRow + ody) * tileH;
                  ctx.drawImage(
                    img,
                    srcX, srcY, tileW, tileH,
                    targetTx * tileSize, targetTy * tileSize, tileSize, tileSize
                  );
                }
              }
            }
          }
        }
      });
    };

    // Helper to draw objects for a specific layer
    const drawObjectsForLayer = (layerObj: CustomTileLayer, isBase: boolean) => {
      if (!localMap.objects || localMap.objects.length === 0) return;
      const layerObjs = localMap.objects.filter(o => {
        if (o.layerId) return o.layerId === layerObj.id;
        return isBase ? o.layer === 'base' : (layerObj.id === normLayers[1]?.id || layerObj.id === 'layer_decor');
      });
      drawObjectList(layerObjs);
    };

    normLayers.forEach((layer, lIdx) => {
      const isBase = lIdx === 0;
      const isVisible = isBase ? (showBase && layer.visible !== false) : (showDecor && layer.visible !== false);

      if (isVisible) {
        // A. Draw layer tiles
        if (layer.grid) {
          for (let y = 0; y < localMap.height; y++) {
            for (let x = 0; x < localMap.width; x++) {
              const idx = layer.grid[y] && layer.grid[y][x] !== undefined ? layer.grid[y][x] : -1;
              if (idx !== -1 && idx !== undefined && idx !== null) {
                const drawInfo = getTileDrawInfo(idx, localMap.tileset);
                if (drawInfo) {
                  const img = images[drawInfo.tilesetKey];
                  if (img) {
                    const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
                    if (tsInfo && tsInfo.cols) {
                      const f = frameOf(img, tsInfo);
                      const srcX = (drawInfo.localIdx % tsInfo.cols) * f.w;
                      const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * f.h;
                      ctx.drawImage(
                        img,
                        srcX, srcY, f.w, f.h,
                        x * tileSize, y * tileSize, tileSize, tileSize
                      );
                    }
                  }
                }
              }
            }
          }
        }

        // B. Draw objects bound to this layer!
        drawObjectsForLayer(layer, isBase);
      }
    });

    // 3. Collision red borders (100% Vivid Red for clear distinction!)
    if (showCollision) {
      ctx.fillStyle = 'rgba(255, 60, 60, 0.25)';
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
      ctx.lineWidth = 1.5;
      for (let y = 0; y < localMap.height; y++) {
        for (let x = 0; x < localMap.width; x++) {
          if (localMap.collision[y][x]) {
            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
            ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
          }
        }
      }
    }

    // 4. Grid overlay
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= localMap.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * tileSize, 0);
        ctx.lineTo(x * tileSize, localMap.height * tileSize);
        ctx.stroke();
      }
      for (let y = 0; y <= localMap.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * tileSize);
        ctx.lineTo(localMap.width * tileSize, y * tileSize);
        ctx.stroke();
      }
    }

    // 5. Objects Bounding Boxes Overlay (Selected: Gold/Yellow, Unselected: Neon Cyan!)
    if (localMap.objects && localMap.objects.length > 0) {
      localMap.objects.forEach(obj => {
        const isSelected = selectedObjectIds.includes(obj.id);
        const ox = obj.x * tileSize;
        const oy = obj.y * tileSize;
        const ow = obj.width * tileSize;
        const oh = obj.height * tileSize;

        ctx.save();
        if (isSelected) {
          // 1) Active Selected Object: Electric Gold / Yellow (#ffd700)
          ctx.strokeStyle = "#ffd700";
          ctx.lineWidth = 3.0;
          ctx.setLineDash([6, 6]);
          ctx.fillStyle = "rgba(255, 215, 0, 0.22)";
          ctx.fillRect(ox, oy, ow, oh);
          ctx.strokeRect(ox, oy, ow, oh);
        }
        ctx.restore();
      });
    }

    // 5.5 Map Canvas Box Selection Drag Highlight (Electric Gold #ffd700)
    if (mapBoxSelection && tool === 'select') {
      const bx = mapBoxSelection.startCol * tileSize;
      const by = mapBoxSelection.startRow * tileSize;
      const bw = mapBoxSelection.cols * tileSize;
      const bh = mapBoxSelection.rows * tileSize;

      ctx.save();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    }

    // 6. Hover Cursor Tile Preview / Eyedropper Highlight
    if (hoverTile && hoverTile.x >= 0 && hoverTile.x < localMap.width && hoverTile.y >= 0 && hoverTile.y < localMap.height) {
      ctx.save();
      const hx = hoverTile.x * tileSize;
      const hy = hoverTile.y * tileSize;

      if (isAltPressed || tool === 'eyedropper') {
        // Cyan Eyedropper Highlight Box
        ctx.strokeStyle = '#89dceb';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(137, 220, 235, 0.25)';
        ctx.fillRect(hx, hy, tileSize, tileSize);
        ctx.strokeRect(hx, hy, tileSize, tileSize);
      } else {
        let pCols = brushSize;
        let pRows = brushSize;
        let pStartCol = 0;
        let pStartRow = 0;

        const drawInfo = getTileDrawInfo(selectedTile, activeTileset);
        const tsInfo = drawInfo ? getTilesetInfoLocal(drawInfo.tilesetKey) : null;

        if (paletteSelection && paletteSelection.tilesetKey === activeTileset) {
          pCols = paletteSelection.cols;
          pRows = paletteSelection.rows;
          pStartCol = paletteSelection.startCol;
          pStartRow = paletteSelection.startRow;
        } else if (drawInfo && tsInfo) {
          pStartCol = drawInfo.localIdx % tsInfo.cols;
          pStartRow = Math.floor(drawInfo.localIdx / tsInfo.cols);
        }

        const bw = Math.min(localMap.width - hoverTile.x, pCols) * tileSize;
        const bh = Math.min(localMap.height - hoverTile.y, pRows) * tileSize;

        // Draw real-time multi-tile object texture preview under mouse cursor!
        if (selectedTile !== -1 && editLayer !== 'collision' && tool === 'brush' && (paletteSelection || brushSize > 1)) {
          ctx.globalAlpha = 0.75;
          if (tsInfo) {
            const img = images[drawInfo?.tilesetKey || activeTileset];
            if (img) {
              for (let dy = 0; dy < pRows; dy++) {
                for (let dx = 0; dx < pCols; dx++) {
                  const px = hoverTile.x + dx;
                  const py = hoverTile.y + dy;
                  const targetCol = pStartCol + dx;
                  const targetRow = pStartRow + dy;
                  if (px < localMap.width && py < localMap.height && targetCol < tsInfo.cols && targetRow < tsInfo.rows) {
                    const pf = frameOf(img, tsInfo);
                    ctx.drawImage(
                      img,
                      targetCol * pf.w, targetRow * pf.h, pf.w, pf.h,
                      px * tileSize, py * tileSize, tileSize, tileSize
                    );
                  }
                }
              }
            }
          }
          ctx.globalAlpha = 1.0;
        }

        if (tool !== 'select') {
          ctx.strokeStyle = '#f9e2af';
          ctx.lineWidth = 2;
          ctx.fillStyle = 'rgba(249, 226, 175, 0.15)';
          ctx.fillRect(hx, hy, bw, bh);
          ctx.strokeRect(hx, hy, bw, bh);
        }
      }
      ctx.restore();
    }
  }, [images, localMap, zoom, showGrid, showBase, showDecor, showCollision, hoverTile, isAltPressed, tool, brushSize, selectedTile, editLayer, activeTileset, selectedObjectIds, mapBoxSelection]);

  // Keyboard Arrow Key Navigation for Moving Selected Objects
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedObjectIds.length === 0) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      let deltaTx = 0;
      let deltaTy = 0;
      const step = e.shiftKey ? 5 : 1;

      if (e.key === 'ArrowLeft') deltaTx = -step;
      else if (e.key === 'ArrowRight') deltaTx = step;
      else if (e.key === 'ArrowUp') deltaTy = -step;
      else if (e.key === 'ArrowDown') deltaTy = step;

      if (deltaTx !== 0 || deltaTy !== 0) {
        e.preventDefault();
        setLocalMap(prev => {
          const nextObjects = (prev.objects || []).map(obj => {
            if (selectedObjectIds.includes(obj.id)) {
              const targetTx = Math.max(0, Math.min(prev.width - obj.width, obj.x + deltaTx));
              const targetTy = Math.max(0, Math.min(prev.height - obj.height, obj.y + deltaTy));
              return { ...obj, x: targetTx, y: targetTy };
            }
            return obj;
          });
          return { ...prev, objects: nextObjects };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectIds]);

  // Undo / Redo
  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoHistory(r => [localMap, ...r]);
    setLocalMap(prev);
    setHistory(h => h.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoHistory.length === 0) return;
    const next = redoHistory[0];
    setHistory(h => [...h, localMap]);
    setLocalMap(next);
    setRedoHistory(r => r.slice(1));
  };

  handleUndoRef.current = handleUndo;
  // Auto-sync map edits to Supabase DB & localStorage continuously
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // The autosave is the dangerous one under a lock: without this guard a read-only viewer would
    // quietly push its own copy over whatever the actual editor is doing, 500ms after any change.
    if (editLock.isReadOnly) return;
    const timer = setTimeout(() => {
      onSaveMap(selectedMapId, localMap);
    }, 500);
    return () => clearTimeout(timer);
  }, [localMap, selectedMapId, onSaveMap, editLock.isReadOnly]);

  const handleSave = () => {
    if (editLock.isReadOnly) {
      alert(`🔒 ${editLock.lockedBy}님이 편집 중이라 저장할 수 없습니다.`);
      return;
    }
    onSaveMap(selectedMapId, localMap);
    setOriginalMap(localMap);
    alert('디자인 변경 사항이 성공적으로 클라우드에 저장되었습니다!');
  };

  const handleExportBackup = () => {
    try {
      const backupData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('on_house_')) {
          const val = localStorage.getItem(key);
          if (val) backupData[key] = val;
        }
      }
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `on_house_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('백업 파일 생성 실패: ' + e);
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result as string;
        const backupData = JSON.parse(content);
        let count = 0;
        Object.entries(backupData).forEach(([k, v]) => {
          if (k.startsWith('on_house_') && typeof v === 'string') {
            localStorage.setItem(k, v);
            count++;
          }
        });
        alert(`총 ${count}개의 백업 데이터가 성공적으로 복원되었습니다! 앱을 새로고침합니다.`);
        window.location.reload();
      } catch (err) {
        alert('백업 파일을 불러오는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
  };

  const handleCancel = () => {
    const hasChanges = JSON.stringify(localMap) !== JSON.stringify(originalMap);
    if (hasChanges) {
      if (!window.confirm("저장하지 않은 변경사항이 있습니다. 정말로 저장을 취소하고 나가시겠습니까?")) {
        return;
      }
    }
    onClose();
  };

  const handleResetToDefault = () => {
    if (window.confirm("정말로 이 지도의 수정을 취소하고 기본 레이아웃으로 전체 초기화하시겠습니까? (저장을 해야 최종 반영됩니다)")) {
      setHistory(prev => [...prev, localMap]);
      setRedoHistory([]);
      const defaultLayout = maps[selectedMapId];
      if (defaultLayout) {
        setLocalMap({ ...defaultLayout });
      }
    }
  };

  // 🧪 Eyedropper: Pick tile/object based on currently selected editLayer ('base' vs 'decor')
  const pickTileFromMap = (tx: number, ty: number) => {
    if (tx < 0 || tx >= localMap.width || ty < 0 || ty >= localMap.height) return;

    let pickedIdx = -1;
    let pickedTsKey = activeTileset;

    const normLayers = getNormalizedLayers(localMap);
    let targetIndex = normLayers.findIndex(l => l.id === activeLayerId);
    if (targetIndex === -1) targetIndex = editLayer === 'base' ? 0 : 1;
    const activeLayerObj = normLayers[targetIndex];

    if (editLayer === 'collision') {
      pickedIdx = localMap.collision[ty][tx] ? 1 : 0;
    } else {
      // 1. Check active layer grid at (tx, ty) first!
      if (activeLayerObj && activeLayerObj.grid && activeLayerObj.grid[ty] && activeLayerObj.grid[ty][tx] !== undefined && activeLayerObj.grid[ty][tx] !== -1) {
        pickedIdx = activeLayerObj.grid[ty][tx];
      } else {
        // 2. Check objects matching target layer at (tx, ty)
        const decorObj = (localMap.objects || []).slice().reverse().find(o =>
          (targetIndex === 0 ? o.layer === 'base' : o.layer !== 'base') &&
          tx >= o.x && tx < o.x + o.width && ty >= o.y && ty < o.y + o.height
        );
        if (decorObj) {
          pickedTsKey = decorObj.tilesetKey;
          const relR = ty - decorObj.y;
          const relC = tx - decorObj.x;
          if (decorObj.tiles && decorObj.tiles[relR] && decorObj.tiles[relR][relC] !== undefined && decorObj.tiles[relR][relC] !== -1) {
            pickedIdx = decorObj.tiles[relR][relC];
          } else {
            const tsInfo = getTilesetInfoLocal(decorObj.tilesetKey);
            if (tsInfo) {
              const lIdx = (decorObj.startRow + relR) * tsInfo.cols + (decorObj.startCol + relC);
              pickedIdx = getPrefixedIndex(lIdx, decorObj.tilesetKey);
            }
          }

          // If object has multi-tile dimensions, set paletteSelection & brushSize so history & brush gain the multi-tile object!
          if (decorObj.width > 1 || decorObj.height > 1) {
            const tsInfo = getTilesetInfoLocal(decorObj.tilesetKey);
            if (tsInfo) {
              const topLIdx = decorObj.startRow * tsInfo.cols + decorObj.startCol;
              pickedIdx = getPrefixedIndex(topLIdx, decorObj.tilesetKey);
            }
            setSelectedTile(pickedIdx);
            setActiveTileset(decorObj.tilesetKey);
            setPaletteSelection({
              startCol: decorObj.startCol,
              startRow: decorObj.startRow,
              cols: decorObj.width,
              rows: decorObj.height,
              tilesetKey: decorObj.tilesetKey
            });
            setBrushSize(Math.max(decorObj.width, decorObj.height));
            return;
          }
        }
      }
    }

    if (pickedIdx !== -1) {
      setSelectedTile(pickedIdx);

      // Auto-switch active tileset category and reset palette selection box!
      const info = getTileDrawInfo(pickedIdx, pickedTsKey);
      if (info && info.tilesetKey) {
        setActiveTileset(info.tilesetKey);
        setPaletteSelection(null);
        setBrushSize(1);
      }

      const infoDraw = getTileDrawInfo(pickedIdx, pickedTsKey);
      const tsInfo = infoDraw ? getTilesetInfoLocal(infoDraw.tilesetKey) : null;
      const layerName = editLayer === 'base' ? '1층 바닥' : editLayer === 'decor' ? '2층 가구' : '통행';
      const label = tsInfo ? `${tsInfo.label} (ID: ${infoDraw?.localIdx})` : `타일 (ID: ${pickedIdx})`;

      setPickedToast(`🧪 [${layerName}] 스포이드 추출: ${label}`);
      setTimeout(() => setPickedToast(null), 2500);

      // Auto-return to brush tool for smooth single-tile painting workflow!
      setTool('brush');
    }
  };

  const performFloodFill = (startX: number, startY: number, fillVal: number) => {
    if (editLayer === 'collision') return;
    addCurrentBrushToHistory();
    
    setLocalMap(prev => {
      const normLayers = getNormalizedLayers(prev);
      let targetIndex = normLayers.findIndex(l => l.id === activeLayerId);
      if (targetIndex === -1) targetIndex = editLayer === 'base' ? 0 : 1;

      const updatedLayers = normLayers.map((l, lIdx) => {
        if (lIdx === targetIndex) {
          return {
            ...l,
            grid: l.grid.map(r => [...r])
          };
        }
        return l;
      });

      const activeGrid = updatedLayers[targetIndex].grid;
      const newCollision = prev.collision.map(r => [...r]);
      const originalVal = activeGrid[startY] ? activeGrid[startY][startX] : -1;
      
      if (originalVal === fillVal) return prev;

      const w = prev.width;
      const h = prev.height;
      const queue: [number, number][] = [[startX, startY]];
      if (activeGrid[startY]) {
        activeGrid[startY][startX] = fillVal;
      }

      while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1]
        ];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            if (activeGrid[ny] && activeGrid[ny][nx] === originalVal) {
              activeGrid[ny][nx] = fillVal;
              if (targetIndex !== 0 && autoCollision) {
                newCollision[ny][nx] = fillVal !== -1;
              }
              queue.push([nx, ny]);
            }
          }
        }
      }

      return {
        ...prev,
        baseLayer: updatedLayers[0]?.grid || prev.baseLayer,
        decorLayer: updatedLayers[1]?.grid || prev.decorLayer,
        layers: updatedLayers,
        collision: newCollision
      };
    });
  };

  const handleMoveObjectTiles = (objId: string, newTx: number, newTy: number, startTx?: number, startTy?: number) => {
    setLocalMap(prev => {
      const obj = prev.objects?.find(o => o.id === objId);
      if (!obj) return prev;
      if (obj.x === newTx && obj.y === newTy) return prev;

      const sTx = startTx !== undefined ? startTx : obj.x;
      const sTy = startTy !== undefined ? startTy : obj.y;

      const newBase = prev.baseLayer.map(r => [...r]);
      const newDecor = prev.decorLayer.map(r => [...r]);
      const newCollision = prev.collision.map(r => [...r]);

      // 1. Reset collision at old starting position (sTx, sTy) if autoCollision is enabled
      if (autoCollision) {
        for (let dy = 0; dy < obj.height; dy++) {
          for (let dx = 0; dx < obj.width; dx++) {
            const oldX = sTx + dx;
            const oldY = sTy + dy;
            if (oldX >= 0 && oldX < prev.width && oldY >= 0 && oldY < prev.height) {
              newCollision[oldY][oldX] = false;
            }
          }
        }
      }

      // 2. Set new collision at destination position (newTx, newTy) if autoCollision is enabled
      if (autoCollision) {
        for (let dy = 0; dy < obj.height; dy++) {
          for (let dx = 0; dx < obj.width; dx++) {
            const nX = newTx + dx;
            const nY = newTy + dy;
            if (nX >= 0 && nX < prev.width && nY >= 0 && nY < prev.height) {
              let hasTile = true;
              if (obj.tiles && obj.tiles[dy] && obj.tiles[dy][dx] === -1) {
                hasTile = false;
              }
              if (hasTile) {
                newCollision[nY][nX] = true;
              }
            }
          }
        }
      }

      return {
        ...prev,
        baseLayer: newBase,
        decorLayer: newDecor,
        collision: newCollision,
        objects: (prev.objects || []).map(o => o.id === objId ? { ...o, x: newTx, y: newTy } : o)
      };
    });
  };


  const handlePaint = (tx: number, ty: number) => {
    if (tx < 0 || tx >= localMap.width || ty < 0 || ty >= localMap.height) return;

    // Only add brush to history when user actually paints/stamps tiles on the map canvas!
    addCurrentBrushToHistory();

    setLocalMap(prev => {
      const normLayers = getNormalizedLayers(prev);
      let targetIndex = normLayers.findIndex(l => l.id === activeLayerId);
      if (targetIndex === -1) {
        targetIndex = editLayer === 'base' ? 0 : 1;
      }

      const updatedLayers = normLayers.map((l, lIdx) => {
        if (lIdx === targetIndex) {
          return {
            ...l,
            grid: l.grid.map(r => [...r])
          };
        }
        return l;
      });

      const activeGrid = updatedLayers[targetIndex].grid;
      const newCollision = prev.collision.map(r => [...r]);
      let nextObjects = prev.objects ? [...prev.objects] : [];

      let cols = brushSize;
      let rows = brushSize;
      let startCol = 0;
      let startRow = 0;

      const drawInfo = getTileDrawInfo(selectedTile, activeTileset);
      const tsInfo = drawInfo ? getTilesetInfoLocal(drawInfo.tilesetKey) : null;

      if (paletteSelection && paletteSelection.tilesetKey === activeTileset) {
        cols = paletteSelection.cols;
        rows = paletteSelection.rows;
        startCol = paletteSelection.startCol;
        startRow = paletteSelection.startRow;
      } else if (drawInfo && tsInfo) {
        startCol = drawInfo.localIdx % tsInfo.cols;
        startRow = Math.floor(drawInfo.localIdx / tsInfo.cols);
      }

      const isMultiTileObject = tool === 'object' && selectedTile !== -1 && editLayer !== 'collision';

      for (let dy = 0; dy < rows; dy++) {
        for (let dx = 0; dx < cols; dx++) {
          const ptx = tx + dx;
          const pty = ty + dy;

          if (ptx >= 0 && ptx < prev.width && pty >= 0 && pty < prev.height) {
            if (tool === 'collision' || editLayer === 'collision') {
              newCollision[pty][ptx] = collisionSubMode === 'add';
            } else if (selectedTile === -1) {
              // Erase tile ONLY from active selected layer!
              if (activeGrid[pty]) {
                activeGrid[pty][ptx] = -1;
              }
              if (targetIndex !== 0 && autoCollision) {
                newCollision[pty][ptx] = false;
              }
              // Erase 1x1 standalone objects at eraser position ONLY if they belong to the active layer!
              const targetLayerId = normLayers[targetIndex]?.id;
              nextObjects = nextObjects.filter(o => {
                const isOverlapped = ptx >= o.x && ptx < o.x + o.width && pty >= o.y && pty < o.y + o.height;
                if (!isOverlapped) return true;
                
                const isActiveLayerObj = o.layerId 
                  ? o.layerId === targetLayerId 
                  : o.layer === (targetIndex === 0 ? 'base' : 'decor');
                  
                if (!isActiveLayerObj) return true;
                
                return !(o.width === 1 && o.height === 1);
              });
            } else {
              let tileToPaint = selectedTile;
              if (paletteSelection && paletteSelection.tilesetKey === activeTileset && tsInfo) {
                const lIdx = (startRow + dy) * tsInfo.cols + (startCol + dx);
                tileToPaint = getPrefixedIndex(lIdx, activeTileset);
              } else {
                tileToPaint = getOffsetTile(selectedTile, activeTileset, dx, dy);
              }

              if (!isMultiTileObject) {
                // Paint tile ONLY into active selected layer!
                if (activeGrid[pty]) {
                  activeGrid[pty][ptx] = tileToPaint;
                }
                if (targetIndex === 0) {
                  // Remove accidental object at this tile when painting ground floor tiles
                  nextObjects = nextObjects.filter(o => !(ptx >= o.x && ptx < o.x + o.width && pty >= o.y && pty < o.y + o.height));
                } else if (autoCollision) {
                  newCollision[pty][ptx] = tileToPaint !== -1;
                }
              } else if (autoCollision) {
                newCollision[pty][ptx] = true;
              }
            }
          }
        }
      }

      if (isMultiTileObject) {
        const newObj: MapObjectInstance = {
          id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tilesetKey: activeTileset,
          startCol,
          startRow,
          width: cols,
          height: rows,
          x: tx,
          y: ty,
          layer: targetIndex === 0 ? 'base' : 'decor',
          layerId: activeLayerId,
          zIndex: Date.now()
        };

        // Remove any exact overlapping same-origin object if replacing
        nextObjects = nextObjects.filter(o => !(o.x === tx && o.y === ty));
        nextObjects.push(newObj);
        setSelectedObjectId(newObj.id);
      }

      return {
        ...prev,
        baseLayer: updatedLayers[0]?.grid || prev.baseLayer,
        decorLayer: updatedLayers[1]?.grid || prev.decorLayer,
        layers: updatedLayers,
        collision: newCollision,
        objects: nextObjects
      };
    });
  };

  // Viewport Drag-to-Pan Handlers (Space + Mouse Drag or Right/Middle Click)
  const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSpacePressed.current || isSpaceHeld || e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningViewport.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: viewportRef.current?.scrollLeft || 0,
        scrollTop: viewportRef.current?.scrollTop || 0
      };
    }
  };

  const handleViewportMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanningViewport.current && viewportRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      viewportRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      viewportRef.current.scrollTop = panStartRef.current.scrollTop - dy;
    }
  };

  const handleViewportMouseUp = () => {
    isPanningViewport.current = false;
  };

  // ✨ Merge dragged map tiles into a single unified MapObjectInstance!
  const handleConvertBoxToSingleObject = () => {
    if (!mapBoxSelection) return;
    const { startCol, startRow, cols, rows } = mapBoxSelection;

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const normLayers = getNormalizedLayers(prev);
      let targetIndex = normLayers.findIndex(l => l.id === activeLayerId);
      if (targetIndex === -1) targetIndex = editLayer === 'base' ? 0 : 1;

      const updatedLayers = normLayers.map((l, lIdx) => {
        if (lIdx === targetIndex) {
          return {
            ...l,
            grid: l.grid.map(r => [...r])
          };
        }
        return l;
      });

      const activeGrid = updatedLayers[targetIndex].grid;
      const newCollision = prev.collision.map(r => [...r]);
      let nextObjects = prev.objects ? [...prev.objects] : [];

      const tilesGrid: number[][] = [];
      const bgTilesGrid: number[][] = [];

      for (let r = 0; r < rows; r++) {
        const rowTiles: number[] = [];
        const rowBgTiles: number[] = [];
        for (let c = 0; c < cols; c++) {
          const curTx = startCol + c;
          const curTy = startRow + r;

          if (curTx >= 0 && curTx < prev.width && curTy >= 0 && curTy < prev.height) {
            let fgTileVal = -1;
            let bgTileVal = activeGrid[curTy] ? activeGrid[curTy][curTx] : -1;

            // Check existing objects matching target layer first
            if (nextObjects.length > 0) {
              const sortedObjs = [...nextObjects].filter(o => targetIndex === 0 ? o.layer === 'base' : o.layer !== 'base')
                .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
              for (const obj of sortedObjs) {
                if (curTx >= obj.x && curTx < obj.x + obj.width && curTy >= obj.y && curTy < obj.y + obj.height) {
                  const relR = curTy - obj.y;
                  const relC = curTx - obj.x;
                  const val = getTileValueForCell(obj, relR, relC);
                  if (val !== -1) {
                    fgTileVal = val;
                    if (obj.bgTiles && obj.bgTiles[relR] && obj.bgTiles[relR][relC] !== -1) {
                      bgTileVal = obj.bgTiles[relR][relC];
                    }
                    break;
                  }
                }
              }
            }

            // Fallback: If no object tile, the layer tile becomes the foreground tile
            if (fgTileVal === -1) {
              fgTileVal = bgTileVal;
              bgTileVal = -1;
            }

            rowTiles.push(fgTileVal);
            rowBgTiles.push(bgTileVal);

            // Erase vacated tile from active layer grid
            if (activeGrid[curTy]) {
              activeGrid[curTy][curTx] = -1;
            }
            if (autoCollision && targetIndex !== 0) {
              newCollision[curTy][curTx] = (fgTileVal !== -1 || bgTileVal !== -1);
            }
          } else {
            rowTiles.push(-1);
            rowBgTiles.push(-1);
          }
        }
        tilesGrid.push(rowTiles);
        bgTilesGrid.push(rowBgTiles);
      }

      // Trim empty padding (-1) from outer edges of tilesGrid & bgTilesGrid
      const { trimmedGrid, trimmedBgGrid, x: trimmedX, y: trimmedY, width: trimmedW, height: trimmedH } = trimTilesGrid(tilesGrid, startCol, startRow, bgTilesGrid);

      // Sample primary tile from trimmedGrid
      let sampleTileIdx = -1;
      for (const row of trimmedGrid) {
        for (const val of row) {
          if (val !== -1 && val !== 1199 && val !== 2000) {
            sampleTileIdx = val;
            break;
          }
        }
        if (sampleTileIdx !== -1) break;
      }
      if (sampleTileIdx === -1) sampleTileIdx = selectedTile !== -1 ? selectedTile : getPrefixedIndex(0, activeTileset);

      const drawInfo = getTileDrawInfo(sampleTileIdx, activeTileset);
      const targetTsKey = drawInfo?.tilesetKey || activeTileset;
      const tsInfo = getTilesetInfoLocal(targetTsKey) || getTilesetInfo(targetTsKey);

      let objStartCol = 0;
      let objStartRow = 0;
      if (drawInfo && tsInfo) {
        objStartCol = drawInfo.localIdx % tsInfo.cols;
        objStartRow = Math.floor(drawInfo.localIdx / tsInfo.cols);
      }

      const hasBg = trimmedBgGrid && trimmedBgGrid.some(r => r.some(v => v !== -1));

      const newObj: MapObjectInstance = {
        id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tilesetKey: targetTsKey,
        startCol: objStartCol,
        startRow: objStartRow,
        width: trimmedW,
        height: trimmedH,
        x: trimmedX,
        y: trimmedY,
        layer: targetIndex === 0 ? 'base' : 'decor',
        layerId: activeLayerId,
        zIndex: Date.now(),
        tiles: trimmedGrid,
        bgTiles: hasBg ? trimmedBgGrid : undefined
      };

      // Only remove sub-objects that belong to target layer and are FULLY CONTAINED inside box selection
      nextObjects = nextObjects.filter(o => {
        const matchesLayer = targetIndex === 0 ? o.layer === 'base' : o.layer !== 'base';
        if (!matchesLayer) return true;
        const oMinX = o.x;
        const oMinY = o.y;
        const oMaxX = o.x + o.width;
        const oMaxY = o.y + o.height;
        const boxMinX = startCol;
        const boxMinY = startRow;
        const boxMaxX = startCol + cols;
        const boxMaxY = startRow + rows;
        const isFullyContained = oMinX >= boxMinX && oMaxX <= boxMaxX && oMinY >= boxMinY && oMaxY <= boxMaxY;
        return !isFullyContained;
      });

      nextObjects.push(newObj);
      setSelectedObjectId(newObj.id);

      return {
        ...prev,
        baseLayer: updatedLayers[0]?.grid || prev.baseLayer,
        decorLayer: updatedLayers[1]?.grid || prev.decorLayer,
        layers: updatedLayers,
        collision: newCollision,
        objects: nextObjects
      };
    });

    setMapBoxSelection(null);
    setPickedToast(`✨ 맵 영역 (${cols}x${rows}) 타일이 1개의 오브젝트로 묶였습니다!`);
    setTimeout(() => setPickedToast(null), 3000);
  };

  const handlePublishMapToMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = publishTitle.trim();
    if (!title) {
      alert('상점에 공개할 맵 이름을 입력해 주세요!');
      return;
    }

    try {
      setIsPublishing(true);
      const currentHouse = getSavedHouseCode();
      const creator = publishCreator.trim() || localStorage.getItem('on_house_nickname') || '익명 크리에이터';

      // Capture map thumbnail from canvasRef if available
      let previewDataUrl = '';
      if (canvasRef.current) {
        try {
          previewDataUrl = canvasRef.current.toDataURL('image/png', 0.8);
        } catch (e) {}
      }

      // Collect custom map tileset assets used in this map
      const bundledTilesets: any[] = [];
      if (includeCustomTilesets && customMapTilesets && customMapTilesets.length > 0) {
        const usedPrefixes = new Set<number>();
        const scanLayer = (layer: number[][]) => {
          if (Array.isArray(layer)) {
            layer.forEach(row => {
              if (Array.isArray(row)) {
                row.forEach(idx => {
                  if (idx >= 9000) {
                    const prefix = Math.floor(idx / 1000) * 1000;
                    usedPrefixes.add(prefix);
                  }
                });
              }
            });
          }
        };
        scanLayer(localMap.baseLayer);
        scanLayer(localMap.decorLayer);

        customMapTilesets.forEach(ts => {
          if (ts.prefix && usedPrefixes.has(ts.prefix)) {
            bundledTilesets.push(ts);
          }
        });
      }

      await publishItemToMarket({
        type: 'map',
        title,
        description: publishDesc.trim() || '직접 제작한 완성형 온하우스 맵입니다.',
        creatorName: creator,
        originalHouseCode: currentHouse,
        previewDataUrl,
        payload: {
          mapData: localMap,
          bundledTilesets
        }
      });

      setIsPublishing(false);
      setShowPublishModal(false);
      setPickedToast(`🎉 [${title}] 맵이 커스텀 타일셋과 함께 오픈 마켓 상점에 성공적으로 게시되었습니다!`);
      setTimeout(() => setPickedToast(null), 3000);
    } catch (err: any) {
      alert('맵 마켓 게시 중 오류 발생: ' + (err?.message || err));
      setIsPublishing(false);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Right click cancels stamp preview and switches to select mode
    if (e.button === 2) {
      e.preventDefault();
      setPaletteSelection(null);
      setMapBoxSelection(null);
      setTool('select');
      return;
    }

    if (isSpacePressed.current || isSpaceHeld || e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileSize = 16 * zoom;
    const tx = Math.floor(clickX / tileSize);
    const ty = Math.floor(clickY / tileSize);

    // 🧪 Eyedropper on Alt + Click OR Tool = eyedropper
    // 🧪 Eyedropper on Alt + Click (Disabled for object & select tools) OR Tool = eyedropper
    const isAltPick = (e.altKey || isAltPressed) && tool !== "object" && tool !== "select";
    if (isAltPick || tool === "eyedropper") {
      pickTileFromMap(tx, ty);
      return;
    }

    if (tool === "select") {
      const isCtrlHeld = e.ctrlKey || e.metaKey || e.shiftKey;
      const normLayers = getNormalizedLayers(localMap);
      let targetIndex = normLayers.findIndex(l => l.id === activeLayerId);
      if (targetIndex === -1) targetIndex = editLayer === 'base' ? 0 : 1;
      const isBasePick = targetIndex === 0;

      // A. Check existing MapObjectInstance at (tx, ty)
      // Sort candidate objects at (tx, ty) in FRONT-TO-BACK order (highest zIndex / topmost rendered object first!)
      const candidateObjectsAtPos = (localMap.objects || []).filter(o =>
        tx >= o.x && tx < o.x + o.width && ty >= o.y && ty < o.y + o.height
      ).sort((a, b) => {
        if (a.zIndex !== undefined && b.zIndex !== undefined && a.zIndex !== b.zIndex) {
          return b.zIndex - a.zIndex; // Higher zIndex comes first (frontmost)
        }
        const rootA = a.y + a.height - 1;
        const rootB = b.y + b.height - 1;
        if (rootA !== rootB) return rootB - rootA; // Lower Y position comes first (frontmost)
        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        if (areaA !== areaB) return areaA - areaB; // Smaller foreground objects come first
        return (b.zIndex || 0) - (a.zIndex || 0);
      });

      // 1) Match active layer scope first!
      let clickedObj = candidateObjectsAtPos.find(o => {
        if (isBasePick) return o.layer === "base";
        return o.layer !== "base";
      });

      // 2) Fallback: Search other objects at (tx, ty) ONLY if Ctrl is held
      if (!clickedObj && candidateObjectsAtPos.length > 0 && isCtrlHeld) {
        clickedObj = candidateObjectsAtPos[0];
      }

      if (isCtrlHeld) {
        // 🎯 CTRL KEY HELD: Box Drag Multi-Selection OR Ctrl+Click Object Addition!
        if (clickedObj) {
          setSelectedObjectIds(prev =>
            prev.includes(clickedObj.id) ? prev.filter(id => id !== clickedObj.id) : [...prev, clickedObj.id]
          );
        }
        setMapBoxSelectStart({ tx, ty });
        setMapBoxSelection({ startCol: tx, startRow: ty, cols: 1, rows: 1 });
        setIsDraggingObject(false);
        setObjectDragStart(null);
        return;
      }

      // 🎯 NO CTRL KEY: Normal Select & Drag-to-Move Mode!
      setMapBoxSelectStart(null);
      setMapBoxSelection(null);

      if (clickedObj) {
        const isAlreadySelected = selectedObjectIds.includes(clickedObj.id);
        if (!isAlreadySelected) {
          setSelectedObjectIds([clickedObj.id]);
        }
        setIsDraggingObject(true);
        setObjectDragStart({ originX: e.clientX, originY: e.clientY, startTx: clickedObj.x, startTy: clickedObj.y });
        return;
      }

      // B. Check 1x1 tile at (tx, ty) ONLY on current active layer!
      const activeLayerObj = normLayers[targetIndex];
      const activeGrid = activeLayerObj ? activeLayerObj.grid : (isBasePick ? localMap.baseLayer : localMap.decorLayer);
      const defaultBase = localMap.tileset === "interior" ? 1199 : 2000;
      const rawTile = activeGrid[ty] ? activeGrid[ty][tx] : -1;
      const targetTile = (isBasePick && rawTile === defaultBase) ? -1 : rawTile;

      if (targetTile !== -1 && targetTile !== undefined && targetTile !== 1199 && targetTile !== 2000) {
        setHistory(prev => [...prev, localMap]);
        setRedoHistory([]);

        const drawInfo = getTileDrawInfo(targetTile, activeTileset);
        const tsKey = drawInfo?.tilesetKey || activeTileset;
        const tsInfo = getTilesetInfoLocal(tsKey) || getTilesetInfo(tsKey);
        const startCol = drawInfo && tsInfo ? (drawInfo.localIdx % tsInfo.cols) : 0;
        const startRow = drawInfo && tsInfo ? Math.floor(drawInfo.localIdx / tsInfo.cols) : 0;

        const newObj: MapObjectInstance = {
          id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tilesetKey: tsKey,
          startCol,
          startRow,
          width: 1,
          height: 1,
          x: tx,
          y: ty,
          layer: isBasePick ? 'base' : 'decor',
          layerId: activeLayerId,
          zIndex: Date.now(),
          tiles: [[targetTile]]
        };

        setLocalMap(prev => {
          const updatedLayers = normLayers.map((l, lIdx) => {
            if (lIdx === targetIndex) {
              const gridCopy = l.grid.map(r => [...r]);
              if (gridCopy[ty] && gridCopy[ty][tx] !== undefined) {
                gridCopy[ty][tx] = -1;
              }
              return { ...l, grid: gridCopy };
            }
            return l;
          });

          return {
            ...prev,
            baseLayer: updatedLayers[0]?.grid || prev.baseLayer,
            decorLayer: updatedLayers[1]?.grid || prev.decorLayer,
            layers: updatedLayers,
            objects: [...(prev.objects || []), newObj]
          };
        });

        setSelectedObjectIds([newObj.id]);
        setIsDraggingObject(true);
        setObjectDragStart({ originX: e.clientX, originY: e.clientY, startTx: tx, startTy: ty });
        return;
      }

      // Clicking on empty space without Ctrl -> Deselect all selected objects!
      setSelectedObjectIds([]);
      setSelectedObjectId(null);
      setIsDraggingObject(false);
      setObjectDragStart(null);
      return;
    }

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    if (tool === 'bucket') {
      performFloodFill(tx, ty, selectedTile);
    } else {
      isPainting.current = true;
      lastPaintedCellRef.current = { x: tx, y: ty };
      handlePaint(tx, ty);

      if (selectedObjectId) {
        setSelectedObjectId(null);
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileSize = 16 * zoom;
    const tx = Math.floor(clickX / tileSize);
    const ty = Math.floor(clickY / tileSize);

    setHoverTile(prev => {
      if (prev?.x === tx && prev?.y === ty) return prev;
      return { x: tx, y: ty };
    });

    if (isDraggingObject && selectedObjectIds.length > 0 && objectDragStart && e.buttons === 1) {
      const deltaTx = Math.round((e.clientX - objectDragStart.originX) / tileSize);
      const deltaTy = Math.round((e.clientY - objectDragStart.originY) / tileSize);

      if (deltaTx !== 0 || deltaTy !== 0) {
        setLocalMap(prev => {
          const nextObjects = (prev.objects || []).map(obj => {
            if (selectedObjectIds.includes(obj.id)) {
              const targetTx = Math.max(0, Math.min(prev.width - obj.width, obj.x + deltaTx));
              const targetTy = Math.max(0, Math.min(prev.height - obj.height, obj.y + deltaTy));
              return { ...obj, x: targetTx, y: targetTy };
            }
            return obj;
          });
          return { ...prev, objects: nextObjects };
        });
        setObjectDragStart({ originX: e.clientX, originY: e.clientY, startTx: objectDragStart.startTx + deltaTx, startTy: objectDragStart.startTy + deltaTy });
      }
      return;
    }

    // Drag to select box area on map ONLY when Ctrl / Shift / Cmd is held in select mode!
    if (tool === 'select' && mapBoxSelectStart && (e.ctrlKey || e.metaKey || e.shiftKey) && e.buttons === 1) {
      const sCol = Math.min(mapBoxSelectStart.tx, tx);
      const sRow = Math.min(mapBoxSelectStart.ty, ty);
      const eCol = Math.max(mapBoxSelectStart.tx, tx);
      const eRow = Math.max(mapBoxSelectStart.ty, ty);
      const cols = eCol - sCol + 1;
      const rows = eRow - sRow + 1;
      setMapBoxSelection({ startCol: sCol, startRow: sRow, cols, rows });
      if (selectedObjectIds.length > 0) {
        setSelectedObjectIds([]);
      }
      return;
    }

    if (!isPainting.current || e.altKey || isAltPressed) return;

    // Object tool should ONLY stamp once on click! Disable continuous drag-stamping for object tool to prevent accidental trail stamps!
    if ((tool as string) === 'object') return;

    // Allow continuous drag-erasing and drag-painting for collision mode as well as brush tool!
    const isCollisionMode = tool === 'collision' || editLayer === 'collision';
    const isEraser = selectedTile === -1 || isCollisionMode;

    if (!isCollisionMode && (tool as string) !== 'brush') return;

    const isMultiTileStamp = !isEraser && !isCollisionMode && ((paletteSelection && (paletteSelection.cols > 1 || paletteSelection.rows > 1)) || brushSize > 1);
    if (isMultiTileStamp) return;

    if (lastPaintedCellRef.current?.x === tx && lastPaintedCellRef.current?.y === ty) return;
    lastPaintedCellRef.current = { x: tx, y: ty };
    handlePaint(tx, ty);
  };

  const handleCanvasMouseUp = () => {
    isPainting.current = false;
    lastPaintedCellRef.current = null;
    setIsDraggingObject(false);
    setObjectDragStart(null);

    if (tool === 'select' && mapBoxSelection) {
      // Single click selection (1x1 box) -> Select overlapping object if present
      if (mapBoxSelection.cols === 1 && mapBoxSelection.rows === 1) {
        const selectMinX = mapBoxSelection.startCol;
        const selectMinY = mapBoxSelection.startRow;
        const selectMaxX = mapBoxSelection.startCol + 1;
        const selectMaxY = mapBoxSelection.startRow + 1;

        let overlapped = (localMap.objects || []).filter(o => {
          if (editLayer === "base" && o.layer !== "base") return false;
          if (editLayer === "decor" && o.layer === "base") return false;
          const oMinX = o.x;
          const oMinY = o.y;
          const oMaxX = o.x + o.width;
          const oMaxY = o.y + o.height;
          return !(oMaxX <= selectMinX || oMinX >= selectMaxX || oMaxY <= selectMinY || oMinY >= selectMaxY);
        });

        // Fallback: If no objects matched on active editLayer, search ALL objects across all layers!
        if (overlapped.length === 0) {
          overlapped = (localMap.objects || []).filter(o => {
            const oMinX = o.x;
            const oMinY = o.y;
            const oMaxX = o.x + o.width;
            const oMaxY = o.y + o.height;
            return !(oMaxX <= selectMinX || oMinX >= selectMaxX || oMaxY <= selectMinY || oMinY >= selectMaxY);
          });
          if (overlapped.length > 0) {
            setEditLayer(overlapped[0].layer === "base" ? "base" : "decor");
          }
        }

        if (overlapped.length > 0) {
          setSelectedObjectIds(overlapped.map(o => o.id));
          setMapBoxSelection(null);
          setPickedToast(`📦 ${overlapped.length}개 오브젝트가 선택되었습니다!`);
          setTimeout(() => setPickedToast(null), 2000);
        } else {
          setMapBoxSelection(null);
        }
      } else {
        // Multi-tile Box Drag Selection (cols > 1 || rows > 1) -> KEEP mapBoxSelection active for "✨ 1개의 오브젝트로 묶기"!
        setSelectedObjectIds([]);
        setPickedToast(`📦 맵 범위가 선택되었습니다! (하단 버튼 클릭으로 오브젝트화)`);
        setTimeout(() => setPickedToast(null), 2000);
      }
    }

    setMapBoxSelectStart(null);
  };

  const handleCanvasMouseLeave = () => {
    isPainting.current = false;
    lastPaintedCellRef.current = null;
    setHoverTile(null);
  };

  // Mouse wheel zoom over map viewport
  const handleCanvasWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(4.0, parseFloat((prev + 0.25).toFixed(2))));
    } else {
      setZoom(prev => Math.max(0.5, parseFloat((prev - 0.25).toFixed(2))));
    }
  };

  // Clear All Map Contents Handler (Reset map to 100% empty black canvas)
  const handleClearAllMapContents = () => {
    if (!window.confirm("정말 지도의 모든 타일과 오브젝트를 삭제하고 빈 화면(검은색)으로 초기화하시겠습니까?")) {
      return;
    }
    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    const emptyBase = Array.from({ length: localMap.height }, () => Array.from({ length: localMap.width }, () => -1));
    const emptyDecor = Array.from({ length: localMap.height }, () => Array.from({ length: localMap.width }, () => -1));
    const emptyCollision = Array.from({ length: localMap.height }, () => Array.from({ length: localMap.width }, () => false));

    const resetLayers: CustomTileLayer[] = [
      { id: 'layer_base', name: '1단계(배경)', visible: true, grid: emptyBase, type: 'base' },
      { id: 'layer_decor', name: '2단계(오브젝트)', visible: true, grid: emptyDecor, type: 'decor' }
    ];

    setLocalMap(prev => ({
      ...prev,
      baseLayer: emptyBase,
      decorLayer: emptyDecor,
      layers: resetLayers,
      collision: emptyCollision,
      objects: []
    }));

    setActiveLayerId('layer_base');
    setSelectedObjectId(null);
    setMapBoxSelection(null);
    setMapBoxSelectStart(null);
    alert("지도의 모든 내역이 초기화되어 빈 화면(검은색)이 되었습니다.");
  };

  const handleResizeMap = () => {
    const newW = parseInt(widthInput, 10);
    const newH = parseInt(heightInput, 10);

    if (isNaN(newW) || isNaN(newH) || newW < 5 || newW > 100 || newH < 5 || newH > 100) {
      alert('지도 가로 및 세로 크기는 5에서 100 사이의 숫자로 입력해 주세요.');
      return;
    }

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    const deltaW = newW - localMap.width;
    const deltaH = newH - localMap.height;

    // Calculate tile offsets according to selected Photoshop 3x3 anchor
    let offsetX = 0;
    if (['nw', 'w', 'sw'].includes(canvasAnchor)) {
      offsetX = 0;
    } else if (['n', 'c', 's'].includes(canvasAnchor)) {
      offsetX = Math.floor(deltaW / 2);
    } else if (['ne', 'e', 'se'].includes(canvasAnchor)) {
      offsetX = deltaW;
    }

    let offsetY = 0;
    if (['nw', 'n', 'ne'].includes(canvasAnchor)) {
      offsetY = 0;
    } else if (['w', 'c', 'e'].includes(canvasAnchor)) {
      offsetY = Math.floor(deltaH / 2);
    } else if (['sw', 's', 'se'].includes(canvasAnchor)) {
      offsetY = deltaH;
    }

    const newBase = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) => {
        const oldX = x - offsetX;
        const oldY = y - offsetY;
        if (oldY >= 0 && oldY < localMap.height && oldX >= 0 && oldX < localMap.width) {
          return localMap.baseLayer[oldY][oldX];
        }
        return -1;
      })
    );

    const newDecor = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) => {
        const oldX = x - offsetX;
        const oldY = y - offsetY;
        if (oldY >= 0 && oldY < localMap.height && oldX >= 0 && oldX < localMap.width) {
          return localMap.decorLayer[oldY][oldX];
        }
        return -1;
      })
    );

    const currentNormLayers = getNormalizedLayers(localMap);
    const updatedLayers = currentNormLayers.map(l => ({
      ...l,
      grid: Array.from({ length: newH }, (_, y) =>
        Array.from({ length: newW }, (_, x) => {
          const oldX = x - offsetX;
          const oldY = y - offsetY;
          if (oldY >= 0 && oldY < localMap.height && oldX >= 0 && oldX < localMap.width) {
            return l.grid[oldY] && l.grid[oldY][oldX] !== undefined ? l.grid[oldY][oldX] : -1;
          }
          return -1;
        })
      )
    }));

    const newCollision = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) => {
        if (x === 0 || x === newW - 1 || y === 0 || y === newH - 1) return true;
        const oldX = x - offsetX;
        const oldY = y - offsetY;
        if (oldY >= 0 && oldY < localMap.height && oldX >= 0 && oldX < localMap.width) {
          return localMap.collision[oldY][oldX];
        }
        return false;
      })
    );

    // Shift map objects according to anchor offset
    const shiftedObjects = (localMap.objects || []).map(obj => ({
      ...obj,
      x: obj.x + offsetX,
      y: obj.y + offsetY
    })).filter(obj =>
      obj.x + obj.width > 0 && obj.x < newW &&
      obj.y + obj.height > 0 && obj.y < newH
    );

    const boundedSpawns = localMap.spawnPoints.map(p => ({
      x: Math.max(1, Math.min(newW - 2, p.x + offsetX)),
      y: Math.max(1, Math.min(newH - 2, p.y + offsetY))
    }));

    const anchorNames: Record<string, string> = {
      nw: '좌측 상단 ↖', n: '상단 중앙 ⬆', ne: '우측 상단 ↗',
      w: '좌측 중앙 ⬅', c: '중앙 🎯', e: '우측 중앙 ➡',
      sw: '좌측 하단 ↙', s: '하단 중앙 ⬇', se: '우측 하단 ↘'
    };

    const updated: MapDefinition = {
      ...localMap,
      width: newW,
      height: newH,
      baseLayer: newBase,
      decorLayer: newDecor,
      layers: updatedLayers,
      collision: newCollision,
      objects: shiftedObjects,
      spawnPoints: boundedSpawns
    };

    setLocalMap(updated);
    alert(`지도 크기가 ${newW}x${newH}로 변경되었습니다! (기준: ${anchorNames[canvasAnchor] || '중앙'})`);
  };

  const getSelectedTileDetails = () => {
    if (selectedTile === -1) {
      return { col: 0, row: 0, label: '지우개 🧽', url: '', cols: tilesetCols, tileW: 16, tileH: 16 };
    }
    const drawInfo = getTileDrawInfo(selectedTile, activeTileset);
    if (!drawInfo) return { col: 0, row: 0, label: '지우개 🧽', url: '', cols: tilesetCols, tileW: 16, tileH: 16 };
    const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
    const img = images[drawInfo.tilesetKey];
    const tileW = img ? Math.max(1, Math.floor(img.width / tsInfo.cols)) : 16;
    const tileH = img ? Math.max(1, Math.floor(img.height / tsInfo.rows)) : 16;
    return {
      col: drawInfo.localIdx % tsInfo.cols,
      row: Math.floor(drawInfo.localIdx / tsInfo.cols),
      label: `${tsInfo.label} (ID: ${drawInfo.localIdx})`,
      url: tsInfo.url,
      cols: tsInfo.cols,
      tileW,
      tileH
    };
  };

  const getPrefixedIndex = (localIdx: number, tilesetKey: string) => {
    if (localIdx === -1) return -1;
    const custom = customMapTilesets.find(ct => ct.id === tilesetKey);
    if (custom && custom.prefix) {
      // Tell a local index from an already-prefixed one by the sheet's actual tile count, not by a
      // flat `>= 1000` test. A 16x64 sheet has 1024 tiles, so its own local indices 1000-1023 were
      // being mistaken for global ones and returned unprefixed — landing them in the built-in
      // `interior` range (1000+), which is why picking a tile near the bottom of a tall sheet
      // stamped a piece of indoor furniture instead.
      const span = Math.max(1, (custom.cols || 16) * (custom.rows || 16));
      if (localIdx < span) return custom.prefix + localIdx;
      if (localIdx >= custom.prefix && localIdx < custom.prefix + span) return localIdx;
      return custom.prefix + localIdx;
    }
    // Built-in sheets are all far below 1000 tiles, so the original guard is still correct for them
    if (localIdx >= 1000) return localIdx;
    switch (tilesetKey) {
      case 'interior': return 1000 + localIdx;
      case 'outdoor': return 2000 + localIdx;
      case 'village': return 3000 + localIdx;
      case 'wall': return 4000 + localIdx;
      case 'house': return 5000 + localIdx;
      case 'nature': return 6000 + localIdx;
      case 'water': return 7000 + localIdx;
      case 'field': return 8000 + localIdx;
      default: return localIdx;
    }
  };

  const getOffsetTile = (baseTileIdx: number, currentTsKey: string, dx: number, dy: number): number => {
    if (baseTileIdx === -1) return -1;
    const drawInfo = getTileDrawInfo(baseTileIdx, currentTsKey);
    if (!drawInfo) return baseTileIdx;

    const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
    const baseCol = drawInfo.localIdx % tsInfo.cols;
    const baseRow = Math.floor(drawInfo.localIdx / tsInfo.cols);

    const targetCol = baseCol + dx;
    const targetRow = baseRow + dy;

    if (targetCol >= tsInfo.cols || targetRow >= tsInfo.rows) {
      return baseTileIdx;
    }

    const targetLocalIdx = targetRow * tsInfo.cols + targetCol;
    return getPrefixedIndex(targetLocalIdx, drawInfo.tilesetKey);
  };

  if (!localMap) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#111116', zIndex: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px' }}>
        지도 데이터를 로딩 중입니다...
      </div>
    );
  }

  const tileDetails = getSelectedTileDetails();

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: '#181818', zIndex: 140, display: 'flex', flexDirection: 'column',
      color: '#fff', fontFamily: 'var(--font-pixel)', userSelect: 'none'
    }}>
      {/* 1. Photoshop-Style Compact Header Toolbar */}
      <div style={{
        padding: "4px 16px 0px 16px", borderBottom: "1px solid #282828",
        background: "#181818", display: "flex", justifyContent: "space-between",
        alignItems: "flex-end", minHeight: "38px", zIndex: 10
      }}>
        {/* Left Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "4px" }}>
          <button
            onClick={handleCancel}
            style={{
              padding: "4px 10px", background: "#333333", border: "1px solid #484848",
              borderRadius: "4px", color: "#fff", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px",
              cursor: "pointer"
            }}
          >
            <X size={13} /> 닫기
          </button>
          <button
            onClick={handleSave}
            disabled={editLock.isReadOnly}
            title={editLock.isReadOnly ? `${editLock.lockedBy}님이 편집 중입니다` : '저장하기'}
            style={{
              padding: "4px 12px",
              background: editLock.isReadOnly ? "#45475a" : "var(--primary)",
              border: `1px solid ${editLock.isReadOnly ? "#585b70" : "var(--primary-hover)"}`,
              borderRadius: "4px", color: editLock.isReadOnly ? "#8a8a9e" : "#fff",
              fontSize: "11px", display: "flex", alignItems: "center", gap: "4px",
              fontWeight: "normal", cursor: editLock.isReadOnly ? "not-allowed" : "pointer"
            }}
          >
            <Save size={13} /> {editLock.isReadOnly ? '읽기 전용' : '저장하기'}
          </button>

          {editLock.isReadOnly && (
            <span style={{
              padding: "4px 10px", background: "rgba(250, 179, 135, 0.14)", border: "1px solid #fab387",
              borderRadius: "4px", color: "#fab387", fontSize: "11px", whiteSpace: "nowrap"
            }}>
              🔒 <strong>{editLock.lockedBy}</strong>님이 편집 중 — 저장이 잠겼습니다
            </span>
          )}

          {/* Undo & Redo Icons attached right next to 저장하기 */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px", marginLeft: "6px" }}>
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              style={{
                padding: "4px 8px", background: "#333333", border: "1px solid #484848",
                borderRadius: "4px 0 0 4px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: history.length === 0 ? "not-allowed" : "pointer", opacity: history.length === 0 ? 0.3 : 1
              }}
              title="실행 취소 (Ctrl + Z)"
            >
              <Undo size={13} />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoHistory.length === 0}
              style={{
                padding: "4px 8px", background: "#333333", border: "1px solid #484848",
                borderLeft: "none", borderRadius: "0 4px 4px 0", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: redoHistory.length === 0 ? "not-allowed" : "pointer", opacity: redoHistory.length === 0 ? 0.3 : 1
              }}
              title="다시 실행 (Ctrl + Y)"
            >
              <Redo size={13} />
            </button>
          </div>
        </div>

        {/* Center: Photoshop Document Tabs with Compact Add Button */}
        <div style={{ display: "flex", gap: "2px", alignItems: "flex-end" }}>
          {tabMapIds.map((mId) => {
            const mapObj = activeMaps[mId];
            const name = mapObj ? mapObj.name : mId;
            const isSelected = selectedMapId === mId;
            const canDelete = tabMapIds.length > 1;
            const isDragOver = dragOverTabId === mId;
            const isBeingDragged = draggedTabId === mId;

            return (
              <div
                key={mId}
                draggable={true}
                onDragStart={(e) => handleTabDragStart(e, mId)}
                onDragOver={(e) => handleTabDragOver(e, mId)}
                onDragLeave={handleTabDragLeave}
                onDrop={(e) => handleTabDrop(e, mId)}
                onDragEnd={handleTabDragEnd}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "6px 6px 0 0",
                  background: isSelected ? "#333333" : "#222222",
                  color: isSelected ? "#ffffff" : "#aaaaaa",
                  borderTop: isSelected ? "2px solid #89b4fa" : "1px solid #282828",
                  borderLeft: isSelected ? "1px solid #444444" : "1px solid #282828",
                  borderRight: isSelected ? "1px solid #444444" : "1px solid #282828",
                  borderBottom: "none",
                  opacity: isBeingDragged ? 0.4 : 1,
                  transition: "all 0.15s ease",
                  cursor: "grab"
                }}
                onClick={() => {
                  if (!isSelected) {
                    const hasChanges = JSON.stringify(localMap) !== JSON.stringify(originalMap);
                    if (hasChanges) {
                      if (!window.confirm("저장하지 않은 변경사항이 있습니다. 다른 지도로 이동하시겠습니까?")) {
                        return;
                      }
                    }
                    setSelectedMapId(mId);
                  }
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: isSelected ? "bold" : "normal" }}>
                  {name}
                </span>

                {/* Rename button (✏️) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newName = window.prompt(`'${name}' 맵의 새로운 이름을 입력하세요:`, name);
                    if (newName && newName.trim() && newName.trim() !== name) {
                      if (onRenameMap) {
                        onRenameMap(mId, newName.trim());
                      }
                      if (mId === selectedMapId) {
                        setLocalMap((prev) => ({ ...prev, name: newName.trim() }));
                      }
                    }
                  }}
                  title="맵 이름 변경"
                  style={{
                    background: "none", border: "none",
                    color: "rgba(255, 255, 255, 0.4)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "1px", borderRadius: "3px", marginLeft: "2px"
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "#89b4fa";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255, 255, 255, 0.4)";
                  }}
                >
                  <Pencil size={11} />
                </button>

                {/* Delete tab button (X) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canDelete) return;
                    if (window.confirm(`'${name}' 맵을 완전히 삭제하시겠습니까?`)) {
                      onDeleteMap(mId);
                    }
                  }}
                  title={canDelete ? `${name} 맵 삭제` : "최소 1개 맵 필수"}
                  style={{
                    background: "none", border: "none",
                    color: canDelete ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.15)",
                    cursor: canDelete ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "1px", borderRadius: "3px", marginLeft: "1px"
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
          {availableMapIds.length < 4 && (
            <button
              onClick={() => setShowAddModal(true)}
              title="새 맵 추가 (최대 4개)"
              style={{
                display: "flex", alignItems: "center", gap: "3px",
                padding: "6px 12px", borderRadius: "6px 6px 0 0",
                background: "#222222",
                color: "var(--accent)",
                borderTop: "1px solid #282828",
                borderLeft: "1px solid #282828",
                borderRight: "1px solid #282828",
                borderBottom: "none",
                cursor: "pointer", transition: "all 0.15s ease",
                fontSize: "12px", fontWeight: "normal"
              }}
            >
              <Plus size={13} />
              <span>추가</span>
            </button>
          )}
        </div>

        {/* Right Actions: Market Share */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "4px" }}>
          <button
            type="button"
            onClick={() => {
              setPublishTitle(localMap.name || '');
              setPublishDesc('');
              setPublishCreator(localStorage.getItem('on_house_nickname') || '익명 크리에이터');
              setIncludeCustomTilesets(true);
              setShowPublishModal(true);
            }}
            style={{
              padding: "5px 12px", background: "rgba(167, 139, 250, 0.15)", color: "#a78bfa",
              border: "1px solid #a78bfa", borderRadius: "4px", fontSize: "12px",
              display: "flex", alignItems: "center", gap: "4px", cursor: "pointer"
            }}
            title="이 맵과 사용 중인 커스텀 타일셋을 오픈 마켓 상점에 공유"
          >
            🛒 맵 마켓 공유
          </button>
        </div>
      </div>

      {/* Contextual Action Instruction Status Bar */}
      <div style={{
        background: '#333333',
        borderBottom: '1px solid #222222',
        padding: '5px 16px',
        fontSize: '12px',
        color: '#dddddd',
        fontWeight: 'normal',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minHeight: '34px',
        boxSizing: 'border-box'
      }}>
        {(tool === 'collision' || editLayer === 'collision') && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#f38ba8', marginRight: '2px', fontWeight: 'normal' }}>
              이동 불가 벽 설정:
            </span>
            <button
              type="button"
              onClick={() => {
                setCollisionSubMode('delete');
                setSelectedTile(-1);
              }}
              style={{
                padding: '3px 12px', fontSize: '11px', borderRadius: '4px',
                background: collisionSubMode === 'delete' ? '#f38ba8' : 'rgba(255,255,255,0.06)',
                color: collisionSubMode === 'delete' ? '#111' : '#f38ba8',
                border: '1px solid #f38ba8', cursor: 'pointer', fontWeight: 'normal'
              }}
              title="이동 불가 벽 삭제 (마우스 드래그 가능)"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() => {
                setCollisionSubMode('add');
                setSelectedTile(1);
              }}
              style={{
                padding: '3px 12px', fontSize: '11px', borderRadius: '4px',
                background: collisionSubMode === 'add' ? '#f38ba8' : 'rgba(255,255,255,0.06)',
                color: collisionSubMode === 'add' ? '#111' : '#f38ba8',
                border: '1px solid #f38ba8', cursor: 'pointer', fontWeight: 'normal'
              }}
              title="이동 불가 벽 추가 (마우스 드래그 가능)"
            >
              추가
            </button>
          </div>
        )}

        {/* Drag Slider Size Control for tools requiring size (Collision Wall, Eraser) */}
        {(tool === 'collision' || editLayer === 'collision' || selectedTile === -1) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '10px', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
            <span style={{ fontSize: '11px', color: '#89b4fa', fontWeight: 'normal', whiteSpace: 'nowrap' }}>
              크기:
            </span>
            <input
              type="range"
              min="1"
              max="10"
              value={brushSize}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                setBrushSize(val);
                if (paletteSelection) setPaletteSelection(null);
              }}
              style={{
                width: '85px',
                height: '4px',
                accentColor: '#89b4fa',
                cursor: 'pointer'
              }}
              title="도구 크기 조절 (1x1 ~ 10x10)"
            />
            <span style={{ fontSize: '11px', color: '#fff', minWidth: '28px', fontWeight: 'normal' }}>
              {brushSize}x{brushSize}
            </span>
          </div>
        )}

        <span style={{ color: '#ccc', fontWeight: 'normal' }}>
          {getActiveToolInstruction()}
        </span>
      </div>

      {/* 2. Main Editor Workspace (3-column layout) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Side: Map Properties Panel with 3 Compact Tabs (기본, 크기, 옵션) */}
        <div style={{
          width: '260px', borderRight: '1px solid #222222',
          background: '#333333', display: 'flex',
          flexDirection: 'column', overflow: 'hidden'
        }}>
          {/* Tab Header Row */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #222222',
            background: '#252525', padding: '4px 4px 0 4px', gap: '2px'
          }}>
            {(['basic', 'size', 'option'] as const).map((tabKey) => {
              const isActive = leftSidebarTab === tabKey;
              const label = tabKey === 'basic' ? '⚙️ 기본' : tabKey === 'size' ? '📐 크기' : '👁️ 옵션';
              return (
                <button
                  key={tabKey}
                  onClick={() => setLeftSidebarTab(tabKey)}
                  style={{
                    flex: 1, padding: '7px 2px', fontSize: '12px', fontWeight: 'normal',
                    color: isActive ? '#ffffff' : '#aaaaaa',
                    background: isActive ? '#333333' : '#222222',
                    borderTop: isActive ? '2px solid #89b4fa' : '1px solid #282828',
                    borderLeft: isActive ? '1px solid #444444' : '1px solid #282828',
                    borderRight: isActive ? '1px solid #444444' : '1px solid #282828',
                    borderBottom: 'none', borderRadius: '4px 4px 0 0',
                    cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Tab Body Scrollable Container */}
          <div style={{ flex: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Tab 1: ⚙️ 기본 (도구, 레이어, 브러시 크기 설정) */}
            {leftSidebarTab === 'basic' && (
              <>
                {/* Section 1: 그리기 도구 설정 (Top Position & 2-Column Photoshop Compact Style) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h4 style={{ fontSize: '13px', color: 'var(--accent)', margin: '0 0 2px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'normal' }}>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>▪</span> 그리기 도구 설정
                  </h4>
                  
                  {/* 2-Column Icon-Only Grid Layout (Photoshop Style - 2 per row) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                    {/* 1. 선택(V) */}
                    <button
                      type="button"
                      onClick={() => {
                        setTool('select');
                        if (editLayer === 'collision') setEditLayer('decor');
                      }}
                      style={{
                        padding: '8px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: tool === 'select' && editLayer !== 'collision' ? 'rgba(245, 194, 231, 0.3)' : 'rgba(255,255,255,0.04)',
                        color: tool === 'select' && editLayer !== 'collision' ? '#f5c2e7' : '#fff',
                        border: tool === 'select' && editLayer !== 'collision' ? '1px solid #f5c2e7' : '1px solid var(--border-glass)',
                        cursor: 'pointer'
                      }}
                      title="선택(V) - 오브젝트 스마트 선택 및 이동/그룹화"
                    >
                      <MousePointer size={18} />
                    </button>

                    {/* 2. 스포이드(E) */}
                    <button
                      type="button"
                      onClick={() => {
                        setTool('eyedropper');
                        if (editLayer === 'collision') setEditLayer('decor');
                        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
                      }}
                      style={{
                        padding: '8px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: (tool === 'eyedropper' || isAltPressed) && editLayer !== 'collision' ? 'rgba(137, 220, 235, 0.3)' : 'rgba(255,255,255,0.04)',
                        color: (tool === 'eyedropper' || isAltPressed) && editLayer !== 'collision' ? '#89dceb' : '#fff',
                        border: (tool === 'eyedropper' || isAltPressed) && editLayer !== 'collision' ? '1px solid #89dceb' : '1px solid var(--border-glass)',
                        cursor: 'pointer'
                      }}
                      title="스포이드(E) - 맵 타일 픽 (Alt + 클릭)"
                    >
                      <Pipette size={18} />
                    </button>

                    {/* 3. 브러시(B) */}
                    <button
                      type="button"
                      onClick={() => {
                        setTool('brush');
                        if (editLayer === 'collision') setEditLayer('decor');
                        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
                      }}
                      style={{
                        padding: '8px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: tool === 'brush' && selectedTile !== -1 && editLayer !== 'collision' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.04)',
                        color: tool === 'brush' && selectedTile !== -1 && editLayer !== 'collision' ? 'var(--accent)' : '#fff',
                        border: tool === 'brush' && selectedTile !== -1 && editLayer !== 'collision' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                        cursor: 'pointer'
                      }}
                      title="브러시(B) - 타일 그리기"
                    >
                      <Paintbrush size={18} />
                    </button>

                    {/* 4. 채우기(F) */}
                    <button
                      type="button"
                      onClick={() => {
                        setTool('bucket');
                        if (editLayer === 'collision') setEditLayer('decor');
                        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
                      }}
                      style={{
                        padding: '8px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: tool === 'bucket' && selectedTile !== -1 && editLayer !== 'collision' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.04)',
                        color: tool === 'bucket' && selectedTile !== -1 && editLayer !== 'collision' ? 'var(--accent)' : '#fff',
                        border: tool === 'bucket' && selectedTile !== -1 && editLayer !== 'collision' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                        cursor: 'pointer'
                      }}
                      title="채우기(F) - 영역 채우기"
                    >
                      <PaintBucket size={18} />
                    </button>

                    {/* 5. 오브젝트(O) */}
                    <button
                      type="button"
                      onClick={() => {
                        setTool('object');
                        if (editLayer === 'collision') setEditLayer('decor');
                        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
                      }}
                      style={{
                        padding: '8px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: tool === 'object' && editLayer !== 'collision' ? 'rgba(250, 179, 135, 0.3)' : 'rgba(255,255,255,0.04)',
                        color: tool === 'object' && editLayer !== 'collision' ? '#fab387' : '#fff',
                        border: tool === 'object' && editLayer !== 'collision' ? '1px solid #fab387' : '1px solid var(--border-glass)',
                        cursor: 'pointer'
                      }}
                      title="오브젝트(O) - 독립 오브젝트 스탬프 배치"
                    >
                      <Layers size={18} />
                    </button>

                    {/* 6. 지우개 모드(X) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTile(-1);
                        setTool('brush');
                        if (editLayer === 'collision') setEditLayer('decor');
                      }}
                      style={{
                        padding: '8px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: selectedTile === -1 && editLayer !== 'collision' ? 'var(--danger)' : 'rgba(255,255,255,0.04)',
                        color: '#fff',
                        border: selectedTile === -1 && editLayer !== 'collision' ? '1px solid var(--danger)' : '1px solid var(--border-glass)',
                        cursor: 'pointer'
                      }}
                      title="지우개(X) - 타일 및 오브젝트 지우기"
                    >
                      <Eraser size={18} />
                    </button>

                    {/* 7. 이동 불가 / 벽 설정 (C) - NEW ICON BUTTON! */}
                    <button
                      type="button"
                      onClick={() => {
                        setTool('collision');
                        setEditLayer('collision');
                        setShowCollision(true);
                        setCollisionSubMode('delete');
                        setSelectedTile(-1);
                      }}
                      style={{
                        padding: '8px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: tool === 'collision' || editLayer === 'collision' ? 'rgba(243, 139, 168, 0.35)' : 'rgba(255,255,255,0.04)',
                        color: tool === 'collision' || editLayer === 'collision' ? '#f38ba8' : '#fff',
                        border: tool === 'collision' || editLayer === 'collision' ? '1px solid #f38ba8' : '1px solid var(--border-glass)',
                        cursor: 'pointer',
                        gridColumn: 'span 2'
                      }}
                      title="이동 불가 / 벽 설정 (C) - 캔버스 클릭 및 드래그로 충돌 벽 삭제/추가"
                    >
                      <span style={{ fontSize: '12px', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ShieldAlert size={16} /> 이동 불가 / 벽 설정 (C)
                      </span>
                    </button>
                  </div>
                </div>

                {/* Section 2: 레이어 (Photoshop-style Layers Panel - Bottom Position) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <h4 style={{ fontSize: '13px', color: 'var(--accent)', margin: '0 0 4px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 'normal' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', opacity: 0.7 }}>▪</span> 레이어
                    </span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{currentLayers.length}개</span>
                  </h4>

                  {/* Layers Panel Box */}
                  <div style={{
                    background: 'rgba(12, 12, 20, 0.85)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {/* Layer Items List */}
                    <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                      {currentLayers.map((layer, idx) => {
                        const isActive = editLayer !== 'collision' && layer.id === activeLayerId;
                        return (
                          <div
                            key={layer.id}
                            onClick={() => {
                              setActiveLayerId(layer.id);
                              if (editLayer === 'collision') setEditLayer('decor');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 8px',
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              background: isActive ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
                              color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            {/* Eye Toggle Icon */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleLayerVisibility(layer.id);
                              }}
                              title={layer.visible ? "레이어 숨기기" : "레이어 보이기"}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '12px', opacity: layer.visible ? 1 : 0.25, padding: '0 2px'
                              }}
                            >
                              {layer.visible ? '👁️' : '🙈'}
                            </button>

                            {/* Layer Name */}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 'bold' : 'normal' }}>
                              {layer.name}
                            </span>

                            {/* Reorder Buttons (Compact ▲ ▼) */}
                            <div style={{ display: 'flex', gap: '1px' }} onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveLayer(idx, -1)}
                                style={{
                                  background: 'none', border: 'none', color: idx === 0 ? '#444' : '#aaa',
                                  cursor: idx === 0 ? 'default' : 'pointer', fontSize: '9px', padding: '0 1px'
                                }}
                                title="위로 이동"
                              >▲</button>
                              <button
                                type="button"
                                disabled={idx === currentLayers.length - 1}
                                onClick={() => handleMoveLayer(idx, 1)}
                                style={{
                                  background: 'none', border: 'none', color: idx === currentLayers.length - 1 ? '#444' : '#aaa',
                                  cursor: idx === currentLayers.length - 1 ? 'default' : 'pointer', fontSize: '9px', padding: '0 1px'
                                }}
                                title="아래로 이동"
                              >▼</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Compact Icon-Only Bottom Action Toolbar (Photoshop style - No Wordy Text Labels!) */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '4px',
                      padding: '4px 6px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      borderTop: '1px solid var(--border-glass)'
                    }}>
                      <button
                        type="button"
                        onClick={handleAddLayer}
                        title="새 레이어 추가"
                        style={{
                          background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
                          borderRadius: '4px', color: '#fff', cursor: 'pointer', padding: '3px 7px', fontSize: '11px'
                        }}
                      >➕</button>
                      <button
                        type="button"
                        onClick={handleDuplicateLayer}
                        title="선택 레이어 복제"
                        style={{
                          background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
                          borderRadius: '4px', color: '#fff', cursor: 'pointer', padding: '3px 7px', fontSize: '11px'
                        }}
                      >📋</button>
                      <button
                        type="button"
                        onClick={handleDeleteLayer}
                        title="선택 레이어 삭제"
                        style={{
                          background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
                          borderRadius: '4px', color: '#f38ba8', cursor: 'pointer', padding: '3px 7px', fontSize: '11px'
                        }}
                      >🗑️</button>
                    </div>
                  </div>
                </div>



                {/* Section 4: 현재 브러시 */}
                {(() => {
                  const selInfo = getTileDrawInfo(selectedTile, activeTileset);
                  const tsInfo = selInfo ? getTilesetInfoLocal(selInfo.tilesetKey) : null;
                  const tsCols = tsInfo ? tsInfo.cols : tilesetCols;
                  const startCol = selInfo ? (selInfo.localIdx % tsCols) : 0;
                  const startRow = selInfo ? Math.floor(selInfo.localIdx / tsCols) : 0;
                  const curCols = (paletteSelection && paletteSelection.tilesetKey === activeTileset) ? paletteSelection.cols : (brushSize || 1);
                  const curRows = (paletteSelection && paletteSelection.tilesetKey === activeTileset) ? paletteSelection.rows : (brushSize || 1);

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                      <h4 style={{ fontSize: "13px", color: "var(--accent)", margin: "0 0 2px 0", borderBottom: "1px solid var(--border-glass)", paddingBottom: "4px", display: "flex", alignItems: "center", gap: "6px", fontWeight: "normal" }}>
                        <span style={{ fontSize: "10px", opacity: 0.7 }}>▪</span> 현재 브러시
                      </h4>
                      <div style={{
                        padding: "8px 10px", borderRadius: "6px",
                        background: "rgba(15, 15, 25, 0.6)", border: "1px solid var(--border-glass)",
                        display: "flex", alignItems: "center", gap: "10px"
                      }}>
                        <div style={{
                          width: `${Math.max(36, Math.min(54, curCols * 18))}px`,
                          height: `${Math.max(36, Math.min(54, curRows * 18))}px`,
                          border: "2px solid var(--accent)",
                          borderRadius: "6px", background: "#000", display: "grid",
                          gridTemplateColumns: `repeat(${curCols}, 1fr)`,
                          overflow: "hidden", imageRendering: "pixelated", padding: "1px", boxSizing: "border-box", flexShrink: 0
                        }}>
                          {selectedTile !== -1 ? (
                            Array.from({ length: curCols * curRows }).map((_, i) => {
                              const dx = i % curCols;
                              const dy = Math.floor(i / curCols);
                              const cellCol = startCol + dx;
                              const cellRow = startRow + dy;
                              const cellLocalIdx = cellRow * tsCols + cellCol;
                              const subTile = getPrefixedIndex(cellLocalIdx, activeTileset);
                              const subInfo = getTileDrawInfo(subTile, activeTileset);
                              if (!subInfo) return <div key={i} />;
                              const subTsInfo = getTilesetInfoLocal(subInfo.tilesetKey);
                              if (!subTsInfo || !subTsInfo.cols) return <div key={i} />;
                              const subCol = subInfo.localIdx % subTsInfo.cols;
                              const subRow = Math.floor(subInfo.localIdx / subTsInfo.cols);
                              return (
                                <div key={i} style={{
                                  width: "100%", height: "100%",
                                  backgroundImage: `url(${subTsInfo.url})`,
                                  backgroundPosition: `-${subCol * 100}% -${subRow * 100}%`,
                                  backgroundSize: `${subTsInfo.cols * 100}% ${subTsInfo.rows * 100}%`,
                                  imageRendering: "pixelated"
                                }} />
                              );
                            })
                          ) : (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%" }}>
                              <span style={{ fontSize: "16px" }}>🧽</span>
                            </div>
                          )}
                        </div>
                        <div style={{ minWidth: 0, overflow: "hidden" }}>
                          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                            {curCols}x{curRows} 크기 브러시
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--accent)", fontWeight: "normal", marginTop: "2px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {selectedTile === -1 ? "지우개 🧽" : `${tileDetails.label}`}
                          </div>
                        </div>
                      </div>
                      
                      {/* Brush History Row */}
                      {brushHistory.length > 1 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px", padding: "4px", background: "rgba(10, 10, 15, 0.4)", borderRadius: "4px", alignItems: "center" }}>
                          {brushHistory.slice(1).map((hist, idx) => {
                            const hSelInfo = getTileDrawInfo(hist.selectedTile, hist.activeTileset);
                            if (!hSelInfo) return null;
                            const hTsInfo = getTilesetInfoLocal(hSelInfo.tilesetKey);
                            if (!hTsInfo || !hTsInfo.cols) return null;
                            const hTsCols = hTsInfo.cols;
                            const hStartCol = hSelInfo.localIdx % hTsCols;
                            const hStartRow = Math.floor(hSelInfo.localIdx / hTsCols);

                            const hCols = (hist.paletteSelection && hist.paletteSelection.tilesetKey === hist.activeTileset) ? hist.paletteSelection.cols : (hist.brushSize || 1);
                            const hRows = (hist.paletteSelection && hist.paletteSelection.tilesetKey === hist.activeTileset) ? hist.paletteSelection.rows : (hist.brushSize || 1);

                            const isMultiTile = hCols > 1 || hRows > 1;
                            const boxW = Math.max(26, Math.min(54, hCols * 14));
                            const boxH = Math.max(26, Math.min(54, hRows * 14));

                            return (
                              <button
                                key={idx}
                                onClick={() => {
                                  if (hist.activeTileset !== activeTileset) {
                                    setActiveTileset(hist.activeTileset);
                                  }
                                  setPaletteSelection(hist.paletteSelection);
                                  setSelectedTile(hist.selectedTile);
                                  const restoreSize = (hist.paletteSelection && hist.paletteSelection.tilesetKey === hist.activeTileset)
                                    ? Math.max(hist.paletteSelection.cols, hist.paletteSelection.rows)
                                    : (hist.brushSize || 1);
                                  setBrushSize(restoreSize);
                                  setTool('brush');
                                  if (editLayer === 'collision') setEditLayer('decor');
                                }}
                                title={`이전 브러시 다시 선택 (${hCols}x${hRows})`}
                                style={{
                                  width: `${boxW}px`,
                                  height: `${boxH}px`,
                                  border: isMultiTile ? "1.5px solid var(--accent)" : "1px solid var(--border-glass)",
                                  borderRadius: "4px",
                                  background: "#000",
                                  padding: "1px",
                                  cursor: "pointer",
                                  flexShrink: 0,
                                  display: "grid",
                                  gridTemplateColumns: `repeat(${hCols}, 1fr)`,
                                  overflow: "hidden",
                                  imageRendering: "pixelated",
                                  position: "relative",
                                  boxSizing: "border-box",
                                  opacity: 0.85,
                                  transition: "all 0.1s ease"
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.opacity = "1";
                                  e.currentTarget.style.borderColor = "var(--accent)";
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.opacity = "0.85";
                                  e.currentTarget.style.borderColor = isMultiTile ? "var(--accent)" : "var(--border-glass)";
                                }}
                              >
                                {Array.from({ length: hCols * hRows }).map((_, cellIdx) => {
                                  const dx = cellIdx % hCols;
                                  const dy = Math.floor(cellIdx / hCols);
                                  const cellCol = hStartCol + dx;
                                  const cellRow = hStartRow + dy;
                                  const cellLocalIdx = cellRow * hTsCols + cellCol;
                                  const subTile = getPrefixedIndex(cellLocalIdx, hist.activeTileset);
                                  const subInfo = getTileDrawInfo(subTile, hist.activeTileset);
                                  if (!subInfo) return <div key={cellIdx} />;
                                  const subTsInfo = getTilesetInfoLocal(subInfo.tilesetKey);
                                  if (!subTsInfo || !subTsInfo.cols) return <div key={cellIdx} />;
                                  const subCol = subInfo.localIdx % subTsInfo.cols;
                                  const subRow = Math.floor(subInfo.localIdx / subTsInfo.cols);
                                  return (
                                    <div key={cellIdx} style={{
                                      width: "100%",
                                      height: "100%",
                                      backgroundImage: `url(${subTsInfo.url})`,
                                      backgroundPosition: `-${subCol * 100}% -${subRow * 100}%`,
                                      backgroundSize: `${subTsInfo.cols * 100}% ${subTsInfo.rows * 100}%`,
                                      imageRendering: "pixelated"
                                    }} />
                                  );
                                })}
                                {isMultiTile && (
                                  <span style={{
                                    position: "absolute",
                                    bottom: 0,
                                    right: 0,
                                    fontSize: "8px",
                                    color: "#fff",
                                    background: "rgba(0,0,0,0.85)",
                                    padding: "0 2px",
                                    borderRadius: "2px 0 0 0",
                                    pointerEvents: "none",
                                    fontFamily: "var(--font-pixel)",
                                    lineHeight: "1"
                                  }}>
                                    {hCols}x{hRows}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </>
            )}

            {/* Tab 2: 📐 크기 (지도 크기) */}
            {leftSidebarTab === "size" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ fontSize: "11px", color: "var(--accent)", margin: "0 0 4px 0", borderBottom: "1px solid var(--border-glass)", paddingBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "9px", opacity: 0.7 }}>▪</span> 지도 크기
                </h4>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {/* Width Input Box with Right-aligned Stepper */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "9px", color: "var(--text-secondary)", marginBottom: "4px" }}>가로 (너비)</div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#222222', border: '1px solid #484848', borderRadius: '4px', overflow: 'hidden' }}>
                      <input
                        type="number"
                        min="10"
                        max="200"
                        value={widthInput}
                        onChange={(e) => setWidthInput(e.target.value)}
                        style={{
                          flex: 1, width: '100%', background: 'transparent', border: 'none',
                          padding: '6px 8px', fontSize: '12px', color: '#fff', textAlign: 'left',
                          outline: 'none'
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid #484848', background: '#292929' }}>
                        <button
                          type="button"
                          onClick={() => setWidthInput(String(Math.min(200, (parseInt(widthInput) || 0) + 1)))}
                          style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '1px 5px', fontSize: '8px', lineHeight: '1' }}
                        >▲</button>
                        <button
                          type="button"
                          onClick={() => setWidthInput(String(Math.max(10, (parseInt(widthInput) || 0) - 1)))}
                          style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '1px 5px', fontSize: '8px', lineHeight: '1' }}
                        >▼</button>
                      </div>
                    </div>
                  </div>

                  <span style={{ fontSize: "12px", marginTop: "16px", color: "var(--text-muted)" }}>x</span>

                  {/* Height Input Box with Right-aligned Stepper */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "9px", color: "var(--text-secondary)", marginBottom: "4px" }}>세로 (높이)</div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#222222', border: '1px solid #484848', borderRadius: '4px', overflow: 'hidden' }}>
                      <input
                        type="number"
                        min="10"
                        max="200"
                        value={heightInput}
                        onChange={(e) => setHeightInput(e.target.value)}
                        style={{
                          flex: 1, width: '100%', background: 'transparent', border: 'none',
                          padding: '6px 8px', fontSize: '12px', color: '#fff', textAlign: 'left',
                          outline: 'none'
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid #484848', background: '#292929' }}>
                        <button
                          type="button"
                          onClick={() => setHeightInput(String(Math.min(200, (parseInt(heightInput) || 0) + 1)))}
                          style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '1px 5px', fontSize: '8px', lineHeight: '1' }}
                        >▲</button>
                        <button
                          type="button"
                          onClick={() => setHeightInput(String(Math.max(10, (parseInt(heightInput) || 0) - 1)))}
                          style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '1px 5px', fontSize: '8px', lineHeight: '1' }}
                        >▼</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Photoshop Style 3x3 Canvas Anchor Selector */}
                <div style={{ marginTop: '6px', background: '#1c1c1e', padding: '8px', borderRadius: '6px', border: '1px solid #38383c' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>기준 위치 (Anchor)</span>
                    <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold' }}>
                      {canvasAnchor === 'c' ? '중앙 🎯' :
                       canvasAnchor === 'nw' ? '좌측 상단 ↖' :
                       canvasAnchor === 'n' ? '상단 중앙 ⬆' :
                       canvasAnchor === 'ne' ? '우측 상단 ↗' :
                       canvasAnchor === 'w' ? '좌측 중앙 ⬅' :
                       canvasAnchor === 'e' ? '우측 중앙 ➡' :
                       canvasAnchor === 'sw' ? '좌측 하단 ↙' :
                       canvasAnchor === 's' ? '하단 중앙 ⬇' : '우측 하단 ↘'}
                    </span>
                  </div>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '4px',
                    width: '130px',
                    margin: '0 auto'
                  }}>
                    {([
                      { id: 'nw', icon: '↖' }, { id: 'n', icon: '⬆' }, { id: 'ne', icon: '↗' },
                      { id: 'w', icon: '⬅' },  { id: 'c', icon: '🎯' }, { id: 'e', icon: '➡' },
                      { id: 'sw', icon: '↙' }, { id: 's', icon: '⬇' }, { id: 'se', icon: '↘' }
                    ] as const).map((anc) => (
                      <button
                        key={anc.id}
                        type="button"
                        onClick={() => setCanvasAnchor(anc.id)}
                        style={{
                          height: '32px',
                          background: canvasAnchor === anc.id ? 'var(--accent)' : '#2a2a2e',
                          color: canvasAnchor === anc.id ? '#000' : '#ccc',
                          border: canvasAnchor === anc.id ? '1px solid #fff' : '1px solid #444',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          fontWeight: canvasAnchor === anc.id ? 'bold' : 'normal',
                          transition: 'all 0.15s ease'
                        }}
                        title={anc.id}
                      >
                        {anc.icon}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleResizeMap}
                  style={{
                    width: "100%", padding: "8px", background: "var(--primary)", color: "#fff",
                    border: "1px solid var(--primary-hover)", borderRadius: "4px", fontSize: "11px",
                    fontWeight: "normal", cursor: "pointer", marginTop: "4px"
                  }}
                >
                  크기 변경 적용
                </button>

                {/* Map Reset Section under Map Size */}
                <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-glass)", paddingTop: "12px" }}>
                  <h4 style={{ fontSize: "11px", color: "var(--accent)", margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "9px", opacity: 0.7 }}>▪</span> 지도 전체 초기화
                  </h4>
                  <button
                    onClick={handleClearAllMapContents}
                    style={{
                      width: "100%", padding: "8px", background: "var(--primary)", color: "#fff",
                      border: "1px solid var(--primary-hover)", borderRadius: "4px", fontSize: "11px",
                      fontWeight: "normal", cursor: "pointer", marginTop: "4px"
                    }}
                  >
                    초기화
                  </button>
                </div>
              </div>
            )}

            {/* Tab 3: 👁️ 옵션 (화면 뷰 옵션 & 오브젝트 배치 옵션) */}
            {leftSidebarTab === "option" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ fontSize: "11px", color: "var(--accent)", margin: "0 0 4px 0", borderBottom: "1px solid var(--border-glass)", paddingBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "9px", opacity: 0.7 }}>▪</span> 화면 뷰 옵션
                </h4>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} /> 그리드 격자선 보이기
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={showDecor} onChange={e => setShowDecor(e.target.checked)} /> 가구/장식 레이어 노출
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={showCollision} onChange={e => setShowCollision(e.target.checked)} /> 벽/통행 경계선 노출 (선명한 빨간색 🔴)
                </label>

                <h4 style={{ fontSize: "11px", color: "var(--accent)", margin: "8px 0 4px 0", borderBottom: "1px solid var(--border-glass)", paddingBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "9px", opacity: 0.7 }}>▪</span> 오브젝트 배치 옵션
                </h4>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#ccc", cursor: "pointer", fontWeight: "normal" }}>
                  <input
                    type="checkbox"
                    checked={autoCollision}
                    onChange={(e) => setAutoCollision(e.target.checked)}
                  />
                  오브젝트 배치 시 이동 불가 자동 설정
                </label>
              </div>
            )}



          </div>
        </div>

        {/* Center: Canvas Viewport Area Container */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', height: '100%' }}>
          {/* Floating Zoom & Tool Bar over Viewport (Fixed on top left) */}
          <div style={{
            position: 'absolute', top: '16px', left: '16px', zIndex: 12,
            background: 'rgba(20, 20, 30, 0.85)', padding: '6px 12px', borderRadius: '8px',
            border: '1px solid var(--border-glass)', display: 'flex', gap: '8px', alignItems: 'center',
            backdropFilter: 'blur(8px)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'auto'
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>🔍 맵 Zoom:</span>
            {([0.5, 1.0, 1.5, 2.0, 3.0] as const).map((zVal) => (
              <button
                key={zVal}
                onClick={() => setZoom(zVal)}
                style={{
                  padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                  background: zoom === zVal ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                  color: zoom === zVal ? '#fff' : 'var(--text-secondary)',
                  border: zoom === zVal ? '1px solid var(--primary-hover)' : '1px solid var(--border-glass)',
                  fontWeight: 'normal', cursor: 'pointer'
                }}
              >
                {Math.round(zVal * 100)}%
              </button>
            ))}

            <div style={{ width: '1px', height: '14px', background: 'var(--border-glass)' }} />

            <button
              onClick={() => setZoom(prev => Math.max(0.5, parseFloat((prev - 0.25).toFixed(2))))}
              style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
            >-</button>
            <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--accent)', minWidth: '40px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.min(4.0, parseFloat((prev + 0.25).toFixed(2))))}
              style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
            >+</button>

            <div style={{ width: '1px', height: '14px', background: 'var(--border-glass)' }} />

            <button
              onClick={handleAutoRepairMap}
              style={{
                padding: '4px 12px', fontSize: '11px', borderRadius: '4px',
                background: 'linear-gradient(135deg, rgba(245,194,231,0.25), rgba(203,166,247,0.25))',
                color: '#f5c2e7', border: '1px solid #f5c2e7', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                fontWeight: 'normal', transition: 'all 0.15s ease'
              }}
              title="이전 버그로 인해 뚫린 지붕 구멍을 자동으로 메우고 상단 잔상 조각을 깨끗이 정리합니다."
            >
              🧹 맵 구멍/잔상 자동 복구
            </button>
          </div>

          {/* Floating Object Smart Edit Action Bar (Fixed on bottom center) */}
          {!mapBoxSelection && selectedObjectIds.length > 0 && (
            <div style={{
              position: "absolute", bottom: "24px", left: "50%", transform: "translateX(-50%)", zIndex: 100,
              background: "rgba(20, 20, 32, 0.95)", border: "1px solid #ffd700",
              borderRadius: "8px", padding: "6px 14px", display: "flex", alignItems: "center", gap: "8px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)", backdropFilter: "blur(10px)",
              pointerEvents: "auto", animation: "fadeIn 0.15s ease-out", whiteSpace: "nowrap"
            }}>
              <span style={{ fontSize: "11px", color: "#ffd700", fontWeight: "normal", whiteSpace: "nowrap" }}>
                📦 오브젝트 {selectedObjectIds.length > 1 ? `(${selectedObjectIds.length}개 선택됨)` : ''}
              </span>
              <div style={{ width: "1px", height: "14px", background: "rgba(255,255,255,0.2)" }} />

              {/* Merge button (2+ objects selected) */}
              {selectedObjectIds.length >= 2 && (
                <button
                  onClick={() => handleMergeSelectedObjects()}
                  style={{
                    padding: "5px 12px", fontSize: "11px", borderRadius: "4px",
                    background: "linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.3))",
                    color: "#a78bfa", border: "1px solid #a78bfa", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap"
                  }}
                  title="선택된 2개 이상의 오브젝트를 1개의 오브젝트로 통합 병합"
                >
                  <Layers size={12} /> 🔗 오브젝트 병합
                </button>
              )}

              {/* Explode / Un-group button */}
              <button
                onClick={() => handleExplodeSelectedObjects()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px",
                  background: "rgba(250, 179, 135, 0.2)",
                  color: "#fab387", border: "1px solid #fab387", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap"
                }}
                title="선택된 오브젝트를 각각 1x1 개별 오브젝트로 해체 분리"
              >
                <Sparkles size={12} /> 💥 오브젝트 해체
              </button>

              <button
                onClick={() => handleBringToFront()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px", background: "rgba(255,255,255,0.08)",
                  color: "#fff", border: "1px solid var(--border-glass)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap"
                }}
                title="앞으로 가져오기"
              >
                <MoveUp size={12} /> 앞으로
              </button>
              <button
                onClick={() => handleSendToBack()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px", background: "rgba(255,255,255,0.08)",
                  color: "#fff", border: "1px solid var(--border-glass)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap"
                }}
                title="뒤로 보내기"
              >
                <MoveDown size={12} /> 뒤로
              </button>
              <button
                onClick={() => handleCopySelectedObject()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px", background: "rgba(255,255,255,0.08)",
                  color: "#fff", border: "1px solid var(--border-glass)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap"
                }}
                title="복사 (Ctrl+C)"
              >
                <Copy size={12} /> 복사
              </button>
              <button
                onClick={() => handleDeleteSelectedObject()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px", background: "var(--danger)",
                  color: "#fff", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", fontWeight: "normal", whiteSpace: "nowrap"
                }}
                title="삭제 (Delete)"
              >
                <Trash2 size={12} /> 삭제
              </button>
              <button
                onClick={() => setSelectedObjectIds([])}
                style={{ padding: "4px 6px", fontSize: "10px", borderRadius: "4px", background: "transparent", color: "#aaa", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Floating Map Drag-Box Selection Action Bar (Group tiles into Single Object) */}
          {mapBoxSelection && (
            <div style={{
              position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 100,
              background: 'rgba(20, 20, 32, 0.95)', border: '1px solid #ffd700',
              borderRadius: '8px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
              pointerEvents: 'auto', animation: 'fadeIn 0.15s ease-out'
            }}>
              <span style={{ fontSize: '11px', color: '#ffd700', fontWeight: 'normal' }}>
                📦 맵 범위 선택됨 ({mapBoxSelection.cols}x{mapBoxSelection.rows})
              </span>
              <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.2)' }} />
              <button
                onClick={handleConvertBoxToSingleObject}
                style={{
                  padding: '5px 12px', fontSize: '11px', borderRadius: '4px',
                  background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary-hover)',
                  fontWeight: 'normal', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}
                title="선택한 맵 타일들을 1개의 독립 오브젝트로 통합 묶기"
              >
                <Layers size={13} /> ✨ 1개의 오브젝트로 묶기
              </button>
              <button
                onClick={() => setMapBoxSelection(null)}
                style={{ padding: '4px 6px', fontSize: '10px', borderRadius: '4px', background: 'transparent', color: '#aaa', border: 'none', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* 🧪 Eyedropper Toast Notification (Fixed on top right) */}
          {pickedToast && (
            <div style={{
              position: 'absolute', top: '16px', right: '16px', zIndex: 12,
              background: 'rgba(137, 220, 235, 0.95)', color: '#11111b', padding: '8px 16px', borderRadius: '8px',
              fontWeight: 'normal', fontSize: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', gap: '6px', animation: 'fadeIn 0.2s ease-out'
            }}>
              <Sparkles size={14} /> {pickedToast}
            </div>
          )}

          {/* Scrollable Viewport Container */}
          <div
            ref={viewportRef}
            onMouseDown={handleViewportMouseDown}
            onMouseMove={handleViewportMouseMove}
            onMouseUp={handleViewportMouseUp}
            onMouseLeave={handleViewportMouseUp}
            style={{
              width: '100%', height: '100%', background: '#2a2a2d', overflow: 'auto', display: 'block',
              position: 'relative', padding: '60px 40px 40px 40px',
              cursor: isPanningViewport.current ? 'grabbing' : isSpaceHeld ? 'grab' : 'default',
              userSelect: 'none', boxSizing: 'border-box'
            }}
          >
            {/* Canvas Wrapper */}
            <div style={{
              position: 'relative', border: '1px solid #3c3c3c', boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              margin: 'auto', width: 'fit-content'
            }}>
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseLeave}
                onWheel={handleCanvasWheel}
                style={{
                  display: 'block',
                  cursor: isPanningViewport.current
                    ? 'grabbing'
                    : isSpaceHeld
                      ? 'grab'
                      : (isAltPressed || (tool as string) === 'eyedropper')
                        ? 'crosshair'
                        : tool === 'bucket'
                          ? 'cell'
                          : selectedTile === -1
                            ? 'alias'
                            : 'pointer'
                }}
              />
            </div>
          </div>
        </div>

        {/* Resizable Divider Drag Handle */}
        <div
          onMouseDown={handlePaletteResizeStart}
          style={{
            width: '6px', background: '#1e1e1f', cursor: 'col-resize',
            borderLeft: '1px solid #38383c', borderRight: '1px solid #38383c',
            display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'background 0.2s'
          }}
          title="좌우 드래그로 크기 조절">
          <div style={{ width: '2px', height: '24px', background: 'rgba(255, 255, 255, 0.4)', borderRadius: '1px' }} />
        </div>

        {/* Right Side: Tileset Palette & Selector Panel */}
        <div style={{
          width: `${paletteWidth}px`, borderLeft: '1px solid #38383c',
          background: '#212123', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          {/* Palette Control Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #38383c',
            background: '#1e1e1f', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🎨 타일셋 브러시 ({paletteWidth}px)
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Palette Tile Zoom Scale */}
              <span style={{ fontSize: "9px", color: "var(--text-secondary)" }}>타일 크기:</span>
              {([1.5, 2.0, 3.0] as const).map((pZoom) => (
                <button
                  key={pZoom}
                  onClick={() => setPaletteZoom(pZoom)}
                  style={{
                    padding: "2px 5px", fontSize: "9px", borderRadius: "3px",
                    background: paletteZoom === pZoom ? "var(--accent)" : "rgba(255,255,255,0.05)",
                    color: paletteZoom === pZoom ? "#000" : "#fff", border: "1px solid var(--border-glass)",
                    fontWeight: "normal", cursor: "pointer"
                  }}
                >
                  {pZoom}x
                </button>
              ))}
          </div>
          </div>

          {/* Tileset Category Dropdown Selector */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-glass)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>타일셋 리스트들</div>
            <select
              value={activeTileset}
              onChange={(e) => {
                const newTs = e.target.value;
                setActiveTileset(newTs);
                setSelectedTile(getPrefixedIndex(0, newTs));
                if (tool !== 'brush' && tool !== 'object') {
                  setTool('brush');
                  if (editLayer === 'collision') setEditLayer('decor');
                }
              }}
              style={{
                width: '100%', background: '#0a0a0f', border: '1px solid var(--border-glass)',
                borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '12px',
                outline: 'none', cursor: 'pointer'
              }}
            >
              <option value="interior">🏠 실내 인테리어 (Interior)</option>
              <option value="outdoor">🏡 실외 바닥/도시 (Outdoor)</option>
              <option value="village">🏘️ 마을 건물/벽면 (Village)</option>
              <option value="wall">🧱 돌담/담장 벽 (Wall)</option>
              <option value="house">🪵 목조 통나무집/지붕 (House)</option>
              <option value="nature">🌳 울창한 나무/숲 (Nature)</option>
              <option value="water">🌊 강물/연못/나무다리 (Water)</option>
              <option value="field">🌾 마당/우물/울타리 (Field)</option>

              {customMapTilesets.length > 0 && (
                <optgroup label="🎨 내가 추가한 타일셋">
                  {customMapTilesets.map(ct => (
                    <option key={ct.id} value={ct.id}>
                      🎨 {ct.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Scrollable Visual Tileset Grid Sheet (Direct Cell Rendering & 100% Precise Hit Testing) */}
          <div style={{ flex: 1, padding: "16px", overflowY: "auto", background: "#0d0d12" }}>
            <div
              onMouseLeave={() => {
                setHoverPaletteTile(null);
                setPaletteDragStart(null);
              }}
              onMouseUp={() => setPaletteDragStart(null)}
              style={{
                display: "inline-block", border: "1px solid #333",
                background: "#000", imageRendering: "pixelated", userSelect: "none"
              }}
            >
              {Array.from({ length: tilesetRows }).map((_, r) => (
                <div key={r} style={{ display: "flex" }}>
                  {Array.from({ length: tilesetCols }).map((_, c) => {
                    const localIdx = r * tilesetCols + c;
                    const prefixedIdx = getPrefixedIndex(localIdx, activeTileset);
                    const selDrawInfo = getTileDrawInfo(selectedTile, activeTileset);
                    const selCol = (selDrawInfo && selDrawInfo.tilesetKey === activeTileset) ? (selDrawInfo.localIdx % tilesetCols) : -1;
                    const selRow = (selDrawInfo && selDrawInfo.tilesetKey === activeTileset) ? Math.floor(selDrawInfo.localIdx / tilesetCols) : -1;
                    const curCols = (paletteSelection && paletteSelection.tilesetKey === activeTileset) ? paletteSelection.cols : 1;
                    const curRows = (paletteSelection && paletteSelection.tilesetKey === activeTileset) ? paletteSelection.rows : 1;

                    const isSelected = (selectedTile !== -1 && selCol !== -1) &&
                      (c >= selCol && c < selCol + curCols && r >= selRow && r < selRow + curRows);

                    let isHovered = false;
                    if (hoverPaletteTile && !paletteDragStart && !isSelected) {
                      isHovered = c === hoverPaletteTile.col && r === hoverPaletteTile.row;
                    }

                    return (
                      <div
                        key={c}
                        title={`Tile ID: ${localIdx} (Row: ${r}, Col: ${c})`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setPaletteDragStart({ col: c, row: r });
                          setPaletteSelection(null);
                          setBrushSize(1);
                          setSelectedTile(prefixedIdx);
                          setSelectedObjectId(null);
                          if (tool !== 'brush' && tool !== 'object') {
                            setTool('brush');
                            if (editLayer === 'collision') setEditLayer('decor');
                          }
                        }}
                        onMouseEnter={() => {
                          setHoverPaletteTile({ col: c, row: r });
                          if (paletteDragStart) {
                            const sCol = Math.min(paletteDragStart.col, c);
                            const sRow = Math.min(paletteDragStart.row, r);
                            const eCol = Math.max(paletteDragStart.col, c);
                            const eRow = Math.max(paletteDragStart.row, r);
                            const cols = eCol - sCol + 1;
                            const rows = eRow - sRow + 1;
                            setPaletteSelection({ startCol: sCol, startRow: sRow, cols, rows, tilesetKey: activeTileset });
                            const sLocalIdx = sRow * tilesetCols + sCol;
                            setSelectedTile(getPrefixedIndex(sLocalIdx, activeTileset));
                            setBrushSize(Math.max(cols, rows));
                          }
                        }}
                        style={{
                          width: `${16 * paletteZoom}px`,
                          height: `${16 * paletteZoom}px`,
                          backgroundImage: `url(${tilesetUrl})`,
                          backgroundPosition: `-${c * 16 * paletteZoom}px -${r * 16 * paletteZoom}px`,
                          backgroundSize: `${tilesetCols * 16 * paletteZoom}px auto`,
                          imageRendering: "pixelated",
                          border: isSelected 
                            ? "2px solid var(--accent)" 
                            : isHovered 
                              ? "1.5px solid #89dceb" 
                              : "1px solid rgba(255,255,255,0.05)",
                          boxSizing: "border-box", cursor: "pointer"
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Map Modal / Popover inside Map Editor */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onClick={() => setShowAddModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#181825', border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px', padding: '20px 24px', width: '340px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)', color: '#fff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                <span>에디터 맵 추가 (현재 {availableMapIds.length} / 최대 4개)</span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px' }}>
              새 커스텀 맵을 생성하세요:
            </div>

            {/* Custom Map Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = customNameInput.trim() || `🎨 커스텀 맵 ${availableMapIds.length + 1}`;
                const newId = onAddMap(undefined, name);
                if (newId) setSelectedMapId(newId);
                setCustomNameInput('');
                setShowAddModal(false);
              }}
              style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '14px' }}
            >
              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px' }}>새 빈 커스텀 맵 직접 만들기:</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="예: 🎨 카페 테라스"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  style={{
                    flex: 1, background: '#0d0d12', border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px', padding: '8px 10px', color: '#fff', fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '8px 14px', background: 'var(--primary)', border: 'none',
                    borderRadius: '6px', color: '#fff', fontSize: '12px', cursor: 'pointer',
                    fontWeight: 'normal', whiteSpace: 'nowrap'
                  }}
                >
                  생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Map Open Market Share Modal */}
      {showPublishModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: '16px'
        }}>
          <form
            onSubmit={handlePublishMapToMarket}
            style={{
              width: '440px', maxWidth: '90vw', background: '#12121e',
              border: '1px solid #3b3b54', padding: '20px', display: 'flex',
              flexDirection: 'column', gap: '14px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)'
            }}
          >
            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🛒 오픈 마켓 상점에 이 맵 공유
            </h3>

            <div style={{ fontSize: '11px', color: '#aaa', background: '#191928', padding: '8px 10px', border: '1px solid #2d2d44' }}>
              공유된 맵은 다른 하우스의 모든 유저가 내 하우스로 가져가 100% 동일하게 렌더링하고 자유롭게 구조를 편집할 수 있습니다.
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#ccc', display: 'block', marginBottom: '4px' }}>🏰 맵 이름:</label>
              <input
                type="text"
                value={publishTitle}
                onChange={(e) => setPublishTitle(e.target.value)}
                placeholder="예: 닌자 템플 마을 맵 30x20"
                required
                style={{ width: '100%', background: '#09090f', border: '1px solid #4a4a6b', padding: '6px 8px', color: '#fff', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#ccc', display: 'block', marginBottom: '4px' }}>📝 간단한 소개 / 설명:</label>
              <textarea
                value={publishDesc}
                onChange={(e) => setPublishDesc(e.target.value)}
                placeholder="맵 구성에 대한 설명이나 크리에이터 한마디를 적어주세요."
                rows={3}
                style={{ width: '100%', background: '#09090f', border: '1px solid #4a4a6b', padding: '6px 8px', color: '#fff', fontSize: '12px', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#ccc', display: 'block', marginBottom: '4px' }}>👤 크리에이터 닉네임:</label>
              <input
                type="text"
                value={publishCreator}
                onChange={(e) => setPublishCreator(e.target.value)}
                placeholder="닉네임"
                style={{ width: '100%', background: '#09090f', border: '1px solid #4a4a6b', padding: '6px 8px', color: '#fff', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ background: '#161625', border: '1px solid #3b3b54', padding: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#ffb86c', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeCustomTilesets}
                  onChange={(e) => setIncludeCustomTilesets(e.target.checked)}
                />
                📦 이 맵에 사용된 커스텀 타일셋 에셋 함께 패키징하여 공유
              </label>
              <p style={{ margin: '4px 0 0 24px', fontSize: '10px', color: '#aaa' }}>
                체크하면 타 유저가 맵을 다운로드할 때 커스텀 타일셋도 자동으로 소장하게 됩니다!
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                style={{ padding: '6px 12px', background: '#222233', border: '1px solid #4a4a6b', color: '#ccc', cursor: 'pointer', fontSize: '11px' }}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isPublishing}
                style={{ padding: '6px 16px', background: '#a78bfa', border: 'none', color: '#000', cursor: 'pointer', fontSize: '11px', fontWeight: 'normal' }}
              >
                {isPublishing ? '⏳ 등록 중...' : '🚀 마켓에 공개 게시'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
