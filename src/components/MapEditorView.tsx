import React, { useRef, useEffect, useState } from 'react';
import { type MapDefinition, maps } from '../game/MapData';
import { Trash2, Save, X, Undo, Redo, Pipette, Paintbrush, PaintBucket, Eraser, Info, Sparkles } from 'lucide-react';
import { getTileDrawInfo, getTilesetInfo } from '../game/CanvasGame';

import interiorTilesUrl from '../assets/interior_tiles.png';
import outdoorTilesUrl from '../assets/outdoor_tiles.png';
import villageTilesUrl from '../assets/village_tiles.png';
import wallTilesUrl from '../assets/wall_tiles.png';
import houseTilesUrl from '../assets/house_tiles.png';
import natureTilesUrl from '../assets/nature_tiles.png';
import waterTilesUrl from '../assets/water_tiles.png';
import fieldTilesUrl from '../assets/field_tiles.png';

interface MapEditorViewProps {
  activeMaps: Record<string, MapDefinition>;
  onSaveMap: (mapId: string, updatedMap: MapDefinition) => void;
  onClose: () => void;
}

const MAP_LABELS = [
  { id: 'room', name: '🏠 마이 룸' },
  { id: 'subway', name: '🚇 지하철역' },
  { id: 'park', name: '🌳 호수공원' },
  { id: 'apt', name: '🏢 아파트 단지' }
];

export const MapEditorView: React.FC<MapEditorViewProps> = ({
  activeMaps,
  onSaveMap,
  onClose
}) => {
  const [selectedMapId, setSelectedMapId] = useState<string>('room');
  const [editLayer, setEditLayer] = useState<'base' | 'decor' | 'collision'>('base');
  
  // Brush & Tools
  const [selectedTile, setSelectedTile] = useState<number>(1199);
  const [brushSize, setBrushSize] = useState<number>(1);
  const [tool, setTool] = useState<'brush' | 'bucket' | 'eyedropper'>('brush');
  const [autoCollision, setAutoCollision] = useState<boolean>(true);

  // Eyedropper Toast Notification
  const [pickedToast, setPickedToast] = useState<string | null>(null);
  const [isAltPressed, setIsAltPressed] = useState<boolean>(false);
  
  // View Settings & Zoom (0.5x to 4.0x)
  const [zoom, setZoom] = useState<number>(2); 
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showDecor, setShowDecor] = useState<boolean>(true);
  const [showCollision, setShowCollision] = useState<boolean>(true);
  
  // Hover cursor highlight
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);

  // Resizable Palette Width (280px to 850px) & Palette Scale (1.0x to 3.0x)
  const [paletteWidth, setPaletteWidth] = useState<number>(380);
  const [paletteZoom, setPaletteZoom] = useState<number>(2.0);
  const isResizingPalette = useRef<boolean>(false);

  // Map dimensions local input
  const [widthInput, setWidthInput] = useState<string>('40');
  const [heightInput, setHeightInput] = useState<string>('30');

  // Transactional Map States
  const [localMap, setLocalMap] = useState<MapDefinition>(activeMaps.room);
  const [originalMap, setOriginalMap] = useState<MapDefinition>(activeMaps.room);

  // Undo / Redo stacks
  const [history, setHistory] = useState<MapDefinition[]>([]);
  const [redoHistory, setRedoHistory] = useState<MapDefinition[]>([]);

  // Canvas painting state
  const isPainting = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeTileset, setActiveTileset] = useState<string>(localMap.tileset);

  const getTilesetInfoLocal = (ts: string) => {
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
      label: globalInfo.label
    };
  };

  const tilesetInfo = getTilesetInfoLocal(activeTileset);
  const tilesetUrl = tilesetInfo.url;
  const tilesetCols = tilesetInfo.cols;
  const tilesetRows = tilesetInfo.rows;

  // Keyboard Shortcuts: Alt (Eyedropper indicator), B (Brush), F (Fill), E (Eyedropper), X (Eraser)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setIsAltPressed(true);
      }
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'b') { setTool('brush'); }
      else if (k === 'f' && editLayer !== 'collision') { setTool('bucket'); }
      else if (k === 'e') { setTool('eyedropper'); }
      else if (k === 'x' && editLayer !== 'collision') { setSelectedTile(-1); }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setIsAltPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [editLayer]);

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
  useEffect(() => {
    const map = activeMaps[selectedMapId] || maps[selectedMapId];
    if (map) {
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
  }, [selectedMapId, activeMaps]);

  // Image preloader for tilesets
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

    const loaded: Record<string, HTMLImageElement> = {};
    let count = 0;
    const total = Object.keys(assetUrls).length;

    Object.entries(assetUrls).forEach(([k, url]) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        loaded[k] = img;
        count++;
        if (count === total) {
          setImages(loaded);
        }
      };
    });
  }, []);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !images.outdoor) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tileSize = 16 * zoom;
    canvas.width = localMap.width * tileSize;
    canvas.height = localMap.height * tileSize;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Base Floor Layer
    for (let y = 0; y < localMap.height; y++) {
      for (let x = 0; x < localMap.width; x++) {
        const idx = localMap.baseLayer[y][x];
        const drawInfo = getTileDrawInfo(idx, localMap.tileset);
        if (drawInfo) {
          const img = images[drawInfo.tilesetKey];
          if (img) {
            const tsInfo = getTilesetInfo(drawInfo.tilesetKey);
            const srcX = (drawInfo.localIdx % tsInfo.cols) * 16;
            const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * 16;
            ctx.drawImage(
              img,
              srcX, srcY, 16, 16,
              x * tileSize, y * tileSize, tileSize, tileSize
            );
          }
        }
      }
    }

    // 2. Decor Layer
    if (showDecor) {
      for (let y = 0; y < localMap.height; y++) {
        for (let x = 0; x < localMap.width; x++) {
          const idx = localMap.decorLayer[y][x];
          const drawInfo = getTileDrawInfo(idx, localMap.tileset);
          if (drawInfo) {
            const img = images[drawInfo.tilesetKey];
            if (img) {
              const tsInfo = getTilesetInfo(drawInfo.tilesetKey);
              const srcX = (drawInfo.localIdx % tsInfo.cols) * 16;
              const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * 16;
              ctx.drawImage(
                img,
                srcX, srcY, 16, 16,
                x * tileSize, y * tileSize, tileSize, tileSize
              );
            }
          }
        }
      }
    }

    // 3. Collision red borders
    if (showCollision) {
      ctx.fillStyle = 'rgba(243, 139, 168, 0.2)';
      ctx.strokeStyle = 'rgba(243, 139, 168, 0.6)';
      ctx.lineWidth = 1;
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

    // 5. Hover Cursor Tile Preview / Eyedropper Highlight
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
        // White Brush Highlight Box based on brushSize
        const half = Math.floor(brushSize / 2);
        const bx = Math.max(0, (hoverTile.x - half)) * tileSize;
        const by = Math.max(0, (hoverTile.y - half)) * tileSize;
        const bw = Math.min(localMap.width - hoverTile.x + half, brushSize) * tileSize;
        const bh = Math.min(localMap.height - hoverTile.y + half, brushSize) * tileSize;

        ctx.strokeStyle = '#f9e2af';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(249, 226, 175, 0.2)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
      }
      ctx.restore();
    }
  }, [images, localMap, zoom, showGrid, showDecor, showCollision, hoverTile, isAltPressed, tool, brushSize]);

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

  const handleSave = () => {
    onSaveMap(selectedMapId, localMap);
    setOriginalMap(localMap);
    alert('디자인 변경 사항이 성공적으로 저장되었습니다!');
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

  // 🧪 Eyedropper: Pick tile from clicked map coordinate
  const pickTileFromMap = (tx: number, ty: number) => {
    if (tx < 0 || tx >= localMap.width || ty < 0 || ty >= localMap.height) return;

    let pickedIdx = -1;
    if (editLayer === 'collision') {
      pickedIdx = localMap.collision[ty][tx] ? 1 : 0;
    } else if (editLayer === 'decor' && localMap.decorLayer[ty][tx] !== -1) {
      pickedIdx = localMap.decorLayer[ty][tx];
    } else {
      pickedIdx = localMap.baseLayer[ty][tx];
    }

    if (pickedIdx !== -1) {
      setSelectedTile(pickedIdx);

      // Auto-switch tileset palette to picked tile's category
      const info = getTileDrawInfo(pickedIdx, localMap.tileset);
      if (info && info.tilesetKey) {
        setActiveTileset(info.tilesetKey);
      }

      const tsInfo = info ? getTilesetInfoLocal(info.tilesetKey) : null;
      const label = tsInfo ? `${tsInfo.label} (ID: ${info?.localIdx})` : `타일 (ID: ${pickedIdx})`;

      setPickedToast(`🧪 스포이드 추출: ${label}`);
      setTimeout(() => setPickedToast(null), 2500);

      // Auto-return to brush tool for smooth painting workflow!
      setTool('brush');
    }
  };

  const performFloodFill = (startX: number, startY: number, fillVal: number) => {
    const currentLayer = editLayer;
    if (currentLayer === 'collision') return;
    
    const newBase = localMap.baseLayer.map(r => [...r]);
    const newDecor = localMap.decorLayer.map(r => [...r]);
    const newCollision = localMap.collision.map(r => [...r]);

    const targetGrid = currentLayer === 'base' ? newBase : newDecor;
    const originalVal = targetGrid[startY][startX];
    
    if (originalVal === fillVal) return;

    const w = localMap.width;
    const h = localMap.height;
    const queue: [number, number][] = [[startX, startY]];
    targetGrid[startY][startX] = fillVal;

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
          if (targetGrid[ny][nx] === originalVal) {
            targetGrid[ny][nx] = fillVal;
            if (currentLayer === 'decor' && autoCollision) {
              newCollision[ny][nx] = fillVal !== -1;
            }
            queue.push([nx, ny]);
          }
        }
      }
    }

    setLocalMap(prev => ({
      ...prev,
      baseLayer: newBase,
      decorLayer: newDecor,
      collision: newCollision
    }));
  };

  const handlePaint = (tx: number, ty: number) => {
    if (tx < 0 || tx >= localMap.width || ty < 0 || ty >= localMap.height) return;

    setLocalMap(prev => {
      const newBase = prev.baseLayer.map(r => [...r]);
      const newDecor = prev.decorLayer.map(r => [...r]);
      const newCollision = prev.collision.map(r => [...r]);

      const half = Math.floor(brushSize / 2);
      
      for (let dy = -half; dy <= (brushSize % 2 === 0 ? half - 1 : half); dy++) {
        for (let dx = -half; dx <= (brushSize % 2 === 0 ? half - 1 : half); dx++) {
          const ptx = tx + dx;
          const pty = ty + dy;

          if (ptx >= 0 && ptx < prev.width && pty >= 0 && pty < prev.height) {
            if (editLayer === 'base') {
              newBase[pty][ptx] = selectedTile;
            } else if (editLayer === 'decor') {
              newDecor[pty][ptx] = selectedTile;
              if (autoCollision) {
                newCollision[pty][ptx] = selectedTile !== -1;
              }
            } else if (editLayer === 'collision') {
              newCollision[pty][ptx] = selectedTile === 1;
            }
          }
        }
      }

      return {
        ...prev,
        baseLayer: newBase,
        decorLayer: newDecor,
        collision: newCollision
      };
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileSize = 16 * zoom;
    const tx = Math.floor(clickX / tileSize);
    const ty = Math.floor(clickY / tileSize);

    // 🧪 Eyedropper on Alt + Click OR Tool = eyedropper
    if (e.altKey || isAltPressed || tool === 'eyedropper') {
      pickTileFromMap(tx, ty);
      return;
    }

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    if (tool === 'bucket') {
      performFloodFill(tx, ty, selectedTile);
    } else {
      isPainting.current = true;
      handlePaint(tx, ty);
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

    setHoverTile({ x: tx, y: ty });

    if (!isPainting.current || (tool as string) !== 'brush' || e.altKey || isAltPressed) return;
    handlePaint(tx, ty);
  };

  const handleCanvasMouseLeave = () => {
    isPainting.current = false;
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

  // Map Resize Handler
  const handleResizeMap = () => {
    const newW = parseInt(widthInput, 10);
    const newH = parseInt(heightInput, 10);

    if (isNaN(newW) || isNaN(newH) || newW < 5 || newW > 100 || newH < 5 || newH > 100) {
      alert('지도 가로 및 세로 크기는 5에서 100 사이의 숫자로 입력해 주세요.');
      return;
    }

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    const newBase = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) =>
        y < localMap.height && x < localMap.width ? localMap.baseLayer[y][x] : (localMap.tileset === 'interior' ? 1199 : 2000)
      )
    );

    const newDecor = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) =>
        y < localMap.height && x < localMap.width ? localMap.decorLayer[y][x] : -1
      )
    );

    const newCollision = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) => {
        if (x === 0 || x === newW - 1 || y === 0 || y === newH - 1) return true;
        if (y < localMap.height && x < localMap.width) return localMap.collision[y][x];
        return false;
      })
    );

    const boundedSpawns = localMap.spawnPoints.map(p => ({
      x: Math.min(p.x, newW - 2),
      y: Math.min(p.y, newH - 2)
    }));

    const updated: MapDefinition = {
      ...localMap,
      width: newW,
      height: newH,
      baseLayer: newBase,
      decorLayer: newDecor,
      collision: newCollision,
      spawnPoints: boundedSpawns
    };

    setLocalMap(updated);
    alert(`지도 크기가 ${newW}x${newH}로 변경되었습니다! (저장을 눌러야 최종 반영됩니다)`);
  };

  const getSelectedTileDetails = () => {
    const drawInfo = getTileDrawInfo(selectedTile, localMap.tileset);
    if (!drawInfo) return { col: 0, row: 0, label: '지우개 🧽', url: '', cols: tilesetCols };
    const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
    return {
      col: drawInfo.localIdx % tsInfo.cols,
      row: Math.floor(drawInfo.localIdx / tsInfo.cols),
      label: `${tsInfo.label} (ID: ${drawInfo.localIdx})`,
      url: tsInfo.url,
      cols: tsInfo.cols
    };
  };

  const getPrefixedIndex = (localIdx: number, tilesetKey: string) => {
    if (localIdx === -1) return -1;
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

  const tileDetails = getSelectedTileDetails();

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: '#111116', zIndex: 140, display: 'flex', flexDirection: 'column',
      color: '#fff', fontFamily: 'var(--font-pixel)', userSelect: 'none'
    }}>
      {/* 1. Header Toolbar */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid var(--border-glass)',
        background: 'rgba(30, 30, 46, 0.95)', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', zIndex: 10
      }}>
        {/* Left Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
              borderRadius: '6px', color: '#fff', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px',
              cursor: 'pointer'
            }}
          >
            <X size={14} /> 취소
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '6px 14px', background: 'var(--primary)', border: '1px solid var(--primary-hover)',
              borderRadius: '6px', color: '#fff', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px',
              fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            <Save size={14} /> 저장하기
          </button>
        </div>

        {/* Center: Map Selection Tabs */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {MAP_LABELS.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                const hasChanges = JSON.stringify(localMap) !== JSON.stringify(originalMap);
                if (hasChanges) {
                  if (!window.confirm("저장하지 않은 변경사항이 있습니다. 다른 지도로 이동하시겠습니까?")) {
                    return;
                  }
                }
                setSelectedMapId(m.id);
              }}
              style={{
                padding: '6px 14px', fontSize: '11px', borderRadius: '6px',
                background: selectedMapId === m.id ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                color: selectedMapId === m.id ? 'var(--accent)' : '#fff', 
                border: selectedMapId === m.id ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                cursor: 'pointer'
              }}
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* Right Actions: Undo, Redo, Reset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            style={{
              padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)',
              borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px',
              cursor: history.length === 0 ? 'not-allowed' : 'pointer', opacity: history.length === 0 ? 0.3 : 1
            }}
            title="실행 취소 (Ctrl + Z)"
          >
            <Undo size={13} />
          </button>
          
          <button
            onClick={handleRedo}
            disabled={redoHistory.length === 0}
            style={{
              padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)',
              borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px',
              cursor: redoHistory.length === 0 ? 'not-allowed' : 'pointer', opacity: redoHistory.length === 0 ? 0.3 : 1
            }}
            title="다시 실행 (Ctrl + Y)"
          >
            <Redo size={13} />
          </button>

          <div style={{ width: '1px', height: '20px', background: 'var(--border-glass)', margin: '0 4px' }} />

          <button
            onClick={handleResetToDefault}
            style={{
              padding: '6px 12px', background: 'rgba(243, 139, 168, 0.1)', color: 'var(--danger)',
              border: '1px solid rgba(243, 139, 168, 0.25)', borderRadius: '6px', fontSize: '11px',
              display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer'
            }}
          >
            <Trash2 size={13} /> 기본 레이아웃 리셋
          </button>
        </div>
      </div>

      {/* 2. Main Editor Workspace (3-column layout) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Side: Map Properties Panel */}
        <div style={{
          width: '260px', borderRight: '1px solid var(--border-glass)',
          background: 'rgba(20, 20, 30, 0.5)', padding: '16px', display: 'flex',
          flexDirection: 'column', gap: '16px', overflowY: 'auto'
        }}>
          {/* Section 1: Map Size Config */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '12px', color: 'var(--accent)', margin: '0 0 6px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>
              📐 전체 지도 크기 수정
            </h4>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '4px' }}>가로 (너비)</div>
                <input
                  type="number"
                  value={widthInput}
                  onChange={(e) => setWidthInput(e.target.value)}
                  style={{
                    width: '100%', background: '#0a0a0f', border: '1px solid var(--border-glass)',
                    borderRadius: '4px', padding: '6px 10px', fontSize: '12px', color: '#fff', textAlign: 'center'
                  }}
                />
              </div>
              <span style={{ fontSize: '12px', marginTop: '16px', color: 'var(--text-muted)' }}>x</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '4px' }}>세로 (높이)</div>
                <input
                  type="number"
                  value={heightInput}
                  onChange={(e) => setHeightInput(e.target.value)}
                  style={{
                    width: '100%', background: '#0a0a0f', border: '1px solid var(--border-glass)',
                    borderRadius: '4px', padding: '6px 10px', fontSize: '12px', color: '#fff', textAlign: 'center'
                  }}
                />
              </div>
            </div>
            <button
              onClick={handleResizeMap}
              style={{
                width: '100%', padding: '8px', background: 'var(--primary)', color: '#fff',
                border: '1px solid var(--primary-hover)', borderRadius: '4px', fontSize: '11px',
                fontWeight: 'bold', cursor: 'pointer', marginTop: '4px'
              }}
            >
              크기 변경 적용
            </button>
          </div>

          {/* Section 2: Edit Layer Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <h4 style={{ fontSize: '12px', color: 'var(--accent)', margin: '0 0 6px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>
              🧱 편집 타겟 레이어
            </h4>
            {(['base', 'decor', 'collision'] as const).map((layer) => (
              <button
                key={layer}
                onClick={() => {
                  setEditLayer(layer);
                  if (layer === 'collision') setSelectedTile(1);
                  else if (selectedTile === 1 || selectedTile === 0 || selectedTile === -1) setSelectedTile(activeTileset === 'interior' ? 1199 : 2000);
                }}
                style={{
                  width: '100%', padding: '10px', fontSize: '11px', borderRadius: '4px',
                  background: editLayer === layer ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: editLayer === layer ? 'var(--accent)' : '#fff',
                  border: editLayer === layer ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                  textAlign: 'left', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                {layer === 'base' ? '🧱 1층 바닥 (Base)' : layer === 'decor' ? '🛋️ 2층 가구/장식 (Decor)' : '🚫 통행 장벽/벽 (Collision)'}
              </button>
            ))}
          </div>

          {/* Section 3: Draw Tools */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <h4 style={{ fontSize: '12px', color: 'var(--accent)', margin: '0 0 6px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>
              🖌️ 그리기 도구 설정
            </h4>
            
            {/* Tool Switcher Row */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => {
                  setTool('brush');
                  if (selectedTile === -1) setSelectedTile(activeTileset === 'interior' ? 1199 : 2000);
                }}
                style={{
                  flex: 1, padding: '8px 4px', fontSize: '10px', borderRadius: '4px',
                  background: tool === 'brush' && selectedTile !== -1 ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                  color: tool === 'brush' && selectedTile !== -1 ? 'var(--accent)' : '#fff',
                  border: tool === 'brush' && selectedTile !== -1 ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer'
                }}
                title="브러시 (단축키: B)"
              >
                <Paintbrush size={12} /> 브러시 (B)
              </button>

              <button
                onClick={() => setTool('bucket')}
                disabled={editLayer === 'collision'}
                style={{
                  flex: 1, padding: '8px 4px', fontSize: '10px', borderRadius: '4px',
                  background: tool === 'bucket' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                  color: tool === 'bucket' ? 'var(--accent)' : '#fff',
                  border: tool === 'bucket' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer',
                  opacity: editLayer === 'collision' ? 0.4 : 1
                }}
                title="채우기 (단축키: F)"
              >
                <PaintBucket size={12} /> 채우기 (F)
              </button>

              <button
                onClick={() => setTool('eyedropper')}
                style={{
                  flex: 1, padding: '8px 4px', fontSize: '10px', borderRadius: '4px',
                  background: tool === 'eyedropper' || isAltPressed ? 'rgba(137, 220, 235, 0.3)' : 'rgba(255,255,255,0.03)',
                  color: tool === 'eyedropper' || isAltPressed ? '#89dceb' : '#fff',
                  border: tool === 'eyedropper' || isAltPressed ? '1px solid #89dceb' : '1px solid var(--border-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer',
                  fontWeight: 'bold'
                }}
                title="스포이드 (단축키: Alt + 클릭 / E)"
              >
                <Pipette size={12} /> 스포이드
              </button>
            </div>

            {tool === 'brush' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>브러시 크기:</span>
                {([1, 2, 3, 4] as const).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setBrushSize(sz)}
                    style={{
                      flex: 1, padding: '4px', fontSize: '10px', borderRadius: '4px',
                      background: brushSize === sz ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                      color: brushSize === sz ? '#000' : '#fff', border: '1px solid var(--border-glass)',
                      fontWeight: 'bold', cursor: 'pointer'
                    }}
                  >
                    {sz}x{sz}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              {editLayer !== 'collision' ? (
                <>
                  <button
                    onClick={() => setSelectedTile(-1)}
                    style={{
                      width: '100%', padding: '8px', fontSize: '11px', borderRadius: '4px',
                      background: selectedTile === -1 ? 'var(--danger)' : 'rgba(255,255,255,0.03)',
                      color: '#fff', border: '1px solid var(--border-glass)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer'
                    }}
                    title="지우개 (단축키: X)"
                  >
                    <Eraser size={13} /> 지우개 모드 (X)
                  </button>

                  {editLayer === 'decor' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#ccc', cursor: 'pointer', marginTop: '6px' }}>
                      <input
                        type="checkbox"
                        checked={autoCollision}
                        onChange={(e) => setAutoCollision(e.target.checked)}
                      />
                      가구 배치 시 자동 충돌막 설정
                    </label>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                  <button
                    onClick={() => setSelectedTile(1)}
                    style={{
                      flex: 1, padding: '8px', fontSize: '11px', borderRadius: '4px',
                      background: selectedTile === 1 ? 'var(--danger)' : 'rgba(255,255,255,0.03)',
                      color: '#fff', border: '1px solid var(--border-glass)', cursor: 'pointer'
                    }}
                  >
                    🚫 충돌 벽 추가
                  </button>
                  <button
                    onClick={() => setSelectedTile(0)}
                    style={{
                      flex: 1, padding: '8px', fontSize: '11px', borderRadius: '4px',
                      background: selectedTile === 0 ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                      color: '#fff', border: '1px solid var(--border-glass)', cursor: 'pointer'
                    }}
                  >
                    🟢 충돌 제거
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Display View Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <h4 style={{ fontSize: '12px', color: 'var(--accent)', margin: '0 0 6px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>
              👁️ 화면 뷰 옵션
            </h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} /> 그리드 격자선 보이기
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showDecor} onChange={e => setShowDecor(e.target.checked)} /> 가구/장식 레이어 노출
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showCollision} onChange={e => setShowCollision(e.target.checked)} /> 벽/통행 경계선 노출 (분홍색)
            </label>
          </div>

          {/* Section 5: Handy Shortcuts Guide Panel */}
          <div style={{
            marginTop: 'auto', padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '6px', border: '1px solid var(--border-glass)', fontSize: '10px',
            color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px'
          }}>
            <div style={{ color: 'var(--accent)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
              <Info size={12} /> 단축키 팁 (Quick Keys)
            </div>
            <div>• <strong style={{ color: '#89dceb' }}>Alt + 클릭</strong>: 스포이드 (타일 추출)</div>
            <div>• <strong>B</strong>: 브러시 | <strong>F</strong>: 채우기 | <strong>E</strong>: 스포이드</div>
            <div>• <strong>X</strong>: 지우개 | <strong>Ctrl+Z / Y</strong>: 되돌리기</div>
            <div>• <strong>휠 스크롤</strong>: 맵 캔버스 Zoom</div>
          </div>
        </div>

        {/* Center: Canvas Viewport */}
        <div style={{
          flex: 1, background: '#0a0a0f', overflow: 'auto', display: 'flex',
          justifyContent: 'center', alignItems: 'center', position: 'relative', padding: '20px'
        }}>
          {/* Floating Zoom & Tool Bar over Viewport */}
          <div style={{
            position: 'absolute', top: '16px', left: '16px', zIndex: 12,
            background: 'rgba(20, 20, 30, 0.85)', padding: '6px 12px', borderRadius: '8px',
            border: '1px solid var(--border-glass)', display: 'flex', gap: '8px', alignItems: 'center',
            backdropFilter: 'blur(8px)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
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
                  fontWeight: 'bold', cursor: 'pointer'
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
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent)', minWidth: '40px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.min(4.0, parseFloat((prev + 0.25).toFixed(2))))}
              style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
            >+</button>
          </div>

          {/* 🧪 Eyedropper Toast Notification */}
          {pickedToast && (
            <div style={{
              position: 'absolute', top: '16px', right: '16px', zIndex: 12,
              background: 'rgba(137, 220, 235, 0.95)', color: '#11111b', padding: '8px 16px', borderRadius: '8px',
              fontWeight: 'bold', fontSize: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', gap: '6px', animation: 'fadeIn 0.2s ease-out'
            }}>
              <Sparkles size={14} /> {pickedToast}
            </div>
          )}

          {/* Canvas Wrapper */}
          <div style={{ position: 'relative', border: '1px solid #333', boxShadow: '0 8px 32px rgba(0,0,0,0.8)' }}>
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={() => isPainting.current = false}
              onMouseLeave={handleCanvasMouseLeave}
              onWheel={handleCanvasWheel}
              style={{
                display: 'block',
                cursor: (isAltPressed || (tool as string) === 'eyedropper') ? 'crosshair' : tool === 'bucket' ? 'cell' : selectedTile === -1 ? 'alias' : 'pointer'
              }}
            />
          </div>
        </div>

        {/* Resizable Divider Drag Handle */}
        <div
          onMouseDown={handlePaletteResizeStart}
          style={{
            width: '6px', background: 'rgba(255, 255, 255, 0.05)', cursor: 'col-resize',
            borderLeft: '1px solid var(--border-glass)', borderRight: '1px solid var(--border-glass)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'background 0.2s'
          }}
          title="좌우로 드래그하여 타일셋 창 크기를 조절하세요"
        >
          <div style={{ width: '2px', height: '24px', background: 'rgba(255, 255, 255, 0.3)', borderRadius: '1px' }} />
        </div>

        {/* Right Side: Tileset Palette & Selector Panel */}
        <div style={{
          width: `${paletteWidth}px`, borderLeft: '1px solid var(--border-glass)',
          background: 'rgba(20, 20, 30, 0.65)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          {/* Palette Control Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border-glass)',
            background: 'rgba(30, 30, 46, 0.9)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🎨 타일셋 브러시 ({paletteWidth}px)
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Palette Tile Zoom Scale */}
              <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>타일 크기:</span>
              {([1.5, 2.0, 2.6, 3.0] as const).map((pZoom) => (
                <button
                  key={pZoom}
                  onClick={() => setPaletteZoom(pZoom)}
                  style={{
                    padding: '2px 5px', fontSize: '9px', borderRadius: '3px',
                    background: paletteZoom === pZoom ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                    color: paletteZoom === pZoom ? '#000' : '#fff', border: '1px solid var(--border-glass)',
                    fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  {pZoom}x
                </button>
              ))}

              <div style={{ width: '1px', height: '12px', background: 'var(--border-glass)', margin: '0 2px' }} />

              {/* Palette Preset Widths */}
              {([320, 520, 750] as const).map((pw) => (
                <button
                  key={pw}
                  onClick={() => setPaletteWidth(pw)}
                  style={{
                    padding: '2px 5px', fontSize: '9px', borderRadius: '3px',
                    background: paletteWidth === pw ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                    color: '#fff', border: '1px solid var(--border-glass)', cursor: 'pointer'
                  }}
                >
                  {pw === 320 ? '보통' : pw === 520 ? '넓게' : '최대'}
                </button>
              ))}
            </div>
          </div>

          {/* Tileset Category Dropdown Selector */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-glass)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>타일셋 리스트들</div>
            <select
              value={activeTileset}
              onChange={(e) => setActiveTileset(e.target.value)}
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
            </select>
          </div>

          {/* Active Selected Tile Preview Box */}
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border-glass)',
            background: 'rgba(15, 15, 25, 0.6)', display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <div style={{
              width: '36px', height: '36px', border: '2px solid var(--accent)',
              borderRadius: '6px', background: '#000', display: 'flex', justifyContent: 'center',
              alignItems: 'center', overflow: 'hidden', imageRendering: 'pixelated'
            }}>
              {selectedTile !== -1 && tileDetails.url ? (
                <div style={{
                  width: '16px', height: '16px',
                  backgroundImage: `url(${tileDetails.url})`,
                  backgroundPosition: `-${tileDetails.col * 16}px -${tileDetails.row * 16}px`,
                  transform: 'scale(2.25)'
                }} />
              ) : (
                <span style={{ fontSize: '16px' }}>🧽</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>현재 선택된 타일</div>
              <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold', marginTop: '2px' }}>
                {tileDetails.label}
              </div>
            </div>
          </div>

          {/* Scrollable Visual Tileset Grid Sheet */}
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', background: '#0d0d12' }}>
            <div style={{
              position: 'relative', display: 'inline-block', border: '1px solid #333',
              background: '#000', imageRendering: 'pixelated'
            }}>
              <img
                src={tilesetUrl}
                alt="Tileset"
                style={{
                  display: 'block',
                  width: `${tilesetCols * 16 * paletteZoom}px`,
                  height: `${tilesetRows * 16 * paletteZoom}px`
                }}
              />
              
              {/* Clickable Overlay Grid Cells */}
              {Array.from({ length: tilesetRows }).map((_, r) => (
                <div key={r} style={{ display: 'flex' }}>
                  {Array.from({ length: tilesetCols }).map((_, c) => {
                    const localIdx = r * tilesetCols + c;
                    const prefixedIdx = getPrefixedIndex(localIdx, activeTileset);
                    const isSelected = selectedTile === prefixedIdx;
                    return (
                      <div
                        key={c}
                        onClick={() => setSelectedTile(prefixedIdx)}
                        title={`Tile ID: ${localIdx} (Row: ${r}, Col: ${c})`}
                        style={{
                          width: `${16 * paletteZoom}px`,
                          height: `${16 * paletteZoom}px`,
                          border: isSelected ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.05)',
                          background: isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
                          boxSizing: 'border-box', cursor: 'pointer', transition: 'border-color 0.1s'
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
    </div>
  );
};
