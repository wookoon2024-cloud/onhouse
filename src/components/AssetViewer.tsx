import React, { useState, useEffect, useRef } from 'react';
import {
  Layers, User, X, Sparkles, ZoomIn, Plus, Trash2, Upload, Download,
  Pin, Pencil, Eraser, Palette, Save, RotateCcw, Grid, Minus,
  Copy, Clipboard, Trash, Crop, Check, Move, FlipHorizontal, Loader2, Scissors,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';
import { DEFAULT_CHAR_ROW_ACTIONS, getCharRowActions } from '../game/MapData';
import { saveHouseAssetToDB, deleteHouseAssetFromDB, getSavedHouseCode, publishItemToMarket } from '../services/HouseService';
import { supabase } from '../lib/supabase';

class AssetViewerErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null, info: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error("🔥 [AssetViewer] React Rendering Crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#ff4444', background: '#111', height: '100vh', overflow: 'auto' }}>
          <h2>❌ AssetViewer Render Crash</h2>
          <p>{this.state.error?.toString()}</p>
          <pre style={{ fontSize: '11px', color: '#ccc', whiteSpace: 'pre-wrap' }}>{this.state.error?.stack}</pre>
          <pre style={{ fontSize: '11px', color: '#888', marginTop: '20px', whiteSpace: 'pre-wrap' }}>{this.state.info?.componentStack}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null, info: null })} style={{ marginTop: '20px', padding: '10px 20px', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            다시 시도 (Retry Render)
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


import interiorTilesUrl from '../assets/interior_tiles.png';
import outdoorTilesUrl from '../assets/outdoor_tiles.png';
import villageTilesUrl from '../assets/village_tiles.png';
import wallTilesUrl from '../assets/wall_tiles.png';
import houseTilesUrl from '../assets/house_tiles.png';
import natureTilesUrl from '../assets/nature_tiles.png';
import waterTilesUrl from '../assets/water_tiles.png';
import fieldTilesUrl from '../assets/field_tiles.png';

const safeLocalStorageSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[Storage Warning] LocalStorage quota limit reached for "${key}". Continuing in-memory & cloud DB save.`, err);
    return false;
  }
};

export type MainCategory = 'map' | 'character';

const GridOverlayCanvas = ({
  cols, rows, frameW, frameH, offX, offY, spacing, zoom, actualWidth, actualHeight, isChromaMode, onChromaClick
}: {
  cols: number; rows: number; frameW: number; frameH: number; offX: number; offY: number; spacing: number; zoom: number;
  actualWidth: number; actualHeight: number; isChromaMode?: boolean; onChromaClick?: (x: number, y: number) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set exact pixel dimensions to avoid blur
    canvas.width = actualWidth;
    canvas.height = actualHeight;
    ctx.clearRect(0, 0, actualWidth, actualHeight);

    ctx.strokeStyle = 'rgba(255, 121, 198, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = (offX + c * (frameW + spacing)) * zoom;
        const y = (offY + r * (frameH + spacing)) * zoom;
        const w = frameW * zoom;
        const h = frameH * zoom;
        
        // Highlight first tile (spawn/origin)
        if (c === 0 && r === 0) {
          ctx.fillStyle = 'rgba(255, 121, 198, 0.3)';
          ctx.fillRect(x, y, w, h);
          ctx.save();
          ctx.strokeStyle = '#ff79c6';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
        } else {
          ctx.rect(x, y, w, h);
        }
      }
    }
    ctx.stroke();
  }, [cols, rows, frameW, frameH, offX, offY, spacing, zoom, actualWidth, actualHeight]);

  return (
    <canvas 
      ref={canvasRef} 
      onClick={(e) => {
        if (isChromaMode && onChromaClick) {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / zoom;
          const y = (e.clientY - rect.top) / zoom;
          onChromaClick(x, y);
        }
      }}
      style={{ 
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
        pointerEvents: isChromaMode ? 'auto' : 'none', 
        imageRendering: 'pixelated',
        cursor: isChromaMode ? 'crosshair' : 'default'
      }} 
    />
  );
};

export interface TilesetOption {
  id: string;
  name: string;
  url: string;
  cols: number;
  rows: number;
  size: number;
  prefix?: number;
  isCustom?: boolean;
}

const DEFAULT_MAP_TILESETS: TilesetOption[] = [
  { id: 'interior', name: '🏠 실내 인테리어 (Interior)', url: interiorTilesUrl, cols: 22, rows: 17, size: 16, prefix: 1000 },
  { id: 'outdoor', name: '🌲 야외 / 타운 (Outdoor)', url: outdoorTilesUrl, cols: 22, rows: 26, size: 16, prefix: 2000 },
  { id: 'village', name: '🏡 마을 / 이웃 (Village)', url: villageTilesUrl, cols: 20, rows: 12, size: 16, prefix: 3000 },
  { id: 'wall', name: '🧱 건물 벽 / 울타리 (Wall)', url: wallTilesUrl, cols: 10, rows: 11, size: 16, prefix: 4000 },
  { id: 'house', name: '🏠 지붕 / 외벽 (House)', url: houseTilesUrl, cols: 33, rows: 23, size: 16, prefix: 5000 },
  { id: 'nature', name: '🌳 숲 / 자연 (Nature)', url: natureTilesUrl, cols: 24, rows: 21, size: 16, prefix: 6000 },
  { id: 'water', name: '🌊 호수 / 강물 (Water)', url: waterTilesUrl, cols: 28, rows: 17, size: 16, prefix: 7000 },
  { id: 'field', name: '🌾 들판 / 잔디 (Field)', url: fieldTilesUrl, cols: 5, rows: 15, size: 16, prefix: 8000 },
];

const PALETTE_COLORS = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
  '#ff00ff', '#00ffff', '#ff9900', '#995500', '#ffcc99', '#666666',
  '#333333', '#89b4fa', '#f5c2e7', 'transparent'
];

interface AssetViewerProps {
  onClose: () => void;
  onSelectTile?: (index: number) => void;
  dbCustomCharSprites?: TilesetOption[];
}

export const AssetViewer: React.FC<AssetViewerProps> = ({ onClose, onSelectTile, dbCustomCharSprites }) => {
  // Character tab active by default
  const [activeTab, setActiveTab] = useState<MainCategory>('character');
  
  // Custom uploaded options loaded from DB props / localStorage
  const [customMapTilesets, setCustomMapTilesets] = useState<TilesetOption[]>(() => {
    try {
      const saved = localStorage.getItem('on_house_custom_map_tilesets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customCharSprites, setCustomCharSprites] = useState<TilesetOption[]>(() => {
    if (dbCustomCharSprites && Array.isArray(dbCustomCharSprites)) {
      return dbCustomCharSprites;
    }
    try {
      const saved = localStorage.getItem('on_house_custom_char_sprites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Keep customCharSprites synced with DB props
  useEffect(() => {
    if (dbCustomCharSprites && Array.isArray(dbCustomCharSprites)) {
      console.log(`[AssetViewer Sync] 🔄 Syncing customCharSprites from DB props (${dbCustomCharSprites.length} items: ${dbCustomCharSprites.map(c => c.name || c.id).join(', ')})`);
      setCustomCharSprites(dbCustomCharSprites);
    }
  }, [dbCustomCharSprites]);

  // Custom asset uploading & DB sync loading state
  const [isSavingAsset, setIsSavingAsset] = useState<boolean>(false);
  const [saveProgressText, setSaveProgressText] = useState<string>('');

  // Sync custom assets from localStorage / Realtime updates
  useEffect(() => {
    const syncLocalAssets = () => {
      try {
        const savedMaps = localStorage.getItem('on_house_custom_map_tilesets');
        if (savedMaps) setCustomMapTilesets(prev => JSON.stringify(prev) === savedMaps ? prev : JSON.parse(savedMaps));
        
        const savedChars = localStorage.getItem('on_house_custom_char_sprites');
        if (savedChars) setCustomCharSprites(prev => JSON.stringify(prev) === savedChars ? prev : JSON.parse(savedChars));
        
        const savedOverrides = localStorage.getItem('on_house_char_image_overrides');
        if (savedOverrides) setCharImageOverrides(prev => JSON.stringify(prev) === savedOverrides ? prev : JSON.parse(savedOverrides));
        
        const savedActions = localStorage.getItem('on_house_char_row_actions');
        if (savedActions) setCharRowActions(prev => JSON.stringify(prev) === savedActions ? prev : JSON.parse(savedActions));
      } catch (e) {}
    };

    syncLocalAssets();

    window.addEventListener('storage', syncLocalAssets);
    window.addEventListener('on_house_sprites_updated', syncLocalAssets);
    return () => {
      window.removeEventListener('storage', syncLocalAssets);
      window.removeEventListener('on_house_sprites_updated', syncLocalAssets);
    };
  }, []);

  // Character Spritesheet Image Overrides (for drawn pixels or added/deleted rows/cols/size)
  const [charImageOverrides, setCharImageOverrides] = useState<Record<string, { url: string; rows: number; cols: number; size?: number; frameWidth?: number; frameHeight?: number; offsetX?: number; offsetY?: number; spacingX?: number; spacingY?: number }>>(() => {
    try {
      const saved = localStorage.getItem('on_house_char_image_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Character Action Names Mapping State
  const [charRowActions, setCharRowActions] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('on_house_char_row_actions');
      return saved ? JSON.parse(saved) : DEFAULT_CHAR_ROW_ACTIONS;
    } catch {
      return DEFAULT_CHAR_ROW_ACTIONS;
    }
  });

  const mapOptions = Array.from(
    new Map([...DEFAULT_MAP_TILESETS, ...customMapTilesets].map((m) => [m.id, m])).values()
  );
  const charOptions = Array.from(
    new Map(customCharSprites.map((c) => [c.id, c])).values()
  ).map((opt) => {
    const override = charImageOverrides[opt.id];
    if (override && override.url && typeof override.url === 'string' && override.url.trim().length > 10) {
      return {
        ...opt,
        url: override.url,
        rows: override.rows || opt.rows,
        cols: override.cols || opt.cols,
        size: override.size || opt.size || 16,
        frameWidth: override.frameWidth || opt.frameWidth,
        frameHeight: override.frameHeight || opt.frameHeight,
        offsetX: override.offsetX !== undefined ? override.offsetX : opt.offsetX,
        offsetY: override.offsetY !== undefined ? override.offsetY : opt.offsetY
      };
    }
    return opt;
  });

  const [selectedMapId, setSelectedMapId] = useState<string>('interior');
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [gridZoom, setGridZoom] = useState<number>(1.5);

  // Keep selectedCharId pointing at a real character whenever one exists. Without this, the
  // dropdown/board can visually show the first available character (currentOption falls back to
  // currentOptionList[0] for display) while selectedCharId itself stays '' — every save handler
  // that keys off selectedCharId then silently writes/reads under an empty id.
  useEffect(() => {
    if (customCharSprites.length === 0) return;
    if (!customCharSprites.some((c) => c.id === selectedCharId)) {
      setSelectedCharId(customCharSprites[0].id);
    }
  }, [customCharSprites, selectedCharId]);

  // Temporary string state for direct typing in 맵 출력 크기 input box
  const [sizeInputText, setSizeInputText] = useState<string | null>(null);

  const [hoveredTile, setHoveredTile] = useState<{ col: number; row: number; index: number; prefixedId?: number } | null>(null);
  const [selectedTileState, setSelectedTileState] = useState<{ col: number; row: number; index: number; prefixedId?: number } | null>(null);
  const [boardRenderKey, setBoardRenderKey] = useState<number>(0);

  // Right Click Context Menu & Copy/Paste Buffer State
  const [contextMenuTile, setContextMenuTile] = useState<{ x: number; y: number; col: number; row: number } | null>(null);
  const [copiedFrameBuffer, setCopiedFrameBuffer] = useState<string | null>(null);
  const [copiedFrameRes, setCopiedFrameRes] = useState<number>(16);

  // Drag and Drop Swap Frame State
  const [draggedTile, setDraggedTile] = useState<{ col: number; row: number } | null>(null);

  // Upload Modal State (Default to character category)
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadCategory, setUploadCategory] = useState<MainCategory>('character');
  const [assetNameInput, setAssetNameInput] = useState<string>('');
  const [tileSizeInput, setTileSizeInput] = useState<number>(16);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [originalFileDataUrl, setOriginalFileDataUrl] = useState<string | null>(null);
  const [isChromaMode, setIsChromaMode] = useState<boolean>(false);
  const [chromaTolerance, setChromaTolerance] = useState<number>(30);
  const [chromaColor, setChromaColor] = useState<{r: number, g: number, b: number} | null>(null);
  const [imgWidth, setImgWidth] = useState<number>(0);
  const [imgHeight, setImgHeight] = useState<number>(0);
  const [customColsInput, setCustomColsInput] = useState<number | ''>(4);
  const [customRowsInput, setCustomRowsInput] = useState<number | ''>(9);
  const [customMarginXInput, setCustomMarginXInput] = useState<number | ''>(0);
  const [customMarginYInput, setCustomMarginYInput] = useState<number | ''>(0);
  const [customSpacingInput, setCustomSpacingInput] = useState<number | ''>(0);
  const [customFrameWidthInput, setCustomFrameWidthInput] = useState<number | ''>(32);
  const [customFrameHeightInput, setCustomFrameHeightInput] = useState<number | ''>(32);
  const [customOffsetXInput, setCustomOffsetXInput] = useState<number | ''>(0);
  const [customOffsetYInput, setCustomOffsetYInput] = useState<number | ''>(0);
  const [isCustomFrameSize, setIsCustomFrameSize] = useState<boolean>(false);
  const [isNormalizing, setIsNormalizing] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(1.0); // 1.0 (Fit), 1.5x, 2.0x, 3.0x, 4.0x
  
  // Preview Panning State
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isSpaceDown, setIsSpaceDown] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollL: 0, scrollT: 0 });

  // Open Market Publish Modal State
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [publishTitle, setPublishTitle] = useState<string>('');
  const [publishDesc, setPublishDesc] = useState<string>('');
  const [publishCreator, setPublishCreator] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // Pixel Art Editor Modal State
  const [editingTile, setEditingTile] = useState<{ charId: string; col: number; row: number } | null>(null);
  const [editorGridResW, setEditorGridResW] = useState<number>(32);
  const [editorGridResH, setEditorGridResH] = useState<number>(32);
  const [editorZoom, setEditorZoom] = useState<number>(1.0); // Board zoom scale (1x, 1.5x, 2x, 3x, 4x)
  const [pixelGrid, setPixelGrid] = useState<string[][]>(Array.from({ length: 32 }, () => Array(32).fill('transparent')));
  const [selectedColor, setSelectedColor] = useState<string>('#ff0000');
  const [drawTool, setDrawTool] = useState<'pencil' | 'eraser'>('pencil');
  const [brushSize, setBrushSize] = useState<number>(1);
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [editorPan, setEditorPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isEditorPanning, setIsEditorPanning] = useState<boolean>(false);
  const editorPanStartRef = useRef<{ startX: number; startY: number; initPanX: number; initPanY: number } | null>(null);
  const editorFileInputRef = useRef<HTMLInputElement | null>(null);

  // Image Crop Modal State for Pixel Editor Import (With Drag, Zoom & Keyboard Nudge)
  const [cropModalImage, setCropModalImage] = useState<string | null>(null);
  const [cropImgWidth, setCropImgWidth] = useState<number>(0);
  const [cropImgHeight, setCropImgHeight] = useState<number>(0);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 16, h: 16 });
  const [cropZoom, setCropZoom] = useState<number>(1.0); // Zoom scale (0.5x, 1x, 2x, 3x, 4x)
  const [isBoxDragging, setIsBoxDragging] = useState<boolean>(false);
  const [boxDragStart, setBoxDragStart] = useState<{ startX: number; startY: number; initRectX: number; initRectY: number } | null>(null);
  const cropViewportRef = useRef<HTMLDivElement | null>(null);

  // New Action Row Prompt State
  const [showAddRowModal, setShowAddRowModal] = useState<boolean>(false);
  const [newActionNameInput, setNewActionNameInput] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setIsSpaceDown(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Persist custom assets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(customMapTilesets));
    } catch (e) {
      console.warn('Failed to save custom map tilesets', e);
    }
  }, [customMapTilesets]);

  useEffect(() => {
    try {
      localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(customCharSprites));
    } catch (e) {
      console.warn('Failed to save custom char sprites', e);
    }
  }, [customCharSprites]);

  const prevOverridesRef = useRef(charImageOverrides);
  useEffect(() => {
    try {
      localStorage.setItem('on_house_char_image_overrides', JSON.stringify(charImageOverrides));

      // Also update customCharSprites list in localStorage so custom sprites have the latest edited URL!
      setCustomCharSprites((prev) => {
        let changed = false;
        const next = prev.map((opt) => {
          const override = charImageOverrides[opt.id];
          if (override && (override.cols !== opt.cols || override.rows !== opt.rows)) {
            changed = true;
            return {
              ...opt,
              cols: override.cols || opt.cols,
              rows: override.rows || opt.rows
            };
          }
          return opt;
        });
        if (changed) {
          const lightweightList = next.map(({ url, ...meta }: any) => meta);
          safeLocalStorageSetItem('on_house_custom_char_sprites', JSON.stringify(lightweightList));
        }
        return changed ? next : prev;
      });

      // Save each override to Cloud DB & Broadcast to House Realtime channel!
      // Only save the items that actually changed to avoid DB request spam!
      const currentHouseCode = getSavedHouseCode();
      const prevOverrides = prevOverridesRef.current;
      
      Object.entries(charImageOverrides).forEach(([id, override]) => {
        if (!id) return; // No character selected — never persist a blank-id row.
        const prevOverride = prevOverrides[id];
        if (override && override.url && (!prevOverride || prevOverride.url !== override.url || prevOverride.cols !== override.cols || prevOverride.rows !== override.rows || prevOverride.size !== override.size)) {
          const foundOpt = customCharSprites.find((c) => c.id === id);
          const assetData = {
            id,
            name: foundOpt?.name || id,
            url: override.url,
            cols: override.cols || foundOpt?.cols || 4,
            rows: override.rows || foundOpt?.rows || 7,
            size: override.size || 32,
            isCustom: foundOpt?.isCustom || false
          };

          // Save to Supabase DB
          saveHouseAssetToDB(currentHouseCode, 'char_sprite', assetData);
          saveHouseAssetToDB(currentHouseCode, 'char_image_override', {
            id,
            url: override.url,
            cols: override.cols || foundOpt?.cols || 4,
            rows: override.rows || foundOpt?.rows || 7,
            size: override.size || 16
          });

          // Broadcast to Realtime channel
          try {
            supabase.channel(`house:${currentHouseCode}`).send({
              type: 'broadcast',
              event: 'asset_update',
              payload: {
                assetType: 'char_sprite',
                assetData
              }
            });
            supabase.channel(`house:${currentHouseCode}`).send({
              type: 'broadcast',
              event: 'asset_update',
              payload: {
                assetType: 'char_image_override',
                assetData: {
                  id,
                  url: override.url,
                  cols: override.cols || foundOpt?.cols || 4,
                  rows: override.rows || foundOpt?.rows || 7,
                  size: override.size || 16
                }
              }
            });
          } catch (e) {}
        }
      });

      prevOverridesRef.current = charImageOverrides;

      // Notify game canvas to reload sprites locally
      window.dispatchEvent(new Event('on_house_sprites_updated'));
    } catch (e) {
      console.warn('Failed to save char image overrides', e);
    }
  }, [charImageOverrides]);

  // Persist charRowActions to localStorage & Supabase Cloud DB
  const prevActionsRef = useRef(charRowActions);
  useEffect(() => {
    try {
      localStorage.setItem('on_house_char_row_actions', JSON.stringify(charRowActions));

      const currentHouseCode = getSavedHouseCode();
      const prevActions = prevActionsRef.current;
      
      Object.entries(charRowActions).forEach(([id, actions]) => {
        const prevActionList = prevActions[id];
        // Only save to DB if the actions list actually changed (or is new)
        if (actions && (!prevActionList || JSON.stringify(prevActionList) !== JSON.stringify(actions))) {
          const assetData = { id, actions };
          saveHouseAssetToDB(currentHouseCode, 'char_row_actions', assetData);
          try {
            supabase.channel(`house:${currentHouseCode}`).send({
              type: 'broadcast',
              event: 'asset_update',
              payload: {
                assetType: 'char_row_actions',
                assetData
              }
            });
          } catch (e) {}
        }
      });
      
      prevActionsRef.current = charRowActions;
    } catch (e) {}
  }, [charRowActions]);

  // Keyboard Arrow Keys Nudging for Crop Modal
  useEffect(() => {
    if (!cropModalImage) return;
    const handleCropKeyDown = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCropRect((prev) => ({ ...prev, x: Math.max(0, prev.x - step) }));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCropRect((prev) => ({ ...prev, x: Math.min(cropImgWidth - prev.w, prev.x + step) }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCropRect((prev) => ({ ...prev, y: Math.max(0, prev.y - step) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCropRect((prev) => ({ ...prev, y: Math.min(cropImgHeight - prev.h, prev.y + step) }));
      }
    };
    window.addEventListener('keydown', handleCropKeyDown);
    return () => window.removeEventListener('keydown', handleCropKeyDown);
  }, [cropModalImage, cropImgWidth, cropImgHeight]);

  // Auto-scroll crop viewport container so pink crop box is immediately visible without manual scrolling!
  useEffect(() => {
    if (!cropModalImage || !cropViewportRef.current) return;
    const timer = setTimeout(() => {
      if (!cropViewportRef.current) return;
      const targetY = cropRect.y * cropZoom;
      const targetX = cropRect.x * cropZoom;
      const containerH = cropViewportRef.current.clientHeight || 300;
      const containerW = cropViewportRef.current.clientWidth || 470;

      cropViewportRef.current.scrollTop = Math.max(0, targetY - containerH / 2 + (cropRect.w * cropZoom) / 2);
      cropViewportRef.current.scrollLeft = Math.max(0, targetX - containerW / 2 + (cropRect.w * cropZoom) / 2);
    }, 50);
    return () => clearTimeout(timer);
  }, [cropModalImage, cropRect.x, cropRect.y, cropZoom]);

  // Click outside listener for context menu
  useEffect(() => {
    const handleGlobalClick = () => setContextMenuTile(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const defaultFallbackOption: TilesetOption = {
    id: '',
    name: '(등록된 캐릭터 없음)',
    url: '',
    cols: 4,
    rows: 7,
    size: 32
  };

  const currentOptionList = activeTab === 'character' ? charOptions : mapOptions;
  const currentSelectedId = activeTab === 'character' ? selectedCharId : selectedMapId;
  const currentOption = (currentOptionList && currentOptionList.length > 0)
    ? (currentOptionList.find((opt) => opt.id === currentSelectedId) || currentOptionList[0])
    : defaultFallbackOption;

  const activeDisplayTile = selectedTileState || hoveredTile;

  const [spriteNaturalSize, setSpriteNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!currentOption?.url) return;
    const img = new Image();
    img.src = currentOption.url;
    img.onload = () => {
      setSpriteNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
  }, [currentOption?.url]);

  // Natural frame aspect ratio calculation (derived from custom frame size OR natural image size / grid)
  let effFrameW = currentOption?.frameWidth;
  let effFrameH = currentOption?.frameHeight;

  if ((!effFrameW || !effFrameH) && spriteNaturalSize && spriteNaturalSize.width > 0 && currentOption?.cols > 0) {
    effFrameW = Math.round(spriteNaturalSize.width / currentOption.cols);
    effFrameH = Math.round(spriteNaturalSize.height / currentOption.rows);
  }

  // Frame aspect ratio (height / width)
  const rawRatio = (effFrameW && effFrameH && effFrameW > 0) ? (effFrameH / effFrameW) : 1.0;
  const frameAspectRatio = (isNaN(rawRatio) || !isFinite(rawRatio) || rawRatio <= 0) ? 1.0 : rawRatio;

  // Base Cell Dimensions (Character tiles use 32px base width for clean editing view, preserving frame aspect ratio)
  const mapOutputW = activeTab === 'character' ? 32 : (currentOption?.size || 16);
  const mapOutputH = activeTab === 'character' ? Math.max(16, Math.round(32 * frameAspectRatio)) : (currentOption?.size || 16);

  const visualCellWidth = Math.max(1, Math.round(mapOutputW * gridZoom));
  const visualCellHeight = Math.max(1, Math.round(mapOutputH * gridZoom));

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const col = Math.floor(x / visualCellWidth);
    const row = Math.floor(y / visualCellHeight);

    if (col >= 0 && col < currentOption.cols && row >= 0 && row < currentOption.rows) {
      const index = row * currentOption.cols + col;
      const prefixedId = currentOption.prefix ? currentOption.prefix + index : undefined;
      setHoveredTile({ col, row, index, prefixedId });
    } else {
      setHoveredTile(null);
    }
  };

  // Right-Click Context Menu Trigger
  const handleTileContextMenu = (e: React.MouseEvent, col: number, row: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTileState({ col, row, index: row * currentOption.cols + col });
    setContextMenuTile({
      x: e.clientX,
      y: e.clientY,
      col,
      row
    });
  };

  // 📋 Copy Frame to Clipboard Buffer
  const handleCopyFrame = (col: number, row: number) => {
    if (!currentSelectedId) {
      setToastMessage('⚠️ 선택된 캐릭터가 없습니다.');
      return;
    }
    const srcResKey = `on_house_char_frame_res_${currentSelectedId}_${row}_${col}`;
    const savedRes = localStorage.getItem(srcResKey);
    const srcRes = savedRes ? parseInt(savedRes, 10) : (currentOption.size || 16);
    setCopiedFrameRes(srcRes);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tileW = Math.max(16, Math.floor(img.width / currentOption.cols));
      const tileH = Math.max(16, Math.floor(img.height / currentOption.rows));
      const canvas = document.createElement('canvas');
      canvas.width = tileW;
      canvas.height = tileH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setToastMessage('⚠️ 프레임 복사에 실패했습니다 (캔버스 오류).');
        return;
      }

      ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH, 0, 0, tileW, tileH);
      setCopiedFrameBuffer(canvas.toDataURL());
      setContextMenuTile(null);
      setToastMessage('📋 선택한 프레임이 복사되었습니다! (Ctrl+V로 붙여넣기)');
    };
    img.onerror = () => {
      setToastMessage('⚠️ 프레임 복사에 실패했습니다 (이미지 로딩 오류).');
    };
    img.src = currentOption.url;
  };

  // ✂️ Cut Frame (Copy to Clipboard Buffer & Clear Frame Cell)
  const handleCutFrame = (col: number, row: number) => {
    handleCopyFrame(col, row);
    setTimeout(() => {
      handleDeleteFrameColumn(col, row);
    }, 50);
  };

  // 📥 Paste Copied Frame Buffer onto Target Frame
  const handlePasteFrame = (col: number, row: number) => {
    if (!copiedFrameBuffer) return;
    if (!currentSelectedId) {
      setToastMessage('⚠️ 선택된 캐릭터가 없습니다.');
      return;
    }

    // Persist destination frame resolution to match copied source frame resolution!
    const dstResKey = `on_house_char_frame_res_${currentSelectedId}_${row}_${col}`;
    localStorage.setItem(dstResKey, copiedFrameRes.toString());

    const mainImg = new Image();
    mainImg.crossOrigin = 'anonymous';
    mainImg.onload = () => {
      const tileW = Math.max(16, Math.floor(mainImg.width / currentOption.cols));
      const tileH = Math.max(16, Math.floor(mainImg.height / currentOption.rows));
      const patchImg = new Image();
      patchImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = mainImg.width;
        canvas.height = mainImg.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setToastMessage('⚠️ 붙여넣기에 실패했습니다 (캔버스 오류).');
          return;
        }

        ctx.drawImage(mainImg, 0, 0);
        ctx.clearRect(col * tileW, row * tileH, tileW, tileH);
        ctx.drawImage(patchImg, 0, 0, patchImg.width, patchImg.height, col * tileW, row * tileH, tileW, tileH);

        const updatedUrl = canvas.toDataURL();
        setCharImageOverrides((prev) => ({
          ...prev,
          [currentSelectedId]: {
            url: updatedUrl,
            rows: currentOption.rows,
            cols: currentOption.cols,
            size: currentOption.size || 32,
            frameWidth: currentOption.frameWidth,
            frameHeight: currentOption.frameHeight
          }
        }));
        setContextMenuTile(null);
        setToastMessage('📥 프레임이 붙여넣기 되었습니다!');
      };
      patchImg.onerror = () => {
        setToastMessage('⚠️ 붙여넣기에 실패했습니다 (복사된 이미지 로딩 오류).');
      };
      patchImg.src = copiedFrameBuffer;
    };
    mainImg.onerror = () => {
      setToastMessage('⚠️ 붙여넣기에 실패했습니다 (대상 캐릭터 이미지 로딩 오류).');
    };
    mainImg.src = currentOption.url;
  };

  // 🗑️ Delete/Clear Frame Cell (`col`, `row`)
  // Rule: Clear target cell (col, row). Only shrink `cols` count if target column `col` AND all columns after `col` (c >= col) are completely empty across ALL rows!
  const handleDeleteFrameColumn = (col: number, row: number) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const oldCols = currentOption.cols;
      const rows = currentOption.rows;
      const tileW = Math.max(16, Math.floor(img.width / oldCols));
      const tileH = Math.max(16, Math.floor(img.height / rows));

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // 1. Draw current full sprite sheet
      ctx.drawImage(img, 0, 0);

      // 2. Clear target cell (col, row) -> make it transparent
      ctx.clearRect(col * tileW, row * tileH, tileW, tileH);

      // Helper: Check if column `c` is completely empty across ALL rows
      const isColumnEmpty = (c: number): boolean => {
        if (c < 0 || c >= oldCols) return true;
        const colData = ctx.getImageData(c * tileW, 0, tileW, img.height).data;
        for (let i = 3; i < colData.length; i += 4) {
          if (colData[i] > 10) return false; // Non-transparent pixel found
        }
        return true;
      };

      // 3. Check if target column `col` AND ALL columns after `col` (c >= col) are empty across ALL rows
      let canTrimFromCol = true;
      for (let c = col; c < oldCols; c++) {
        if (!isColumnEmpty(c)) {
          canTrimFromCol = false;
          break;
        }
      }

      let newCols = oldCols;
      if (canTrimFromCol && oldCols > 1) {
        let lastNonEmptyCol = -1;
        for (let c = col - 1; c >= 0; c--) {
          if (!isColumnEmpty(c)) {
            lastNonEmptyCol = c;
            break;
          }
        }
        newCols = Math.max(1, lastNonEmptyCol + 1);
      }

      // Crop width if column count decreased
      let finalCanvas = canvas;
      if (newCols !== oldCols) {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = newCols * tileW;
        cropCanvas.height = img.height;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.imageSmoothingEnabled = false;
          cropCtx.drawImage(canvas, 0, 0, cropCanvas.width, cropCanvas.height, 0, 0, cropCanvas.width, cropCanvas.height);
          finalCanvas = cropCanvas;
        }
      }

      const updatedUrl = finalCanvas.toDataURL();

      // Check if after clearing, that action row has no frames left anywhere
      const finalCtx = finalCanvas.getContext('2d');
      let rowIsEmpty = true;
      if (finalCtx) {
        const rowData = finalCtx.getImageData(0, row * tileH, finalCanvas.width, tileH).data;
        for (let i = 3; i < rowData.length; i += 4) {
          if (rowData[i] > 10) {
            rowIsEmpty = false;
            break;
          }
        }
      }

      setContextMenuTile(null);

      // If the row became completely empty and multiple rows exist, delete action row
      if (rowIsEmpty && rows > 1) {
        handleDeleteActionRow(row);
        return;
      }

      // Save updated sprite sheet
      setCharImageOverrides((prev) => ({
        ...prev,
        [currentSelectedId]: {
          url: updatedUrl,
          rows: currentOption.rows,
          cols: newCols,
          size: currentOption.size || 32,
          frameWidth: currentOption.frameWidth,
          frameHeight: currentOption.frameHeight
        }
      }));
    };
    img.src = currentOption.url;
  };

  // Toast feedback message state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2200);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // ⌨️ Keyboard Shortcuts & Grid Arrow Navigation Listener
  useEffect(() => {
    if (activeTab !== 'character' || !currentOption) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if typing in form inputs
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      const cols = currentOption.cols;
      const rows = currentOption.rows;

      const current = selectedTileState || { col: 0, row: 0, index: 0 };
      let newCol = current.col;
      let newRow = current.row;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const keyLower = e.key ? e.key.toLowerCase() : '';
      const code = e.code || '';

      // 1. Ctrl+C : Copy Frame (Supports both English KeyC and Korean ㅊ layout!)
      if (isCtrlOrCmd && (code === 'KeyC' || keyLower === 'c' || e.key === 'ㅊ')) {
        e.preventDefault();
        handleCopyFrame(current.col, current.row);
        return;
      }

      // 2. Ctrl+X : Cut Frame (Supports both English KeyX and Korean ㅌ layout!)
      if (isCtrlOrCmd && (code === 'KeyX' || keyLower === 'x' || e.key === 'ㅌ')) {
        e.preventDefault();
        handleCutFrame(current.col, current.row);
        setToastMessage("✂️ 선택한 프레임이 잘라내기 되었습니다!");
        return;
      }

      // 3. Ctrl+V : Paste Frame (Supports both English KeyV and Korean ㅍ layout!)
      if (isCtrlOrCmd && (code === 'KeyV' || keyLower === 'v' || e.key === 'ㅍ')) {
        e.preventDefault();
        if (copiedFrameBuffer) {
          handlePasteFrame(current.col, current.row);
        } else {
          setToastMessage("⚠️ 복사된 프레임이 없습니다. 먼저 Ctrl+C로 복사해 주세요!");
        }
        return;
      }

      // 4. Delete / Backspace : Delete Frame Cell
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteFrameColumn(current.col, current.row);
        setToastMessage("🗑️ 선택한 프레임이 삭제되었습니다.");
        return;
      }

      // 5. Arrow Keys : Navigate Pink Highlight Selection Box
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        newCol = Math.max(0, current.col - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        newCol = Math.min(cols - 1, current.col + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        newRow = Math.max(0, current.row - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        newRow = Math.min(rows - 1, current.row + 1);
      } else {
        return;
      }

      setSelectedTileState({
        col: newCol,
        row: newRow,
        index: newRow * cols + newCol
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, currentOption, selectedTileState, copiedFrameBuffer, copiedFrameRes]);

  // Drag & Drop Frame Swap Handler
  const handleDropTile = (e: React.DragEvent, dstCol: number, dstRow: number) => {
    e.preventDefault();
    if (!draggedTile) return;
    const { col: srcCol, row: srcRow } = draggedTile;
    if (srcCol === dstCol && srcRow === dstRow) return;

    // Swap resolution preferences in localStorage
    const srcResKey = `on_house_char_frame_res_${currentSelectedId}_${srcRow}_${srcCol}`;
    const dstResKey = `on_house_char_frame_res_${currentSelectedId}_${dstRow}_${dstCol}`;
    const srcRes = localStorage.getItem(srcResKey);
    const dstRes = localStorage.getItem(dstResKey);

    if (dstRes) localStorage.setItem(srcResKey, dstRes);
    else localStorage.removeItem(srcResKey);

    if (srcRes) localStorage.setItem(dstResKey, srcRes);
    else localStorage.removeItem(dstResKey);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cols = currentOption.cols;
      const rows = currentOption.rows;
      const tileW = Math.max(16, Math.floor(img.width / cols));
      const tileH = Math.max(16, Math.floor(img.height / rows));

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw full original image
      ctx.drawImage(img, 0, 0);

      // Crop source tile
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = tileW;
      srcCanvas.height = tileH;
      const srcCtx = srcCanvas.getContext('2d');
      if (srcCtx) srcCtx.drawImage(img, srcCol * tileW, srcRow * tileH, tileW, tileH, 0, 0, tileW, tileH);

      // Crop destination tile
      const dstCanvas = document.createElement('canvas');
      dstCanvas.width = tileW;
      dstCanvas.height = tileH;
      const dstCtx = dstCanvas.getContext('2d');
      if (dstCtx) dstCtx.drawImage(img, dstCol * tileW, dstRow * tileH, tileW, tileH, 0, 0, tileW, tileH);

      // Clear both slots
      ctx.clearRect(srcCol * tileW, srcRow * tileH, tileW, tileH);
      ctx.clearRect(dstCol * tileW, dstRow * tileH, tileW, tileH);

      // Swap draw
      ctx.drawImage(srcCanvas, dstCol * tileW, dstRow * tileH);
      ctx.drawImage(dstCanvas, srcCol * tileW, srcRow * tileH);

      const updatedUrl = canvas.toDataURL();
      setCharImageOverrides((prev) => ({
        ...prev,
        [currentSelectedId]: {
          url: updatedUrl,
          rows,
          cols,
          size: currentOption.size || 32,
          frameWidth: currentOption.frameWidth,
          frameHeight: currentOption.frameHeight
        }
      }));

      setSelectedTileState({ col: dstCol, row: dstRow, index: dstRow * cols + dstCol });
      setDraggedTile(null);
    };
    img.src = currentOption.url;
  };

  // Helper to convert any image URL (relative asset, remote URL, or blob) to clean data URL to avoid Tainted Canvas SecurityError
  const loadImageAsCleanDataUrl = async (url: string): Promise<string> => {
    if (!url) return '';
    if (url.startsWith('data:image/')) return url;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string) || url);
        reader.onerror = () => resolve(url);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return url;
    }
  };

  // Helper to load/resample pixel grid at resolution (resW, resH)
  const loadPixelGridForRes = async (resW: number, resH: number, col: number, row: number, imageUrl: string) => {
    try {
      const cleanUrl = await loadImageAsCleanDataUrl(imageUrl);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      let isLoaded = false;
      const processGrid = () => {
        if (isLoaded) return;
        isLoaded = true;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = resW;
          canvas.height = resH;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.clearRect(0, 0, resW, resH);

          const cols = currentOption?.cols || 4;
          const rows = currentOption?.rows || 7;

          const naturalW = img.naturalWidth || img.width || (cols * resW);
          const naturalH = img.naturalHeight || img.height || (rows * resH);

          const tileW = Math.max(1, Math.floor(naturalW / cols));
          const tileH = Math.max(1, Math.floor(naturalH / rows));

          const curOverride = charImageOverrides[currentSelectedId];
          const hasOverride = !!(curOverride && curOverride.url);

          const offX = hasOverride ? (col * tileW) : ((currentOption?.offsetX || 0) + col * (tileW + (currentOption?.spacingX || 0)));
          const offY = hasOverride ? (row * tileH) : ((currentOption?.offsetY || 0) + row * (tileH + (currentOption?.spacingY || 0)));

          ctx.drawImage(
            img,
            offX, offY, tileW, tileH,
            0, 0, resW, resH
          );

          const imgData = ctx.getImageData(0, 0, resW, resH);
          const grid: string[][] = Array.from({ length: resH }, () => Array(resW).fill('transparent'));

          for (let y = 0; y < resH; y++) {
            for (let x = 0; x < resW; x++) {
              const idx = (y * resW + x) * 4;
              const r = imgData.data[idx];
              const g = imgData.data[idx + 1];
              const b = imgData.data[idx + 2];
              const a = imgData.data[idx + 3];

              if (a > 5) {
                const hexR = r.toString(16).padStart(2, '0');
                const hexG = g.toString(16).padStart(2, '0');
                const hexB = b.toString(16).padStart(2, '0');
                grid[y][x] = `#${hexR}${hexG}${hexB}`;
              } else {
                grid[y][x] = 'transparent';
              }
            }
          }

          setPixelGrid(grid);
        } catch (err) {
          console.error('Error sampling pixel grid:', err);
        }
      };

      img.onload = processGrid;
      img.onerror = () => {
        console.warn('Image failed to load in loadPixelGridForRes');
      };
      img.src = cleanUrl;

      // Data URLs complete synchronously in browser memory!
      if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
        processGrid();
      }
    } catch (e) {
      console.warn('Failed to load pixel grid:', e);
    }
  };

  // Open Pixel Editor for a frame - restores saved grid resolution for this frame!
  const handleOpenPixelEditor = (col: number, row: number) => {
    const frameResKey = `on_house_char_frame_res_${currentSelectedId}_${row}_${col}`;
    const savedRes = localStorage.getItem(frameResKey);

    let defaultW = effFrameW || currentOption.frameWidth || currentOption.size || 32;
    let defaultH = effFrameH || currentOption.frameHeight || currentOption.size || 32;

    if (savedRes && savedRes.includes('x')) {
      const parts = savedRes.split('x');
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (!isNaN(w) && !isNaN(h)) {
        defaultW = w;
        defaultH = h;
      }
    } else if (savedRes) {
      const sq = parseInt(savedRes, 10);
      if (!isNaN(sq)) {
        defaultW = sq;
        defaultH = sq;
      }
    }

    setEditorGridResW(defaultW);
    setEditorGridResH(defaultH);
    setEditorPan({ x: 0, y: 0 });
    loadPixelGridForRes(defaultW, defaultH, col, row, currentOption.url);
    setEditingTile({ charId: currentSelectedId, col, row });
  };

  // Switch Resolution in Pixel Editor & persist!
  const handleChangeGridRes = (newW: number, newH: number) => {
    if (!editingTile) return;
    setEditorGridResW(newW);
    setEditorGridResH(newH);

    const frameResKey = `on_house_char_frame_res_${editingTile.charId}_${editingTile.row}_${editingTile.col}`;
    localStorage.setItem(frameResKey, `${newW}x${newH}`);

    loadPixelGridForRes(newW, newH, editingTile.col, editingTile.row, currentOption.url);
  };

  // Step 1: Select image file -> Open Interactive Image Crop Modal (Default centered crop box matching active grid res!)
  const handleImportImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const file = target.files?.[0];
    if (!file) return;

    console.log(`[PixelEditor Import] 1/4 📁 File selected: name="${file.name}", size=${file.size} bytes, type="${file.type}"`);

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = (ev) => resolve((ev.target?.result as string) || '');
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      if (!dataUrl) {
        console.warn('[PixelEditor Import] ⚠️ Empty dataUrl returned from FileReader');
        return;
      }

      console.log(`[PixelEditor Import] 2/4 🖼️ FileReader dataUrl generated (len: ${dataUrl.length}). Loading HTMLImageElement...`);

      const img = await loadLoadedImageElement(dataUrl);
      const w = Math.max(1, img.naturalWidth || img.width || 32);
      const h = Math.max(1, img.naturalHeight || img.height || 32);

      console.log(`[PixelEditor Import] 3/4 📐 Image element loaded successfully. Dimensions: ${w}x${h}px (Editor grid res: ${editorGridResW}x${editorGridResH})`);

      setCropImgWidth(w);
      setCropImgHeight(h);

      const defaultSize = Math.max(1, Math.min(w, h, editorGridResW || 32));
      const centerX = Math.max(0, Math.floor((w - defaultSize) / 2));
      const centerY = Math.max(0, Math.floor((h - defaultSize) / 2));

      setCropRect({
        x: centerX,
        y: centerY,
        w: defaultSize,
        h: defaultSize
      });
      setCropZoom(1.0);
      setCropModalImage(dataUrl);

      console.log(`[PixelEditor Import] 4/4 ✂️ Crop Modal opened successfully with initial crop rect:`, { x: centerX, y: centerY, w: defaultSize, h: defaultSize });
    } catch (err) {
      console.error('[PixelEditor Import] ❌ Failed to import image file:', err);
      alert('이미지 파일 로드 중 오류가 발생했습니다: ' + (err as any)?.message);
    } finally {
      if (target) target.value = '';
    }
  };

  // Drag selection box handler over the image
  const handleCropBoxMouseMove = (e: React.MouseEvent) => {
    if (!isBoxDragging || !boxDragStart) return;
    const deltaX = Math.round((e.clientX - boxDragStart.startX) / cropZoom);
    const deltaY = Math.round((e.clientY - boxDragStart.startY) / cropZoom);

    const newX = Math.max(0, Math.min(cropImgWidth - cropRect.w, boxDragStart.initRectX + deltaX));
    const newY = Math.max(0, Math.min(cropImgHeight - cropRect.h, boxDragStart.initRectY + deltaY));

    setCropRect((prev) => ({ ...prev, x: newX, y: newY }));
  };

  // Click on image preview container to jump center of selection box
  const handleCropContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isBoxDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.round((e.clientX - rect.left) / cropZoom);
    const clickY = Math.round((e.clientY - rect.top) / cropZoom);

    const newX = Math.max(0, Math.min(cropImgWidth - cropRect.w, clickX - Math.floor(cropRect.w / 2)));
    const newY = Math.max(0, Math.min(cropImgHeight - cropRect.h, clickY - Math.floor(cropRect.h / 2)));

    setCropRect((prev) => ({ ...prev, x: newX, y: newY }));
  };

  // Step 2: Confirm Crop -> Replace current pixelGrid with cropped frame region
  const handleConfirmCropImport = async () => {
    if (!cropModalImage) return;

    console.log(`[PixelEditor Import] ✂️ Confirming crop for rect:`, cropRect, `Target grid res: ${editorGridResW}x${editorGridResH}`);

    try {
      const img = await loadLoadedImageElement(cropModalImage);
      const resW = editorGridResW || 32;
      const resH = editorGridResH || 32;

      const canvas = document.createElement('canvas');
      canvas.width = resW;
      canvas.height = resH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, resW, resH);
      ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, resW, resH);

      const imgData = ctx.getImageData(0, 0, resW, resH);
      const grid: string[][] = Array.from({ length: resH }, () => Array(resW).fill('transparent'));

      for (let y = 0; y < resH; y++) {
        for (let x = 0; x < resW; x++) {
          const idx = (y * resW + x) * 4;
          const r = imgData.data[idx];
          const g = imgData.data[idx + 1];
          const b = imgData.data[idx + 2];
          const a = imgData.data[idx + 3];

          if (a > 10) {
            const hexR = r.toString(16).padStart(2, '0');
            const hexG = g.toString(16).padStart(2, '0');
            const hexB = b.toString(16).padStart(2, '0');
            grid[y][x] = `#${hexR}${hexG}${hexB}`;
          } else {
            grid[y][x] = 'transparent';
          }
        }
      }

      setPixelGrid(grid);
      setCropModalImage(null);
      setToastMessage('✂️ 선택 영역 도트 크롭 불러오기가 완료되었습니다!');
      console.log(`[PixelEditor Import] ✅ Cropped image successfully transferred to pixel grid board (${resW}x${resH})`);
    } catch (err) {
      console.error('[PixelEditor Import] ❌ Failed to confirm crop import:', err);
      alert('크롭 이미지 반영 중 오류가 발생했습니다: ' + (err as any)?.message);
    }
  };

  // Save painted frame back onto spritesheet canvas with exact chosen resolution!
  const handleSavePixelEditor = async () => {
    if (!editingTile) return;
    const { charId, col, row } = editingTile;
    const resW = editorGridResW;
    const resH = editorGridResH;

    console.log(`[PixelEditor 1/6] 💾 handleSavePixelEditor initiated for charId: "${charId}", frame: (col ${col}, row ${row}), resolution: ${resW}x${resH}`);

    // Save frame resolution preference
    const frameResKey = `on_house_char_frame_res_${charId}_${row}_${col}`;
    localStorage.setItem(frameResKey, `${resW}x${resH}`);

    try {
      const cleanUrl = await loadImageAsCleanDataUrl(currentOption.url);
      console.log(`[PixelEditor 2/6] 🖼️ Loaded clean URL for sampling (length: ${cleanUrl.length})`);

      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve) => {
        let done = false;
        const complete = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        img.onload = complete;
        img.onerror = complete;
        img.src = cleanUrl;
        if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
          complete();
        }
        setTimeout(complete, 400);
      });

      const cols = currentOption.cols || 4;
      const rows = currentOption.rows || 7;

      const canvas = document.createElement('canvas');
      canvas.width = cols * resW;
      canvas.height = rows * resH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.imageSmoothingEnabled = false;

      const tileW = Math.max(1, Math.floor((img.naturalWidth || img.width || (cols * resW)) / cols));
      const tileH = Math.max(1, Math.floor((img.naturalHeight || img.height || (rows * resH)) / rows));

      const curOverride = charImageOverrides[charId];
      const hasOverride = !!(curOverride && curOverride.url);

      console.log(`[PixelEditor 3/6] 🎨 Sampling source sheet (natural: ${img.naturalWidth}x${img.naturalHeight}, tileW: ${tileW}, tileH: ${tileH}, hasOverride: ${hasOverride})`);

      // Resample existing tiles to new frame dimensions (resW x resH) with original offset calculation
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const srcOffX = hasOverride ? (c * tileW) : ((currentOption?.offsetX || 0) + c * (tileW + (currentOption?.spacingX || 0)));
          const srcOffY = hasOverride ? (r * tileH) : ((currentOption?.offsetY || 0) + r * (tileH + (currentOption?.spacingY || 0)));
          ctx.drawImage(
            img,
            srcOffX, srcOffY, tileW, tileH,
            c * resW, r * resH, resW, resH
          );
        }
      }

      // Clear specified (col, row) tile region
      ctx.clearRect(col * resW, row * resH, resW, resH);

      // Render pixelGrid (resH x resW) onto temp canvas then draw 1:1 crisp to main canvas frame slot
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = resW;
      tempCanvas.height = resH;
      const tempCtx = tempCanvas.getContext('2d');
      let nonTransparentPixelsCount = 0;
      if (tempCtx) {
        tempCtx.imageSmoothingEnabled = false;
        for (let y = 0; y < resH; y++) {
          for (let x = 0; x < resW; x++) {
            const color = pixelGrid[y]?.[x];
            if (color && color !== 'transparent') {
              tempCtx.fillStyle = color;
              tempCtx.fillRect(x, y, 1, 1);
              nonTransparentPixelsCount++;
            }
          }
        }
        // Draw 1:1 crisp to main canvas frame slot without downsampling loss!
        ctx.drawImage(tempCanvas, 0, 0, resW, resH, col * resW, row * resH, resW, resH);
      }

      console.log(`[PixelEditor 4/6] ✍️ Rendered ${nonTransparentPixelsCount} non-transparent pixels onto frame (col: ${col}, row: ${row})`);

      const updatedUrl = canvas.toDataURL('image/png');
      console.log(`[PixelEditor 5/6] 📦 Generated updated data URL (length: ${updatedUrl.length})`);

      const newOverrideObj = {
        url: updatedUrl,
        rows: currentOption.rows,
        cols: currentOption.cols,
        size: currentOption.size || 32,
        frameWidth: resW,
        frameHeight: resH,
        offsetX: 0,
        offsetY: 0,
        spacingX: 0,
        spacingY: 0
      };

      // Calculate next states
      const nextOverrides = { ...charImageOverrides, [charId]: newOverrideObj };
      const nextCustomChars = customCharSprites.map((opt) => {
        if (opt.id === charId) {
          return {
            ...opt,
            url: updatedUrl,
            cols: currentOption.cols,
            rows: currentOption.rows,
            frameWidth: resW,
            frameHeight: resH,
            offsetX: 0,
            offsetY: 0,
            spacingX: 0,
            spacingY: 0
          };
        }
        return opt;
      });

      // Synchronously write to localStorage BEFORE updating state or triggering event listeners!
      try {
        localStorage.setItem('on_house_char_image_overrides', JSON.stringify(nextOverrides));
        localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(nextCustomChars));
      } catch (e) {
        console.warn('[PixelEditor] Failed to write to localStorage:', e);
      }

      // Update React state
      setCharImageOverrides(nextOverrides);
      setCustomCharSprites(nextCustomChars);

      // Save directly to Cloud DB (Supabase)
      const currentHouseCode = getSavedHouseCode();
      const foundOpt = nextCustomChars.find((c) => c.id === charId);
      const assetData = {
        id: charId,
        name: foundOpt?.name || charId,
        url: updatedUrl,
        cols: currentOption.cols,
        rows: currentOption.rows,
        size: currentOption.size || 32,
        isCustom: true
      };
      saveHouseAssetToDB(currentHouseCode, 'char_sprite', assetData);
      saveHouseAssetToDB(currentHouseCode, 'char_image_override', {
        id: charId,
        ...newOverrideObj
      });

      // Force immediate board re-render and broadcast to game engine
      setBoardRenderKey((prev) => prev + 1);
      window.dispatchEvent(new Event('on_house_sprites_updated'));

      console.log(`[PixelEditor 6/6] ✅ Save process completed successfully for "${charId}"!`);
      setToastMessage("💾 픽셀 도트 수정이 성공적으로 반영되었습니다!");
      setEditingTile(null);
    } catch (err) {
      console.error('[PixelEditor Error] Failed to save pixel editor:', err);
      alert('도트 반영 중 오류가 발생했습니다: ' + (err as any)?.message);
    }
  };

  // Helper to load image URL as fully-loaded HTMLImageElement (checking img.complete for Data URLs)
  const loadLoadedImageElement = async (url: string): Promise<HTMLImageElement> => {
    const cleanUrl = await loadImageAsCleanDataUrl(url);
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (!cleanUrl.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        console.warn('[OnHouse ImageLoader] Warning: Primary image load error, attempting retry without crossOrigin:', err);
        const retryImg = new Image();
        retryImg.onload = () => resolve(retryImg);
        retryImg.onerror = (e) => reject(e);
        retryImg.src = cleanUrl;
      };
      img.src = cleanUrl;
      if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
        resolve(img);
      }
    });
  };

  // Delete an Action Motion Row
  const handleDeleteActionRow = async (rowIdx: number) => {
    if (!currentSelectedId) return; // No character selected — nothing to delete.
    if (currentOption.rows <= 1) {
      alert("최소 1개의 행은 유지되어야 합니다!");
      return;
    }

    const actionName = currentCharRowActions[rowIdx] || `행 ${rowIdx + 1}`;
    if (!window.confirm(`정말로 '${actionName}' (행 ${rowIdx + 1})을 삭제하시겠습니까?`)) return;

    try {
      const img = await loadLoadedImageElement(currentOption.url);
      const cols = currentOption.cols;
      const oldRows = currentOption.rows;
      const newRows = oldRows - 1;

      const naturalW = img.naturalWidth || img.width || (cols * 32);
      const naturalH = img.naturalHeight || img.height || (oldRows * 32);

      const tileW = Math.max(1, Math.floor(naturalW / cols));
      const tileH = Math.max(1, Math.floor(naturalH / oldRows));

      const canvas = document.createElement('canvas');
      canvas.width = naturalW;
      canvas.height = Math.max(1, Math.round(newRows * tileH));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // Copy top part (rows above rowIdx)
      if (rowIdx > 0) {
        const topH = Math.round(rowIdx * tileH);
        ctx.drawImage(img, 0, 0, naturalW, topH, 0, 0, naturalW, topH);
      }

      // Copy bottom part (rows below rowIdx)
      if (rowIdx < oldRows - 1) {
        const bottomSrcY = Math.round((rowIdx + 1) * tileH);
        const bottomDstY = Math.round(rowIdx * tileH);
        const bottomH = Math.round((oldRows - rowIdx - 1) * tileH);
        ctx.drawImage(img, 0, bottomSrcY, naturalW, bottomH, 0, bottomDstY, naturalW, bottomH);
      }

      const updatedUrl = canvas.toDataURL('image/png');

      const newOverrideObj = {
        url: updatedUrl,
        rows: newRows,
        cols,
        size: currentOption.size || 32,
        frameWidth: currentOption.frameWidth,
        frameHeight: currentOption.frameHeight
      };

      const updatedOverrides = {
        ...charImageOverrides,
        [currentSelectedId]: newOverrideObj
      };
      setCharImageOverrides(updatedOverrides);
      localStorage.setItem('on_house_char_image_overrides', JSON.stringify(updatedOverrides));

      // Also update customCharSprites in state & localStorage
      setCustomCharSprites((prev) => {
        const next = prev.map((opt) => {
          if (opt.id === currentSelectedId) {
            return {
              ...opt,
              url: updatedUrl,
              rows: newRows
            };
          }
          return opt;
        });
        localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));
        return next;
      });

      // Update action row names list
      const updatedList = currentCharRowActions.filter((_, idx) => idx !== rowIdx);
      const updatedRowActions = {
        ...charRowActions,
        [currentSelectedId]: updatedList
      };
      setCharRowActions(updatedRowActions);
      localStorage.setItem('on_house_char_row_actions', JSON.stringify(updatedRowActions));

      // Save to Supabase DB
      const currentHouseCode = getSavedHouseCode();
      const foundOpt = customCharSprites.find((c) => c.id === currentSelectedId);
      saveHouseAssetToDB(currentHouseCode, 'char_sprite', {
        id: currentSelectedId,
        name: foundOpt?.name || currentSelectedId,
        url: updatedUrl,
        cols,
        rows: newRows,
        size: currentOption.size || 32,
        isCustom: true
      }).catch(() => {});

      saveHouseAssetToDB(currentHouseCode, 'char_image_override', {
        id: currentSelectedId,
        ...newOverrideObj
      }).catch(() => {});

      saveHouseAssetToDB(currentHouseCode, 'char_row_actions', {
        id: currentSelectedId,
        actions: updatedList
      }).catch(() => {});

      setBoardRenderKey((prev) => prev + 1);
      window.dispatchEvent(new Event('on_house_sprites_updated'));
      setSelectedTileState(null);
    } catch (err) {
      console.error('Failed to delete action row:', err);
      alert('동작 행 삭제 중 오류가 발생했습니다.');
    }
  };

  // Add a Column (Frame) to the right of a row
  const handleAddColumn = async (rowIdx?: number) => {
    try {
      const img = await loadLoadedImageElement(currentOption.url);
      const rows = currentOption.rows;
      const oldCols = currentOption.cols;
      const newCols = oldCols + 1;

      const naturalW = img.naturalWidth || img.width || (oldCols * 32);
      const naturalH = img.naturalHeight || img.height || (rows * 32);

      const tileW = Math.max(1, Math.floor(naturalW / oldCols));
      const tileH = Math.max(1, Math.floor(naturalH / rows));

      const canvas = document.createElement('canvas');
      canvas.width = newCols * tileW;
      canvas.height = naturalH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // Draw existing image
      ctx.drawImage(img, 0, 0);

      // Duplicate previous column in the specified row for smooth starter frame
      const targetRow = rowIdx !== undefined ? rowIdx : 0;
      ctx.drawImage(
        img,
        (oldCols - 1) * tileW, targetRow * tileH, tileW, tileH,
        oldCols * tileW, targetRow * tileH, tileW, tileH
      );

      const updatedUrl = canvas.toDataURL('image/png');

      const newOverrideObj = {
        url: updatedUrl,
        rows,
        cols: newCols,
        size: currentOption.size || 32,
        frameWidth: currentOption.frameWidth,
        frameHeight: currentOption.frameHeight
      };

      const updatedOverrides = {
        ...charImageOverrides,
        [currentSelectedId]: newOverrideObj
      };
      setCharImageOverrides(updatedOverrides);
      localStorage.setItem('on_house_char_image_overrides', JSON.stringify(updatedOverrides));

      setCustomCharSprites((prev) => {
        const next = prev.map((opt) => {
          if (opt.id === currentSelectedId) {
            return {
              ...opt,
              url: updatedUrl,
              cols: newCols
            };
          }
          return opt;
        });
        localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));
        return next;
      });

      const currentHouseCode = getSavedHouseCode();
      const foundOpt = customCharSprites.find((c) => c.id === currentSelectedId);
      saveHouseAssetToDB(currentHouseCode, 'char_sprite', {
        id: currentSelectedId,
        name: foundOpt?.name || currentSelectedId,
        url: updatedUrl,
        cols: newCols,
        rows,
        size: currentOption.size || 32,
        isCustom: true
      }).catch(() => {});

      saveHouseAssetToDB(currentHouseCode, 'char_image_override', {
        id: currentSelectedId,
        ...newOverrideObj
      }).catch(() => {});

      setBoardRenderKey((prev) => prev + 1);
      window.dispatchEvent(new Event('on_house_sprites_updated'));
    } catch (err) {
      console.error('Failed to add column:', err);
    }
  };

  // Add a new Action Motion Row to the character spritesheet
  const handleAddActionRowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOption || !currentOption.url) return;
    const actionName = newActionNameInput.trim() || `동작 ${currentOption.rows + 1}`;

    console.log(`[OnHouse ActionRow] 1/5 ➕ Adding action row "${actionName}" for charId: "${currentSelectedId}" (current rows: ${currentOption.rows})`);

    try {
      const img = await loadLoadedImageElement(currentOption.url);
      const oldRows = currentOption.rows;
      const newRows = oldRows + 1;
      const cols = currentOption.cols;

      const naturalW = img.naturalWidth || img.width || (cols * 32);
      const naturalH = img.naturalHeight || img.height || (oldRows * 32);

      const tileW = Math.max(1, Math.floor(naturalW / cols));
      const tileH = Math.max(1, Math.floor(naturalH / oldRows));

      // Preserve full original resolution (up to 512px safety cap) with high quality WebP encoding
      const maxDim = 512;
      const scale = (tileW > maxDim || tileH > maxDim) ? maxDim / Math.max(tileW, tileH) : 1;
      const destTileW = Math.max(1, Math.round(tileW * scale));
      const destTileH = Math.max(1, Math.round(tileH * scale));

      const destSheetW = cols * destTileW;
      const destSheetH = newRows * destTileH;

      console.log(`[OnHouse ActionRow] 2/5 🎨 Resizing spritesheet: ${naturalW}x${naturalH} -> ${destSheetW}x${destSheetH} (tile: ${destTileW}x${destTileH})`);

      const canvas = document.createElement('canvas');
      canvas.width = destSheetW;
      canvas.height = destSheetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw existing image frames scaled to destTileW x destTileH
      for (let r = 0; r < oldRows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.drawImage(
            img,
            c * tileW, r * tileH, tileW, tileH,
            c * destTileW, r * destTileH, destTileW, destTileH
          );
        }
      }

      // Copy Row 0 (Idle frames) into the new bottom row as starting template
      ctx.drawImage(
        canvas,
        0, 0, destSheetW, destTileH,
        0, (newRows - 1) * destTileH, destSheetW, destTileH
      );

      const outWebP = canvas.toDataURL('image/webp', 0.88);
      const updatedUrl = (outWebP && outWebP.startsWith('data:image/webp')) ? outWebP : canvas.toDataURL('image/png');

      const newOverrideObj = {
        url: updatedUrl,
        rows: newRows,
        cols,
        size: currentOption.size || 32,
        frameWidth: destTileW,
        frameHeight: destTileH
      };

      // Update image overrides state
      const updatedOverrides = {
        ...charImageOverrides,
        [currentSelectedId]: newOverrideObj
      };
      setCharImageOverrides(updatedOverrides);
      safeLocalStorageSetItem('on_house_char_image_overrides', JSON.stringify(updatedOverrides));

      // Also update customCharSprites list in localStorage so custom sprites have the latest rows & url!
      setCustomCharSprites((prev) => {
        const next = prev.map((opt) => {
          if (opt.id === currentSelectedId) {
            return {
              ...opt,
              url: updatedUrl,
              rows: newRows,
              frameWidth: destTileW,
              frameHeight: destTileH
            };
          }
          return opt;
        });
        safeLocalStorageSetItem('on_house_custom_char_sprites', JSON.stringify(next));
        return next;
      });

      // Update action row names list
      const currentList = charRowActions[currentSelectedId] || getCharRowActions(currentSelectedId);
      const updatedList = [...currentList, actionName];
      const updatedRowActions = {
        ...charRowActions,
        [currentSelectedId]: updatedList
      };
      setCharRowActions(updatedRowActions);
      safeLocalStorageSetItem('on_house_char_row_actions', JSON.stringify(updatedRowActions));

      console.log(`[OnHouse ActionRow] 3/5 💾 Saved row actions to LocalStorage (${updatedList.length} actions: ${updatedList.join(', ')})`);

      // Save updated asset & override to Supabase DB!
      const currentHouseCode = getSavedHouseCode();
      const foundOpt = customCharSprites.find((c) => c.id === currentSelectedId);
      
      console.log(`[OnHouse ActionRow] 4/5 ☁️ Syncing 3 asset rows (char_sprite, char_image_override, char_row_actions) to Supabase DB for house [${currentHouseCode}]...`);
      
      await Promise.all([
        saveHouseAssetToDB(currentHouseCode, 'char_sprite', {
          id: currentSelectedId,
          name: foundOpt?.name || currentSelectedId,
          url: updatedUrl,
          cols,
          rows: newRows,
          size: currentOption.size || 32,
          isCustom: true
        }),
        saveHouseAssetToDB(currentHouseCode, 'char_image_override', {
          id: currentSelectedId,
          ...newOverrideObj
        }),
        saveHouseAssetToDB(currentHouseCode, 'char_row_actions', {
          id: currentSelectedId,
          actions: updatedList
        })
      ]);

      console.log(`[OnHouse ActionRow] 5/5 ✅ Action row "${actionName}" (Row ${newRows - 1}) successfully saved to DB & LocalStorage!`);

      // Force instant DOM re-render & canvas game cache refresh
      setBoardRenderKey((prev) => prev + 1);
      window.dispatchEvent(new Event('on_house_sprites_updated'));

      // Lock selection to first frame of the newly created row
      setSelectedTileState({ col: 0, row: newRows - 1, index: (newRows - 1) * cols });

      setShowAddRowModal(false);
      setNewActionNameInput('');
      
      alert(`✅ 새 동작 '${actionName}'이(가) 추가되었습니다!`);
    } catch (err) {
      console.error('[OnHouse ActionRow] ❌ Failed to add action row:', err);
      alert('동작 행 추가 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
  };

  // Image file select handler with auto-detection for cols and rows
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setFileDataUrl(result);
      setOriginalFileDataUrl(result);
      setIsChromaMode(false);
      setChromaColor(null);

      const img = new Image();
      img.onload = () => {
        setImgWidth(img.width);
        setImgHeight(img.height);

        const currentTileSize = tileSizeInput || 16;
        if (uploadCategory === 'map') {
          const mX = typeof customMarginXInput === 'number' ? customMarginXInput : 0;
          const mY = typeof customMarginYInput === 'number' ? customMarginYInput : 0;
          const autoCols = Math.max(1, Math.floor((img.width - mX * 2 + customSpacingInput) / (currentTileSize + customSpacingInput)));
          const autoRows = Math.max(1, Math.floor((img.height - mY * 2 + customSpacingInput) / (currentTileSize + customSpacingInput)));
          setCustomColsInput(autoCols);
          setCustomRowsInput(autoRows);
          setCustomFrameWidthInput(currentTileSize);
          setCustomFrameHeightInput(currentTileSize);
        } else {
          const autoCols = 4;
          const estRowH = img.width / autoCols;
          const autoRows = estRowH > 0 ? Math.round(img.height / estRowH) : 7;
          const finalRows = autoRows > 0 ? autoRows : 7;
          setCustomColsInput(autoCols);
          setCustomRowsInput(finalRows);

          const initW = Math.max(1, Math.round(img.width / autoCols));
          const initH = Math.max(1, Math.round(img.height / finalRows));
          setCustomFrameWidthInput(initW);
          setCustomFrameHeightInput(initH);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const recalculateDimensions = (
    newSize: number = tileSizeInput,
    mX: number = typeof customMarginXInput === 'number' ? customMarginXInput : 0,
    mY: number = typeof customMarginYInput === 'number' ? customMarginYInput : 0,
    spacing: number = typeof customSpacingInput === 'number' ? customSpacingInput : 0,
    w: number = imgWidth,
    h: number = imgHeight,
    cat: MainCategory = uploadCategory
  ) => {
    if (w <= 0 || h <= 0) return;
    if (cat === 'map') {
      const autoCols = Math.max(1, Math.floor((w - mX * 2 + spacing) / (newSize + spacing)));
      const autoRows = Math.max(1, Math.floor((h - mY * 2 + spacing) / (newSize + spacing)));
      setCustomColsInput(autoCols);
      setCustomRowsInput(autoRows);
    }
  };

  const handleSpacingChange = (spacingVal: number) => {
    const s = Math.max(0, spacingVal);
    setCustomSpacingInput(s);
    recalculateDimensions(tileSizeInput, typeof customMarginXInput === 'number' ? customMarginXInput : 0, typeof customMarginYInput === 'number' ? customMarginYInput : 0, s);
  };

  const handleTileSizeSelect = (newSize: number) => {
    setTileSizeInput(newSize);
    recalculateDimensions(newSize, typeof customMarginXInput === 'number' ? customMarginXInput : 0, typeof customMarginYInput === 'number' ? customMarginYInput : 0, typeof customSpacingInput === 'number' ? customSpacingInput : 0);
  };

  // Helper to slice tiles with margin & spacing into a 100% clean gapless tileset PNG
  const extractCleanTilesetImage = (
    sourceUrl: string,
    cols: number,
    rows: number,
    tSize: number,
    marginX: number,
    marginY: number,
    spacing: number
  ): Promise<string> => {
    return new Promise((resolve) => {
      if (marginX === 0 && marginY === 0 && spacing === 0) {
        resolve(sourceUrl);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = cols * tSize;
        canvas.height = rows * tSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(sourceUrl);
          return;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const sx = marginX + c * (tSize + spacing);
            const sy = marginY + r * (tSize + spacing);
            const dx = c * tSize;
            const dy = r * tSize;
            ctx.drawImage(img, sx, sy, tSize, tSize, dx, dy, tSize, tSize);
          }
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(sourceUrl);
      img.src = sourceUrl;
    });
  };

  // Helper to crop precise sprite sheet region (with start offsets and custom frame sizes) into a clean 100% gapless PNG/WebP
  const cropSpriteSheetRegion = (
    sourceUrl: string,
    offX: number,
    offY: number,
    cols: number,
    rows: number,
    frameW: number,
    frameH: number,
    spacing: number = 0
  ): Promise<{ url: string; frameW: number; frameH: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Preserve full original resolution (up to 512px safety cap) with high-quality smoothing and WebP compression
        const maxDim = 512;
        const scale = (frameW > maxDim || frameH > maxDim) ? maxDim / Math.max(frameW, frameH) : 1;
        const destFrameW = Math.max(1, Math.round(frameW * scale));
        const destFrameH = Math.max(1, Math.round(frameH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, cols * destFrameW);
        canvas.height = Math.max(1, rows * destFrameH);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ url: sourceUrl, frameW, frameH });
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const sx = offX + c * (frameW + spacing);
            const sy = offY + r * (frameH + spacing);
            const dx = c * destFrameW;
            const dy = r * destFrameH;

            ctx.drawImage(
              img,
              sx,
              sy,
              frameW,
              frameH,
              dx,
              dy,
              destFrameW,
              destFrameH
            );
          }
        }
        const outWebP = canvas.toDataURL('image/webp', 0.88);
        const finalUrl = outWebP && outWebP.startsWith('data:image/webp') ? outWebP : canvas.toDataURL('image/png');
        resolve({ url: finalUrl, frameW: destFrameW, frameH: destFrameH });
      };
      img.onerror = () => resolve({ url: sourceUrl, frameW, frameH });
      img.src = sourceUrl;
    });
  };

  // Smart Auto-Trim & Normalizer Algorithm for Custom Sprite Sheets
  const handleAutoNormalizeSpriteSheet = () => {
    if (!fileDataUrl) return;
    setIsNormalizing(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const targetCols = customColsInput || 4;
      const targetRows = customRowsInput || 9;
      const tSize = tileSizeInput || 32;

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsNormalizing(false);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;

      // 1. Find overall non-background content bounding box
      let minX = img.width;
      let minY = img.height;
      let maxX = 0;
      let maxY = 0;

      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const idx = (y * img.width + x) * 4;
          const a = data[idx + 3];
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const isContent = a > 15 && !(r < 18 && g < 18 && b < 18);
          if (isContent) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (minX >= maxX || minY >= maxY) {
        minX = 0;
        minY = 0;
        maxX = img.width - 1;
        maxY = img.height - 1;
      }

      const contentW = maxX - minX + 1;
      const contentH = maxY - minY + 1;

      // 2. Divide content bounding box into targetCols x targetRows
      const cellW = contentW / targetCols;
      const cellH = contentH / targetRows;

      // 3. Create normalized sprite sheet canvas: targetCols * tSize x targetRows * tSize
      const normCanvas = document.createElement('canvas');
      normCanvas.width = targetCols * tSize;
      normCanvas.height = targetRows * tSize;
      const normCtx = normCanvas.getContext('2d');
      if (!normCtx) {
        setIsNormalizing(false);
        return;
      }

      normCtx.imageSmoothingEnabled = false;

      // 4. For each cell (r, c), extract sub-image, find frame tight bounds, and center inside tSize x tSize
      for (let r = 0; r < targetRows; r++) {
        for (let c = 0; c < targetCols; c++) {
          const srcCellX = Math.floor(minX + c * cellW);
          const srcCellY = Math.floor(minY + r * cellH);
          const srcCellW = Math.max(1, Math.floor(cellW));
          const srcCellH = Math.max(1, Math.floor(cellH));

          let fMinX = srcCellW;
          let fMinY = srcCellH;
          let fMaxX = 0;
          let fMaxY = 0;
          let hasPixels = false;

          for (let cy = 0; cy < srcCellH; cy++) {
            for (let cx = 0; cx < srcCellW; cx++) {
              const px = srcCellX + cx;
              const py = srcCellY + cy;
              if (px < img.width && py < img.height) {
                const idx = (py * img.width + px) * 4;
                const a = data[idx + 3];
                const cr = data[idx];
                const cg = data[idx + 1];
                const cb = data[idx + 2];
                if (a > 15 && !(cr < 18 && cg < 18 && cb < 18)) {
                  hasPixels = true;
                  if (cx < fMinX) fMinX = cx;
                  if (cx > fMaxX) fMaxX = cx;
                  if (cy < fMinY) fMinY = cy;
                  if (cy > fMaxY) fMaxY = cy;
                }
              }
            }
          }

          const dstCellX = c * tSize;
          const dstCellY = r * tSize;

          if (hasPixels && fMinX <= fMaxX && fMinY <= fMaxY) {
            const frameSrcX = srcCellX + fMinX;
            const frameSrcY = srcCellY + fMinY;
            const frameSrcW = fMaxX - fMinX + 1;
            const frameSrcH = fMaxY - fMinY + 1;

            const scale = Math.min((tSize - 2) / frameSrcW, (tSize - 2) / frameSrcH, 1.5);
            const drawW = Math.round(frameSrcW * scale);
            const drawH = Math.round(frameSrcH * scale);

            const drawX = dstCellX + Math.floor((tSize - drawW) / 2);
            const drawY = dstCellY + Math.floor((tSize - drawH) / 2);

            normCtx.drawImage(
              img,
              frameSrcX, frameSrcY, frameSrcW, frameSrcH,
              drawX, drawY, drawW, drawH
            );
          } else {
            const drawX = dstCellX + Math.floor((tSize - srcCellW) / 2);
            const drawY = dstCellY + Math.floor((tSize - srcCellH) / 2);
            normCtx.drawImage(
              img,
              srcCellX, srcCellY, srcCellW, srcCellH,
              drawX, drawY, srcCellW, srcCellH
            );
          }
        }
      }

      // Use webp to heavily compress the preview data URL while preserving transparency
      // This prevents Supabase 500 errors caused by extremely large base64 PNG payloads
      const normalizedDataUrl = normCanvas.toDataURL('image/webp', 0.8);
      setFileDataUrl(normalizedDataUrl);
      setOriginalFileDataUrl(normalizedDataUrl);
      setIsChromaMode(false);
      setChromaColor(null);
      setImgWidth(normCanvas.width);
      setImgHeight(normCanvas.height);
      setIsNormalizing(false);
      alert(`✨ 스마트 보정 완료!\n여백을 자동으로 제거하고 ${targetCols}열 x ${targetRows}행 (${tSize}x${tSize}px) 정격 규격 스프라이트 시트로 보정하였습니다.`);
    };
    img.src = fileDataUrl;
  };

  // Chroma Key Processing
  const applyChromaKey = (targetColor: {r: number, g: number, b: number}, tolerance: number) => {
    if (!originalFileDataUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        if (data[i+3] === 0) continue; // Already transparent
        const r = data[i], g = data[i+1], b = data[i+2];
        const diff = Math.max(Math.abs(r - targetColor.r), Math.abs(g - targetColor.g), Math.abs(b - targetColor.b));
        if (diff <= tolerance) {
          data[i+3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      setFileDataUrl(canvas.toDataURL('image/png'));
    };
    img.src = originalFileDataUrl;
  };

  useEffect(() => {
    if (chromaColor) {
      applyChromaKey(chromaColor, chromaTolerance);
    }
  }, [chromaTolerance, chromaColor]);

  const handleChromaClick = (x: number, y: number) => {
    if (!originalFileDataUrl) return;
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= imgWidth || py >= imgHeight) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const pixel = ctx.getImageData(px, py, 1, 1).data;
      setChromaColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
    };
    img.src = originalFileDataUrl;
  };

  // Generate default character template spritesheet if no image uploaded
  const createDefaultCharTemplate = (tSize: number = 16) => {
    const cols = 4;
    const rows = 7;
    const canvas = document.createElement('canvas');
    canvas.width = cols * tSize;
    canvas.height = rows * tSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const dotSize = Math.max(2, Math.floor(tSize / 2));
      const subDot = Math.max(1, Math.floor(tSize / 4));
      const offset = Math.floor((tSize - dotSize) / 2);
      const subOffset = Math.floor((tSize - subDot) / 2);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = '#89b4fa';
          ctx.fillRect(c * tSize + offset, r * tSize + offset, dotSize, dotSize);
          ctx.fillStyle = '#f5c2e7';
          ctx.fillRect(c * tSize + subOffset, r * tSize + subOffset, subDot, subDot);
        }
      }
    }
    return { dataUrl: canvas.toDataURL(), cols, rows };
  };

  // 📏 Update custom character display size on map (in px)
  const handleUpdateCharacterDisplaySize = (charId: string, newSize: number) => {
    if (!charId) return; // No character selected (e.g. house has none yet) — nothing to save.
    setCharImageOverrides((prev) => {
      const existing = prev[charId] || {
        url: currentOption.url,
        rows: currentOption.rows,
        cols: currentOption.cols,
        size: newSize
      };
      const updated = {
        ...prev,
        [charId]: {
          ...existing,
          size: newSize
        }
      };
      localStorage.setItem('on_house_char_image_overrides', JSON.stringify(updated));
      return updated;
    });

    setCustomCharSprites((prev) => {
      const updated = prev.map((item) => {
        if (item.id === charId) {
          return { ...item, size: newSize };
        }
        return item;
      });
      localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(updated));
      return updated;
    });

    const currentHouse = getSavedHouseCode();
    
    const updatedOption = {
      ...currentOption,
      size: newSize
    };
    
    saveHouseAssetToDB(currentHouse, 'char_sprite', updatedOption);
    
    try {
      supabase.channel(`house:${currentHouse}`).send({
        type: 'broadcast',
        event: 'asset_update',
        payload: {
          assetType: 'char_sprite',
          assetData: updatedOption
        }
      });
    } catch (e) {}

    window.dispatchEvent(new Event('on_house_sprites_updated'));
    setToastMessage(`📏 [${currentOption.name}] 맵 출력 크기가 ${newSize}px로 설정되었습니다!`);
  };

  // Save new custom asset (Supports character creation by Name Only & Shows Upload Progress!)
  const handleSaveCustomAsset = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = assetNameInput.trim();
    if (!name) {
      alert("에셋 이름을 입력해 주세요!");
      return;
    }

    try {
      setIsSavingAsset(true);
      setSaveProgressText('💾 이미지 데이터 규격화 처리 중...');

      let finalUrl = fileDataUrl;
      let cols = 4;
      let rows = 7;
      const tSize = tileSizeInput || 32;

      let frameW = customFrameWidthInput || tSize;
      let frameH = customFrameHeightInput || tSize;
      let offX = customOffsetXInput || 0;
      let offY = customOffsetYInput || 0;

      if (uploadCategory === 'character' && !fileDataUrl) {
        const template = createDefaultCharTemplate(tSize);
        finalUrl = template.dataUrl;
        cols = template.cols;
        rows = template.rows;
      } else if (fileDataUrl) {
        cols = (typeof customColsInput === 'number' && customColsInput > 0)
          ? customColsInput
          : (imgWidth > 0 && offX < imgWidth ? Math.max(1, Math.floor((imgWidth - offX) / frameW)) : 4);

        rows = (typeof customRowsInput === 'number' && customRowsInput > 0)
          ? customRowsInput
          : (imgHeight > 0 && offY < imgHeight ? Math.max(1, Math.floor((imgHeight - offY) / frameH)) : 7);

        // Automatic Gap & Margin Extraction for Map Tilesets
        const mX = typeof customMarginXInput === 'number' ? customMarginXInput : 0;
        const mY = typeof customMarginYInput === 'number' ? customMarginYInput : 0;
        
        if (uploadCategory === 'map' && (customSpacingInput > 0 || mX > 0 || mY > 0)) {
          setSaveProgressText('✂️ 타일 간격/검은줄 제거 및 픽셀 규격화 정제 중...');
          finalUrl = await extractCleanTilesetImage(
            fileDataUrl,
            cols,
            rows,
            tSize,
            mX,
            mY,
            customSpacingInput
          );
        } else if (uploadCategory === 'character' || offX > 0 || offY > 0 || (imgWidth > 0 && (frameW !== Math.round((imgWidth - offX) / cols) || frameH !== Math.round((imgHeight - offY) / rows)))) {
          // Automatic cropping for character sprite sheets, start offsets (시작 X, Y), and custom frame dimensions
          setSaveProgressText('✂️ 에셋 영역 자동 크롭 및 오프셋 정제 중...');
          const cropRes = await cropSpriteSheetRegion(
            fileDataUrl,
            offX,
            offY,
            cols,
            rows,
            frameW,
            frameH,
            customSpacingInput || 0
          );
          finalUrl = cropRes.url;
          frameW = cropRes.frameW;
          frameH = cropRes.frameH;
          offX = 0;
          offY = 0;
        }
      } else {
        alert("맵 타일셋의 경우 이미지 파일을 선택해 주세요!");
        setIsSavingAsset(false);
        setSaveProgressText('');
        return;
      }

      let generatedOptions: TilesetOption[] = [];
      let nextMapPrefix = customMapTilesets.reduce((max, item) => Math.max(max, item.prefix || 8000), 8000);

      if (uploadCategory === 'map' && rows > 64) {
        setSaveProgressText(`✂️ 세로 행이 64개를 초과하여 에셋을 자동 분할 중입니다...`);
        const img = await loadLoadedImageElement(finalUrl!);
        let remainingRows = rows;
        let currentRow = 0;
        let partIndex = 1;

        while (remainingRows > 0) {
          const chunkRows = Math.min(64, remainingRows);
          const canvas = document.createElement('canvas');
          canvas.width = cols * frameW;
          canvas.height = chunkRows * frameH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, currentRow * frameH, cols * frameW, chunkRows * frameH, 0, 0, cols * frameW, chunkRows * frameH);
            const chunkUrl = canvas.toDataURL('image/png');
            
            const maxPrefix = nextMapPrefix;
            nextMapPrefix = maxPrefix >= 9000 ? maxPrefix + 1000 : 9000;

            generatedOptions.push({
              id: 'custom_map_' + Date.now() + '_p' + partIndex,
              name: `${name} (분할 ${partIndex})`,
              url: chunkUrl,
              cols,
              rows: chunkRows,
              size: tSize || 32,
              frameWidth: frameW,
              frameHeight: frameH,
              offsetX: offX,
              offsetY: offY,
              spacingX: customSpacingInput || 0,
              spacingY: customSpacingInput || 0,
              prefix: nextMapPrefix,
              isCustom: true
            });
          }
          remainingRows -= chunkRows;
          currentRow += chunkRows;
          partIndex++;
        }
      } else {
        const newId = (uploadCategory === 'map' ? 'custom_map_' : 'custom_char_') + Date.now();
        const maxPrefix = customMapTilesets.reduce((max, item) => Math.max(max, item.prefix || 8000), 8000);
        const nextPrefix = maxPrefix >= 9000 ? maxPrefix + 1000 : 9000;

        generatedOptions.push({
          id: newId,
          name,
          url: finalUrl!,
          cols,
          rows,
          size: tSize || 32,
          frameWidth: frameW,
          frameHeight: frameH,
          offsetX: offX,
          offsetY: offY,
          spacingX: customSpacingInput || 0,
          spacingY: customSpacingInput || 0,
          prefix: uploadCategory === 'map' ? nextPrefix : undefined,
          isCustom: true
        });
      }

      const currentHouse = getSavedHouseCode();
      const assetType = uploadCategory === 'map' ? 'map_tileset' : 'char_sprite';

      setSaveProgressText('💾 로컬 저장소 등록 중...');

      if (uploadCategory === 'map') {
        const existingStr = localStorage.getItem('on_house_custom_map_tilesets');
        const existing: TilesetOption[] = existingStr ? JSON.parse(existingStr) : customMapTilesets;
        const next = [...existing, ...generatedOptions];
        safeLocalStorageSetItem('on_house_custom_map_tilesets', JSON.stringify(next));
        setCustomMapTilesets(next);
        setActiveTab('map');
        setSelectedMapId(generatedOptions[0].id);
      } else {
        const existingStr = localStorage.getItem('on_house_custom_char_sprites');
        const existing: TilesetOption[] = existingStr ? JSON.parse(existingStr) : customCharSprites;
        const next = [...existing, ...generatedOptions];
        const lightweightNext = next.map(({ url, ...meta }: any) => meta);
        safeLocalStorageSetItem('on_house_custom_char_sprites', JSON.stringify(lightweightNext));
        setCustomCharSprites(next);
        setActiveTab('character');
        setSelectedCharId(generatedOptions[0].id);

        // The game canvas only reads character images from char_image_override, not from
        // char_sprite's own url — register one now so a freshly uploaded character actually
        // renders in-game instead of staying a placeholder until someone edits it later.
        setCharImageOverrides((prev) => {
          const nextOverrides = { ...prev };
          generatedOptions.forEach((opt) => {
            nextOverrides[opt.id] = {
              url: opt.url,
              cols: opt.cols,
              rows: opt.rows,
              size: opt.size,
              frameWidth: opt.frameWidth,
              frameHeight: opt.frameHeight,
              offsetX: opt.offsetX,
              offsetY: opt.offsetY,
              spacingX: opt.spacingX,
              spacingY: opt.spacingY
            };
          });
          return nextOverrides;
        });
      }

      // Notify window to update CanvasGame image caches immediately
      window.dispatchEvent(new Event('on_house_sprites_updated'));

      setSaveProgressText('☁️ 하우스 서버(Supabase) 업로드 저장 중...');
      
      for (const opt of generatedOptions) {
        const dbRes = await saveHouseAssetToDB(currentHouse, assetType, opt);
        if (!dbRes.success) {
          console.error('[Asset DB Save Error]', dbRes.error);
          alert(`⚠️ 서버(DB) 저장 실패로 에셋 등록이 취소되었습니다.\n(원인: ${dbRes.error || 'Supabase 테이블 미생성 또는 네트워크 오류'})\n\n신규 Supabase 대시보드의 SQL Editor에서 테이블 생성 SQL을 실행해 주세요.`);
          
          // Rollback local state & localStorage so orphaned assets are not kept
          if (uploadCategory === 'map') {
            setCustomMapTilesets((prev) => {
              const next = prev.filter((item) => !generatedOptions.some((g) => g.id === item.id));
              safeLocalStorageSetItem('on_house_custom_map_tilesets', JSON.stringify(next));
              return next;
            });
          } else {
            setCustomCharSprites((prev) => {
              const next = prev.filter((item) => !generatedOptions.some((g) => g.id === item.id));
              safeLocalStorageSetItem('on_house_custom_char_sprites', JSON.stringify(next));
              return next;
            });
          }

          setIsSavingAsset(false);
          setSaveProgressText('');
          return;
        }

        if (assetType === 'char_sprite') {
          const overrideObj = {
            url: opt.url,
            cols: opt.cols,
            rows: opt.rows,
            size: opt.size,
            frameWidth: opt.frameWidth,
            frameHeight: opt.frameHeight,
            offsetX: opt.offsetX,
            offsetY: opt.offsetY,
            spacingX: opt.spacingX,
            spacingY: opt.spacingY
          };
          await saveHouseAssetToDB(currentHouse, 'char_image_override', { id: opt.id, ...overrideObj });
        }

        try {
          supabase.channel(`house:${currentHouse}`).send({
            type: 'broadcast',
            event: 'asset_update',
            payload: { assetType, assetData: opt }
          });
        } catch (e) {}
      }

      setSaveProgressText('✅ 에셋 저장 완료!');
      window.dispatchEvent(new Event('on_house_sprites_updated'));

      setTimeout(() => {
        setFileDataUrl(null);
        setAssetNameInput('');
        setImgWidth(0);
        setImgHeight(0);
        setShowUploadModal(false);
        setIsSavingAsset(false);
        setSaveProgressText('');
        
        if (generatedOptions.length > 1) {
          alert(`맵이 너무 길어서(64행 초과) 안전하게 ${generatedOptions.length}개로 자동 분할되어 저장되었습니다!\n\n(생성된 에셋: ${generatedOptions.map(o => o.name).join(', ')})`);
        }
      }, 500);
    } catch (err) {
      console.error('Error saving asset:', err);
      alert('에셋 저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
      setIsSavingAsset(false);
      setSaveProgressText('');
    }
  };

  const handlePublishAssetToMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOption) return;
    const title = publishTitle.trim();
    if (!title) {
      alert('상점에 공개할 에셋 이름을 입력해 주세요!');
      return;
    }

    try {
      setIsPublishing(true);
      const currentHouse = getSavedHouseCode();
      const creator = publishCreator.trim() || localStorage.getItem('on_house_nickname') || '익명 크리에이터';

      const assetUrl = currentOption.url || currentOption.dataUrl || '';

      if (activeTab === 'character') {
        await publishItemToMarket({
          type: 'character',
          title,
          description: publishDesc.trim() || '직접 디자인한 픽셀 캐릭터 에셋입니다.',
          creatorName: creator,
          originalHouseCode: currentHouse,
          previewDataUrl: assetUrl,
          payload: {
            character: {
              name: title,
              size: currentOption.size || 32,
              dataUrl: assetUrl,
              cols: currentOption.cols || 4,
              rows: currentOption.rows || 7,
              spriteType: currentOption.id
            }
          }
        });
      } else {
        await publishItemToMarket({
          type: 'map_tileset',
          title,
          description: publishDesc.trim() || '직접 제작한 레트로 맵 타일셋 에셋입니다.',
          creatorName: creator,
          originalHouseCode: currentHouse,
          previewDataUrl: assetUrl,
          payload: {
            mapTileset: {
              name: title,
              size: currentOption.size || 16,
              url: assetUrl,
              cols: currentOption.cols || 16,
              rows: currentOption.rows || 16,
              spacing: currentOption.spacing || 0,
              margin: currentOption.margin || 0
            }
          }
        });
      }

      setIsPublishing(false);
      setShowPublishModal(false);
      setToastMessage(`🎉 [${title}] 에셋이 오픈 마켓 상점에 성공적으로 게시되었습니다!`);
    } catch (err: any) {
      alert('마켓 게시 중 오류 발생: ' + (err?.message || err));
      setIsPublishing(false);
    }
  };

  // Delete custom asset
  const handleDeleteCustomAsset = async (id: string) => {
    if (!window.confirm("정말로 이 커스텀 에셋을 영구 삭제하시겠습니까?")) return;

    const currentHouse = getSavedHouseCode();

    if (activeTab === 'map') {
      setCustomMapTilesets((prev) => {
        const next = prev.filter((opt) => opt.id !== id);
        safeLocalStorageSetItem('on_house_custom_map_tilesets', JSON.stringify(next));
        return next;
      });
      setSelectedMapId('interior');
      await deleteHouseAssetFromDB(currentHouse, 'map_tileset', id);
      try {
        supabase.channel(`house:${currentHouse}`).send({
          type: 'broadcast',
          event: 'asset_delete',
          payload: { assetType: 'map_tileset', assetId: id }
        });
      } catch (e) {}
    } else {
      setCustomCharSprites((prev) => {
        const next = prev.filter((opt) => opt.id !== id);
        safeLocalStorageSetItem('on_house_custom_char_sprites', JSON.stringify(next));
        return next;
      });
      setCharImageOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        safeLocalStorageSetItem('on_house_char_image_overrides', JSON.stringify(next));
        return next;
      });
      setSelectedCharId('');
      await deleteHouseAssetFromDB(currentHouse, 'char_sprite', id);
      await deleteHouseAssetFromDB(currentHouse, 'char_image_override', id);
      await deleteHouseAssetFromDB(currentHouse, 'char_row_actions', id);

      try {
        supabase.channel(`house:${currentHouse}`).send({
          type: 'broadcast',
          event: 'asset_delete',
          payload: { assetType: 'char_sprite', assetId: id }
        });
      } catch (e) {}
    }

    // Broadcast sprite cache update event
    window.dispatchEvent(new Event('on_house_sprites_updated'));
  };

  // Export & Import All App Backup Data
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
        alert(`총 ${count}개의 백업 데이터(맵/에셋)가 성공적으로 복원되었습니다! 앱을 새로고침합니다.`);
        window.location.reload();
      } catch (err) {
        alert('백업 파일을 불러오는 중 오류가 발생했습니다. 올바른 .json 백업 파일인지 확인해 주세요.');
      }
    };
    reader.readAsText(file);
  };

  // Current row action names array for selected character
  const currentCharRowActions = charRowActions[currentSelectedId] || getCharRowActions(currentSelectedId);
  const baseBoardSize = 256;
  const boardSize = Math.round(baseBoardSize * editorZoom);

  return (
    <AssetViewerErrorBoundary>
    <div style={{
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      width: '920px', maxWidth: '85vw', height: '72vh', maxHeight: '660px',
      zIndex: 150, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px',
      border: '1px solid #585b70', background: '#161622',
      boxShadow: '0 20px 60px rgba(0,0,0,0.85)', borderRadius: '6px'
    }}>
      {/* 1. Top Header Bar (Title, Tabs, and Close button - all 12px font matching 마켓에 공유!) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #585b70', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Title (fontSize: 12px) */}
          <h3 className="pixel-text" style={{ fontSize: '12px', color: '#a78bfa', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'normal' }}>
            <Sparkles size={14} /> 픽셀 에디터
          </h3>

          {/* Main Category Tabs: 캐릭터 / 맵 (fontSize: 12px) */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              onClick={() => {
                setActiveTab('character');
                setHoveredTile(null);
                setSelectedTileState(null);
              }}
              style={{
                padding: '6px 14px', fontSize: '12px', borderRadius: '4px',
                background: activeTab === 'character' ? '#252538' : '#14141e',
                color: activeTab === 'character' ? '#fff' : '#8a8a9e',
                border: activeTab === 'character' ? '1px solid #a78bfa' : '1px solid #585b70',
                cursor: 'pointer', fontWeight: 'normal',
                display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.1s ease'
              }}
            >
              <User size={13} /> 캐릭터 ({charOptions.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('map');
                setHoveredTile(null);
                setSelectedTileState(null);
              }}
              style={{
                padding: '6px 14px', fontSize: '12px', borderRadius: '4px',
                background: activeTab === 'map' ? '#252538' : '#14141e',
                color: activeTab === 'map' ? '#fff' : '#8a8a9e',
                border: activeTab === 'map' ? '1px solid #a78bfa' : '1px solid #585b70',
                cursor: 'pointer', fontWeight: 'normal',
                display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.1s ease'
              }}
            >
              <Layers size={13} /> 맵 ({mapOptions.length})
            </button>
          </div>
        </div>

        {/* Close Button Only (fontSize: 12px) */}
        <button
          onClick={onClose}
          style={{
            background: '#252538', color: '#fff', border: '1px solid #585b70',
            padding: '5px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal'
          }}
        >
          <X size={14} /> 닫기
        </button>
      </div>

      {/* 2. Sub-Control Toolbar */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '8px',
        background: '#14141e', border: '1px solid #585b70', padding: '8px 12px',
        borderRadius: '4px'
      }}>
        {/* Top Row: Dropdown, Delete (if custom), "+ 추가" (moved to LEFT of "마켓에 공유"), "🛒 마켓에 공유" */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#a0a0b8' }}>
            {activeTab === 'character' ? '선택:' : '타일셋 선택:'}
          </span>
          <select
            value={currentSelectedId}
            onChange={(e) => {
              if (activeTab === 'character') setSelectedCharId(e.target.value);
              else setSelectedMapId(e.target.value);
              setHoveredTile(null);
              setSelectedTileState(null);
            }}
            style={{
              background: '#1c1c2b', color: '#fff', border: '1px solid #585b70',
              borderRadius: '4px', padding: '5px 10px', fontSize: '12px', fontWeight: 'normal',
              outline: 'none', cursor: 'pointer'
            }}
          >
            {currentOptionList.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name} ({opt.cols}x{opt.rows} 타일)
              </option>
            ))}
          </select>

          {currentOption?.isCustom && (
            <button
              onClick={() => handleDeleteCustomAsset(currentOption.id)}
              title="커스텀 에셋 삭제"
              style={{
                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444',
                color: '#ff6b6b', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'normal'
              }}
            >
              <Trash2 size={13} /> 삭제
            </button>
          )}

          {/* "+ 추가" button on the LEFT of "마켓에 공유"! */}
          <button
            onClick={() => {
              setUploadCategory(activeTab);
              setShowUploadModal(true);
            }}
            style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: '4px',
              background: '#2a2a3e', color: '#a78bfa',
              border: '1px solid #585b70', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal'
            }}
          >
            <Plus size={13} /> 추가
          </button>

          {/* "🛒 마켓에 공유" button */}
          {currentOption && (
            <button
              type="button"
              onClick={() => {
                setPublishTitle(currentOption.name || '');
                setPublishDesc('');
                setPublishCreator(localStorage.getItem('on_house_nickname') || '익명 크리에이터');
                setShowPublishModal(true);
              }}
              title="오픈 마켓 상점에 에셋 공유 게시"
              style={{
                background: 'rgba(167, 139, 250, 0.15)', border: '1px solid #a78bfa',
                color: '#a78bfa', borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'normal'
              }}
            >
              🛒 마켓에 공유
            </button>
          )}
        </div>

        {/* Bottom Row: Zoom Selector (left) and "맵 출력 크기" (placed to the RIGHT of Zoom!) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: '#14141e', padding: '3px 6px', borderRadius: '4px', border: '1px solid #585b70' }}>
            <ZoomIn size={13} style={{ color: '#aaa', marginRight: '2px' }} />
            {([1.0, 1.5, 2.0, 3.0] as const).map((z) => (
              <button
                key={z}
                onClick={() => setGridZoom(z)}
                style={{
                  padding: '3px 6px', fontSize: '11px', borderRadius: '3px', border: 'none',
                  background: gridZoom === z ? '#a78bfa' : 'transparent',
                  color: gridZoom === z ? '#000' : '#ccc', cursor: 'pointer', fontWeight: 'normal'
                }}
              >
                {z}x
              </button>
            ))}
          </div>

          {activeTab === 'character' && currentSelectedId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(139, 92, 246, 0.12)', border: '1px solid #585b70',
              padding: '3px 8px', borderRadius: '4px'
            }}>
              <span style={{ fontSize: '12px', color: '#fff', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '4px' }}>
                📏 맵 출력 크기:
              </span>

              <button
                type="button"
                onClick={() => {
                  const currentDisplaySize = charImageOverrides[currentSelectedId]?.size || 16;
                  const next = Math.max(8, currentDisplaySize - 2);
                  handleUpdateCharacterDisplaySize(currentSelectedId, next);
                }}
                title="크기 줄이기 (-2px)"
                style={{
                  background: '#252538', border: '1px solid #585b70',
                  color: '#fff', width: '22px', height: '22px', borderRadius: '3px',
                  fontSize: '13px', fontWeight: 'normal', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0
                }}
              >
                -
              </button>

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={sizeInputText !== null ? sizeInputText : (charImageOverrides[currentSelectedId]?.size || 16)}
                onFocus={(e) => {
                  const curr = charImageOverrides[currentSelectedId]?.size || 16;
                  setSizeInputText(curr.toString());
                  e.target.select();
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setSizeInputText(val);
                  const num = parseInt(val, 10);
                  if (!isNaN(num) && num >= 8 && num <= 128) {
                    handleUpdateCharacterDisplaySize(currentSelectedId, num);
                  }
                }}
                onBlur={() => {
                  const curr = charImageOverrides[currentSelectedId]?.size || 16;
                  const num = parseInt(sizeInputText !== null ? sizeInputText : curr.toString(), 10);
                  const validNum = isNaN(num) ? 16 : Math.max(8, Math.min(128, num));
                  handleUpdateCharacterDisplaySize(currentSelectedId, validNum);
                  setSizeInputText(null);
                }}
                style={{
                  width: '38px',
                  background: '#0d0d12',
                  border: '1px solid #585b70',
                  borderRadius: '3px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 'normal',
                  textAlign: 'center',
                  padding: '2px 0',
                  outline: 'none'
                }}
              />

              <button
                type="button"
                onClick={() => {
                  const currentDisplaySize = charImageOverrides[currentSelectedId]?.size || 16;
                  const next = Math.min(128, currentDisplaySize + 2);
                  handleUpdateCharacterDisplaySize(currentSelectedId, next);
                }}
                title="크기 키우기 (+2px)"
                style={{
                  background: '#252538', border: '1px solid #585b70',
                  color: '#fff', width: '22px', height: '22px', borderRadius: '3px',
                  fontSize: '13px', fontWeight: 'normal', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0
                }}
              >
                +
              </button>

              <span style={{ fontSize: '11px', color: '#aaa' }}>px</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Viewport & Side Panel */}
      <div style={{ flex: 1, display: 'flex', gap: '14px', overflow: 'hidden' }}>
        {/* Left Grid Viewer Canvas Container */}
        <div style={{
          flex: 1, overflow: 'auto', background: '#0e0e16', borderRadius: '4px',
          border: '1px solid #585b70', display: 'block', padding: '16px 24px', position: 'relative'
        }}>
          {/* Outer Canvas Wrapper */}
          <div style={{
            position: 'relative',
            margin: 'auto',
            width: `${(currentOption?.cols || 1) * visualCellWidth}px`,
            height: `${(currentOption?.rows || 1) * visualCellHeight}px`,
            marginBottom: activeTab === 'character' ? '48px' : 0
          }}>
            {/* 1. Delete (-) Button on Left of Each Row */}
            {activeTab === 'character' && Array.from({ length: currentOption.rows }).map((_, rIdx) => (
              <button
                key={`del-row-${rIdx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteActionRow(rIdx);
                }}
                title={`행 ${rIdx} (${currentCharRowActions[rIdx] || '동작'}) 삭제`}
                style={{
                  position: 'absolute',
                  left: '-32px',
                  top: `${rIdx * visualCellHeight + (visualCellHeight - 24) / 2}px`,
                  width: '24px',
                  height: '24px',
                  background: 'rgba(239, 68, 68, 0.25)',
                  border: '1px solid var(--danger)',
                  color: '#ff6b6b',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  zIndex: 5
                }}
              >
                <Minus size={13} />
              </button>
            ))}

            {/* 2. Main Grid Canvas Container with Drag & Drop & Right-Click Context Menu Support */}
            <div 
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredTile(null)}
              onClick={() => {
                if (hoveredTile) {
                  // Lock tile selection on click
                  setSelectedTileState(hoveredTile);
                  if (onSelectTile) {
                    onSelectTile(hoveredTile.prefixedId ?? hoveredTile.index);
                  }
                }
              }}
              style={{
                position: 'relative',
                width: `${currentOption.cols * visualCellWidth}px`,
                height: `${currentOption.rows * visualCellHeight}px`,
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                background: '#0a0a0f'
              }}
            >
              {/* Background Sprite Image with onError fallback & dynamic key for instant re-mount */}
              <img
                key={`board-img-${currentSelectedId}-${boardRenderKey}-${Date.now()}`}
                src={currentOption.url}
                alt={currentOption.name}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  imageRendering: 'pixelated',
                  pointerEvents: 'none',
                  objectFit: 'fill'
                }}
              />
              {/* Individual Interactive Tile Drag & Context Overlay Cells */}
              {Array.from({ length: currentOption.rows }).map((_, rIdx) =>
                Array.from({ length: currentOption.cols }).map((_, cIdx) => (
                  <div
                    key={`tile-cell-${rIdx}-${cIdx}`}
                    draggable={activeTab === 'character'}
                    onDragStart={(e) => {
                      if (activeTab !== 'character') return;
                      e.dataTransfer.setData('text/plain', '');
                      setDraggedTile({ col: cIdx, row: rIdx });
                    }}
                    onDragOver={(e) => {
                      if (activeTab === 'character') e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (activeTab === 'character') handleDropTile(e, cIdx, rIdx);
                    }}
                    onContextMenu={(e) => {
                      if (activeTab === 'character') handleTileContextMenu(e, cIdx, rIdx);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${cIdx * visualCellWidth}px`,
                      top: `${rIdx * visualCellHeight}px`,
                      width: `${visualCellWidth}px`,
                      height: `${visualCellHeight}px`,
                      boxSizing: 'border-box',
                      zIndex: 1
                    }}
                  />
                ))
              )}

              {/* Grid overlay */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)',
                backgroundSize: `${visualCellWidth}px ${visualCellHeight}px`,
                pointerEvents: 'none'
              }} />

              {/* Locked selected tile highlight (pink/magenta) */}
              {selectedTileState && (
                <div style={{
                  position: 'absolute',
                  left: `${selectedTileState.col * visualCellWidth}px`,
                  top: `${selectedTileState.row * visualCellHeight}px`,
                  width: `${visualCellWidth}px`,
                  height: `${visualCellHeight}px`,
                  border: '2px solid #ff79c6',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  background: 'rgba(255, 121, 198, 0.35)',
                  boxShadow: '0 0 12px rgba(255, 121, 198, 0.8)',
                  zIndex: 2
                }} />
              )}

              {/* Hover highlight (cyan/blue) */}
              {hoveredTile && (!selectedTileState || selectedTileState.col !== hoveredTile.col || selectedTileState.row !== hoveredTile.row) && (
                <div style={{
                  position: 'absolute',
                  left: `${hoveredTile.col * visualCellWidth}px`,
                  top: `${hoveredTile.row * visualCellHeight}px`,
                  width: `${visualCellWidth}px`,
                  height: `${visualCellHeight}px`,
                  border: '2px dashed #8be9fd',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  background: 'rgba(139, 233, 253, 0.2)',
                  zIndex: 1
                }} />
              )}
            </div>

            {/* 3. Add Frame (+) Button on Right of Each Row */}
            {activeTab === 'character' && Array.from({ length: currentOption.rows }).map((_, rIdx) => (
              <button
                key={`add-col-${rIdx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddColumn(rIdx);
                }}
                title={`행 ${rIdx} 오른쪽에 프레임(+) 추가`}
                style={{
                  position: 'absolute',
                  right: '-32px',
                  top: `${rIdx * visualCellHeight + (visualCellHeight - 24) / 2}px`,
                  width: '24px',
                  height: '24px',
                  background: 'rgba(139, 92, 246, 0.25)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  zIndex: 5
                }}
              >
                <Plus size={13} />
              </button>
            ))}

            {/* 4. Add Row (+) Button at Bottom */}
            {activeTab === 'character' && (
              <button
                onClick={() => setShowAddRowModal(true)}
                title="맨 아래에 새로운 동작 행 추가"
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  top: `${currentOption.rows * visualCellHeight + 10}px`,
                  minWidth: `${Math.max(130, currentOption.cols * visualCellWidth)}px`,
                  height: '32px',
                  padding: '0 12px',
                  whiteSpace: 'nowrap',
                  background: 'rgba(245, 194, 231, 0.2)',
                  border: '1px dashed #f5c2e7',
                  color: '#f5c2e7',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(245, 194, 231, 0.2)',
                  zIndex: 5
                }}
              >
                <Plus size={14} /> ➕ 새 동작 행 추가
              </button>
            )}
          </div>
        </div>

        {/* Right Details Panel */}
        <div style={{
          width: '280px', display: 'flex', flexDirection: 'column', gap: '14px',
          background: '#1c1c2b', padding: '14px', borderRadius: '4px',
          border: '1px solid #585b70', flexShrink: 0, overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #585b70', paddingBottom: '8px' }}>
            <h4 className="pixel-text" style={{ fontSize: '12px', color: '#a78bfa', margin: 0, fontWeight: 'normal' }}>
              {activeTab === 'map' ? '🗺️ 선택된 타일 정보' : '👤 선택된 스프라이트 정보'}
            </h4>
          </div>

          {activeDisplayTile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#a0a0b8' }}>타일셋 분류:</span>
                <span style={{ fontWeight: 'normal', color: '#fff', fontSize: '11px' }}>{currentOption.name}</span>
              </div>

              {activeDisplayTile.prefixedId !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(139, 92, 246, 0.12)', padding: '6px 8px', borderRadius: 0, border: '1px solid #4a4a6b' }}>
                  <span style={{ color: '#a78bfa', fontWeight: 'normal' }}>맵 타일 ID (Prefixed):</span>
                  <span className="pixel-text" style={{ color: '#fff', fontWeight: 'normal', fontSize: '14px' }}>
                    {activeDisplayTile.prefixedId}
                  </span>
                </div>
              )}

              {/* Character sprite frame details & Action Name Editor & Pixel Art Editor Launcher */}
              {activeTab === 'character' && (
                <div style={{ borderTop: '1px solid #3b3b54', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#ccc' }}>
                    방향 (Direction):{' '}
                    <span style={{ color: '#a78bfa' }}>
                      {currentOption.id === 'pig'
                        ? (activeDisplayTile.col === 0 ? '왼쪽/기본 (Left)' : '걷기 프레임 2')
                        : (activeDisplayTile.col === 0 ? '아래 (Down 0)' : activeDisplayTile.col === 1 ? '위 (Up 1)' : activeDisplayTile.col === 2 ? '왼쪽 (Left 2)' : '오른쪽 (Right 3)')
                      }
                    </span>
                  </div>

                  {/* Editable Action Motion Input for current Row */}
                  <div style={{ background: 'rgba(139, 92, 246, 0.12)', padding: '10px', borderRadius: 0, border: '1px solid #4a4a6b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 'normal' }}>
                        ✏️ 동작 이름:
                      </span>
                      <span style={{ fontSize: '10px', color: '#aaa' }}>
                        (같은 행 {currentOption.cols}개 프레임 공통)
                      </span>
                    </div>
                    <input
                      type="text"
                      value={currentCharRowActions[activeDisplayTile.row] || `동작 ${activeDisplayTile.row + 1}`}
                      onChange={(e) => {
                        const newName = e.target.value;
                        const updatedList = [...currentCharRowActions];
                        updatedList[activeDisplayTile.row] = newName;
                        const updatedAll = {
                          ...charRowActions,
                          [currentSelectedId]: updatedList
                        };
                        setCharRowActions(updatedAll);
                        localStorage.setItem('on_house_char_row_actions', JSON.stringify(updatedAll));
                      }}
                      placeholder="예: 대기, 걷기1, 환호, 공격..."
                      style={{
                        width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b',
                        borderRadius: 0, padding: '6px 10px', color: '#fff', fontSize: '12px',
                        fontWeight: 'normal', outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '10px', color: '#aaa', marginTop: '6px', lineHeight: '1.4' }}>
                      💬 채팅창에서 <span style={{ color: '#89b4fa' }}>/{currentCharRowActions[activeDisplayTile.row] || '동작이름'}</span> 입력 시 게임 내 캐릭터가 이 행의 모션을 실행합니다!
                    </div>
                  </div>

                  {/* 🎨 Launch Pixel Art Editor Button */}
                  <button
                    onClick={() => handleOpenPixelEditor(activeDisplayTile.col, activeDisplayTile.row)}
                    style={{
                      padding: '10px', background: 'linear-gradient(135deg, #89b4fa 0%, #cba6f7 100%)',
                      border: 'none', borderRadius: 0, color: '#11111b', fontSize: '12px',
                      fontWeight: 'normal', cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px', boxShadow: '0 4px 14px rgba(203, 166, 247, 0.4)'
                    }}
                  >
                    <Pencil size={14} /> 🎨 픽셀 도트 직접 그리기 에디터
                  </button>
                </div>
              )}

              {/* Live Scaled Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '8px', borderTop: '1px solid #3b3b54', paddingTop: '10px' }}>
                <span style={{ fontSize: '11px', color: '#a0a0b8' }}>타일 미리보기</span>
                <div style={{
                  width: '64px',
                  height: '64px',
                  backgroundImage: `url(${currentOption.url})`,
                  backgroundPosition: `-${activeDisplayTile.col * 64}px -${activeDisplayTile.row * 64}px`,
                  backgroundSize: `${currentOption.cols * 64}px ${currentOption.rows * 64}px`,
                  imageRendering: 'pixelated',
                  border: '2px solid #a78bfa',
                  borderRadius: 0,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
              마우스 클릭으로 타일을 고정하거나<br />마우스를 타일 위에 올리면<br />상세 정보가 표시됩니다.
            </div>
          )}
        </div>
      </div>

      {/* Floating Right-Click Context Menu for Frame Slot */}
      {contextMenuTile && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: `${contextMenuTile.x}px`,
            top: `${contextMenuTile.y}px`,
            background: '#1e1e2e',
            border: '1px solid var(--accent)',
            borderRadius: '8px',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
            zIndex: 2000,
            minWidth: '150px'
          }}
        >
          <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold', padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            🖼️ 프레임 (행 {contextMenuTile.row}, 열 {contextMenuTile.col}) 메뉴
          </div>

          <button
            onClick={() => {
              handleCopyFrame(contextMenuTile.col, contextMenuTile.row);
              setToastMessage("📋 선택한 프레임이 복사되었습니다! (Ctrl+V로 붙여넣기)");
            }}
            style={{
              background: 'transparent', border: 'none', color: '#fff', padding: '6px 8px',
              fontSize: '11px', textAlign: 'left', borderRadius: '4px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
            className="hover-highlight"
          >
            <Copy size={13} style={{ color: '#89b4fa' }} /> 📋 프레임 복사하기 (Ctrl+C)
          </button>

          <button
            onClick={() => {
              handleCutFrame(contextMenuTile.col, contextMenuTile.row);
              setToastMessage("✂️ 선택한 프레임이 잘라내기 되었습니다!");
            }}
            style={{
              background: 'transparent', border: 'none', color: '#fff', padding: '6px 8px',
              fontSize: '11px', textAlign: 'left', borderRadius: '4px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
            className="hover-highlight"
          >
            <Scissors size={13} style={{ color: '#f9e2af' }} /> ✂️ 프레임 잘라내기 (Ctrl+X)
          </button>

          <button
            disabled={!copiedFrameBuffer}
            onClick={() => {
              handlePasteFrame(contextMenuTile.col, contextMenuTile.row);
              setToastMessage("📥 프레임이 붙여넣기 되었습니다!");
            }}
            style={{
              background: 'transparent', border: 'none',
              color: copiedFrameBuffer ? '#fff' : '#666',
              padding: '6px 8px', fontSize: '11px', textAlign: 'left', borderRadius: '4px',
              cursor: copiedFrameBuffer ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Clipboard size={13} style={{ color: copiedFrameBuffer ? '#a6e3a1' : '#555' }} /> 📥 프레임 붙여넣기 (Ctrl+V)
          </button>

          <button
            onClick={() => {
              handleDeleteFrameColumn(contextMenuTile.col, contextMenuTile.row);
              setToastMessage("🗑️ 프레임이 삭제되었습니다.");
            }}
            style={{
              background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ff6b6b', padding: '6px 8px',
              fontSize: '11px', textAlign: 'left', borderRadius: '4px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold'
            }}
          >
            <Trash size={13} /> 🗑️ 프레임 삭제하기 (Delete)
          </button>
        </div>
      )}

      {/* Toast Feedback Notification Banner */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(24, 24, 37, 0.95)',
          border: '1px solid var(--accent)',
          borderRadius: '8px',
          padding: '10px 18px',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 'bold',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.9)',
          zIndex: 2200,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backdropFilter: 'blur(6px)',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          {toastMessage}
        </div>
      )}

      {/* 1. Modal: Add New Action Row Prompt */}
      {showAddRowModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onClick={() => setShowAddRowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#181825', border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px', padding: '24px', width: '360px',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.9)', color: '#fff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: '#f5c2e7' }}>
                <Plus size={18} /> 새 동작 행 추가
              </div>
              <button onClick={() => setShowAddRowModal(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={(e) => {
              handleAddActionRowSubmit(e);
              setToastMessage("✅ 새로운 동작 행이 추가되었습니다!");
            }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>
                  추가할 동작 이름 (예: 점프, 스킬, 인사):
                </label>
                <input
                  type="text"
                  placeholder="예: 점프, 댄스, 마법공격..."
                  value={newActionNameInput}
                  onChange={(e) => setNewActionNameInput(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%', background: '#0d0d12', border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '12px', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ fontSize: '11px', color: '#888', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                💡 확인을 누르면 스프라이트 시트 하단에 **새로운 행({currentOption.rows + 1}행)**이 추가되며, 기본 픽셀 도트가 템플릿으로 생성됩니다!
              </div>

              <button
                type="submit"
                style={{
                  padding: '10px', background: 'var(--primary)', border: 'none', borderRadius: '6px',
                  color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                ➕ 동작 행 생성하기
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Interactive Pixel Art Editor Studio */}
      {editingTile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onMouseUp={() => {
          setIsMouseDown(false);
          if (isEditorPanning) {
            setIsEditorPanning(false);
            editorPanStartRef.current = null;
          }
        }}
        >
          {/* Hidden File Input for Importing Image into Pixel Grid */}
          <input
            type="file"
            ref={editorFileInputRef}
            accept="image/png, image/jpeg, image/webp"
            style={{ display: 'none' }}
            onChange={(e) => handleImportImageFileSelect(e)}
          />

          <div style={{
            background: '#181825', border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px', padding: '16px', display: 'flex', gap: '16px',
            maxWidth: '520px', width: '92vw', maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.95)', color: '#fff'
          }}>
            {/* Left: Pixel Grid Studio Drawing Board */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#89b4fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Pencil size={15} /> 픽셀 도트 (행 {editingTile.row}, 열 {editingTile.col})
                </div>

                {/* Grid Zoom & Resolution Selectors */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {/* Zoom Scale Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                    <ZoomIn size={11} style={{ color: 'var(--accent)', marginRight: '2px' }} />
                    {([1.0, 1.5, 2.0, 3.0] as const).map((z) => (
                      <button
                        key={z}
                        onClick={() => setEditorZoom(z)}
                        style={{
                          padding: '2px 5px', fontSize: '9px', borderRadius: '3px', border: 'none',
                          background: editorZoom === z ? 'var(--accent)' : 'transparent',
                          color: editorZoom === z ? '#000' : '#ccc', cursor: 'pointer', fontWeight: 'bold'
                        }}
                      >
                        {z}x
                      </button>
                    ))}
                  </div>

                  {/* Grid Resolution Selector (Custom Original, 16x16, 32x32, 64x64) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                    <Grid size={11} style={{ color: 'var(--accent)', marginRight: '2px' }} />
                    {(() => {
                      const rawW = effFrameW || currentOption.frameWidth || 32;
                      const rawH = effFrameH || currentOption.frameHeight || 32;
                      const options: { label: string; w: number; h: number }[] = [];

                      options.push({ label: `원본 (${rawW}x${rawH})`, w: rawW, h: rawH });

                      if (rawW !== 16 || rawH !== 16) options.push({ label: '16x16', w: 16, h: 16 });
                      if (rawW !== 32 || rawH !== 32) options.push({ label: '32x32', w: 32, h: 32 });
                      if (rawW !== 64 || rawH !== 64) options.push({ label: '64x64', w: 64, h: 64 });

                      return options.map((opt) => {
                        const isSelected = editorGridResW === opt.w && editorGridResH === opt.h;
                        return (
                          <button
                            key={`${opt.w}x${opt.h}`}
                            onClick={() => handleChangeGridRes(opt.w, opt.h)}
                            style={{
                              padding: '2px 6px', fontSize: '9px', borderRadius: '3px', border: 'none',
                              background: isSelected ? 'var(--accent)' : 'transparent',
                              color: isSelected ? '#000' : '#ccc', cursor: 'pointer', fontWeight: 'bold'
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              {/* Drawing Tools Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setDrawTool('pencil')}
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: drawTool === 'pencil' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                      color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    <Pencil size={11} /> 연필
                  </button>
                  <button
                    onClick={() => setDrawTool('eraser')}
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: drawTool === 'eraser' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                      color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    <Eraser size={11} /> 지우개
                  </button>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', height: '24px', margin: '0 4px' }} />
                  {[1, 2, 3, 4].map(size => (
                    <button
                      key={`brush-${size}`}
                      onClick={() => setBrushSize(size)}
                      style={{
                        padding: '4px 6px', fontSize: '10px', borderRadius: '4px',
                        background: brushSize === size ? 'var(--accent)' : 'transparent',
                        color: brushSize === size ? '#000' : '#ccc', border: 'none', cursor: 'pointer', fontWeight: 'bold'
                      }}
                      title={`${size}px 브러시 크기`}
                    >
                      {size}px
                    </button>
                  ))}
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', height: '24px', margin: '0 4px' }} />
                  <button
                    onClick={() => {
                      const newGrid = pixelGrid.map((row) => [...row].reverse());
                      setPixelGrid(newGrid);
                    }}
                    title="그려진 도트 그림 좌우 반전"
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid var(--border-glass)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    <FlipHorizontal size={11} /> ↔️ 반전
                  </button>
                  <button
                    onClick={() => setPixelGrid(Array.from({ length: editorGridResH }, () => Array(editorGridResW).fill('transparent')))}
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: 'rgba(239, 68, 68, 0.2)', color: '#ff6b6b', border: '1px solid var(--danger)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    <RotateCcw size={11} /> 초기화
                  </button>
                  <button
                    onClick={() => editorFileInputRef.current?.click()}
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: 'rgba(139, 92, 246, 0.25)', color: 'var(--accent)',
                      border: '1px solid var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                      fontWeight: 'bold'
                    }}
                  >
                    <Upload size={11} /> 📁 불러오기
                  </button>

                  {/* 픽셀 전체 이동 화살표 버튼 4개 (좌, 위, 아래, 우) */}
                  <div style={{ display: 'flex', gap: '2px', marginLeft: '2px' }}>
                    <button
                      onClick={() => {
                        setPixelGrid(prevGrid => {
                          return prevGrid.map((row) => [...row.slice(1), 'transparent']);
                        });
                      }}
                      title="전체 픽셀 왼쪽으로 1px 이동"
                      style={{
                        padding: '4px 6px', fontSize: '10px', borderRadius: '4px',
                        background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid var(--border-glass)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <ArrowLeft size={11} />
                    </button>
                    <button
                      onClick={() => {
                        setPixelGrid(prevGrid => {
                          const resH = prevGrid.length;
                          const resW = prevGrid[0]?.length || 32;
                          const newGrid = Array.from({ length: resH }, () => Array(resW).fill('transparent'));
                          for (let r = 0; r < resH - 1; r++) {
                            newGrid[r] = [...prevGrid[r + 1]];
                          }
                          return newGrid;
                        });
                      }}
                      title="전체 픽셀 위로 1px 이동"
                      style={{
                        padding: '4px 6px', fontSize: '10px', borderRadius: '4px',
                        background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid var(--border-glass)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      onClick={() => {
                        setPixelGrid(prevGrid => {
                          const resH = prevGrid.length;
                          const resW = prevGrid[0]?.length || 32;
                          const newGrid = Array.from({ length: resH }, () => Array(resW).fill('transparent'));
                          for (let r = 1; r < resH; r++) {
                            newGrid[r] = [...prevGrid[r - 1]];
                          }
                          return newGrid;
                        });
                      }}
                      title="전체 픽셀 아래로 1px 이동"
                      style={{
                        padding: '4px 6px', fontSize: '10px', borderRadius: '4px',
                        background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid var(--border-glass)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      onClick={() => {
                        setPixelGrid(prevGrid => {
                          return prevGrid.map((row) => ['transparent', ...row.slice(0, row.length - 1)]);
                        });
                      }}
                      title="전체 픽셀 오른쪽으로 1px 이동"
                      style={{
                        padding: '4px 6px', fontSize: '10px', borderRadius: '4px',
                        background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid var(--border-glass)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <ArrowRight size={11} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '9px', color: '#aaa' }}>
                  <strong style={{ color: 'var(--accent)' }}>{editorGridResW}x{editorGridResH}</strong> ({editorZoom}x)
                </div>
              </div>

              {/* Fit-to-Container Cell Grid Container with Space + Drag Panning */}
              {(() => {
                const maxW = 300;
                const maxH = 300;
                const scaleW = maxW / editorGridResW;
                const scaleH = maxH / editorGridResH;
                const baseScale = Math.min(scaleW, scaleH);
                const cellSizePx = Math.max(0.2, baseScale * editorZoom);
                const boardW = Math.round(editorGridResW * cellSizePx);
                const boardH = Math.round(editorGridResH * cellSizePx);
                const showBorders = editorGridResW <= 48 && editorGridResH <= 48;

                return (
                  <div
                    onMouseDown={(e) => {
                      if (isSpaceDown || e.button === 1) {
                        e.preventDefault();
                        setIsEditorPanning(true);
                        editorPanStartRef.current = {
                          startX: e.clientX,
                          startY: e.clientY,
                          initPanX: editorPan.x,
                          initPanY: editorPan.y
                        };
                      }
                    }}
                    onMouseMove={(e) => {
                      if (isEditorPanning && editorPanStartRef.current) {
                        const dx = e.clientX - editorPanStartRef.current.startX;
                        const dy = e.clientY - editorPanStartRef.current.startY;
                        setEditorPan({
                          x: editorPanStartRef.current.initPanX + dx,
                          y: editorPanStartRef.current.initPanY + dy
                        });
                      }
                    }}
                    onMouseUp={() => {
                      if (isEditorPanning) {
                        setIsEditorPanning(false);
                        editorPanStartRef.current = null;
                      }
                    }}
                    style={{
                      width: '320px', height: '320px', overflow: 'hidden',
                      background: '#0a0a0f', borderRadius: '8px', border: '1px solid var(--border-glass)',
                      padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.8)', margin: '0 auto', boxSizing: 'border-box',
                      cursor: isSpaceDown ? (isEditorPanning ? 'grabbing' : 'grab') : 'default',
                      position: 'relative', userSelect: 'none'
                    }}
                  >
                    {/* Space + Drag Panning Hint Badge & Quick Reset Button */}
                    {(isSpaceDown || editorZoom > 1.0 || editorPan.x !== 0 || editorPan.y !== 0) && (
                      <div style={{
                        position: 'absolute', top: '6px', left: '6px', zIndex: 10,
                        background: 'rgba(0,0,0,0.8)', color: '#89b4fa', fontSize: '9px',
                        padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(137, 180, 250, 0.3)',
                        display: 'flex', alignItems: 'center', gap: '6px'
                      }}>
                        <span>💡 Space + 드래그: 캔버스 이동</span>
                        {(editorPan.x !== 0 || editorPan.y !== 0) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditorPan({ x: 0, y: 0 });
                            }}
                            style={{
                              background: 'rgba(139, 92, 246, 0.4)', color: '#fff',
                              border: 'none', borderRadius: '2px', padding: '1px 4px',
                              fontSize: '9px', cursor: 'pointer', fontWeight: 'bold'
                            }}
                            title="캔버스 위치 중앙 리셋"
                          >
                            🎯 리셋
                          </button>
                        )}
                      </div>
                    )}

                    <div
                      onMouseDown={() => {
                        if (!isSpaceDown && !isEditorPanning) setIsMouseDown(true);
                      }}
                      onMouseLeave={() => setIsMouseDown(false)}
                      style={{
                        width: `${boardW}px`, height: `${boardH}px`,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${editorGridResW}, ${cellSizePx}px)`,
                        gridTemplateRows: `repeat(${editorGridResH}, ${cellSizePx}px)`,
                        background: '#222', border: '2px solid var(--accent)',
                        borderRadius: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                        cursor: isSpaceDown ? (isEditorPanning ? 'grabbing' : 'grab') : 'crosshair',
                        overflow: 'hidden', flexShrink: 0,
                        transform: `translate(${editorPan.x}px, ${editorPan.y}px)`,
                        transition: isEditorPanning ? 'none' : 'transform 0.05s ease-out'
                      }}
                    >
                      {pixelGrid.map((row, y) =>
                        row.map((color, x) => (
                          <div
                            key={`${y}-${x}`}
                            onMouseDown={(e) => {
                              if (isSpaceDown || isEditorPanning || e.button === 1) return;
                              const newGrid = pixelGrid.map((r, ry) =>
                                r.map((c, cx) => (cx >= x && cx < x + brushSize && ry >= y && ry < y + brushSize ? (drawTool === 'pencil' ? selectedColor : 'transparent') : c))
                              );
                              setPixelGrid(newGrid);
                            }}
                            onMouseEnter={() => {
                              if (isMouseDown && !isSpaceDown && !isEditorPanning) {
                                const newGrid = pixelGrid.map((r, ry) =>
                                  r.map((c, cx) => (cx >= x && cx < x + brushSize && ry >= y && ry < y + brushSize ? (drawTool === 'pencil' ? selectedColor : 'transparent') : c))
                                );
                                setPixelGrid(newGrid);
                              }
                            }}
                            style={{
                              width: `${cellSizePx}px`, height: `${cellSizePx}px`,
                              background: color === 'transparent' ? '#0d0d14' : color,
                              boxSizing: 'border-box',
                              borderRight: showBorders ? '1px solid rgba(255,255,255,0.08)' : 'none',
                              borderBottom: showBorders ? '1px solid rgba(255,255,255,0.08)' : 'none'
                            }}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Right: Color Palette & Actions */}
            <div style={{ width: '160px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>
                <Palette size={14} /> 팔레트 색상
              </div>

              {/* Color swatches */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {PALETTE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      if (c === 'transparent') setDrawTool('eraser');
                      else {
                        setSelectedColor(c);
                        setDrawTool('pencil');
                      }
                    }}
                    style={{
                      height: '24px', borderRadius: '3px',
                      background: c === 'transparent' ? '#222' : c,
                      border: selectedColor === c && drawTool === 'pencil' ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                      color: c === 'transparent' ? '#aaa' : 'transparent', fontSize: '8px'
                    }}
                  >
                    {c === 'transparent' ? '지우개' : ''}
                  </button>
                ))}
              </div>

              {/* Custom Color Picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '4px 6px', borderRadius: '4px' }}>
                <span style={{ fontSize: '10px', color: '#ccc' }}>커스텀:</span>
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => {
                    setSelectedColor(e.target.value);
                    setDrawTool('pencil');
                  }}
                  style={{ width: '28px', height: '20px', border: 'none', background: 'none', cursor: 'pointer' }}
                />
              </div>

              {/* Live Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                <span style={{ fontSize: '10px', color: '#aaa' }}>실시간 미리보기</span>
                {(() => {
                  const previewW = Math.max(16, Math.round(52 * (editorGridResW / editorGridResH)));
                  const previewH = 52;
                  const cellW = previewW / editorGridResW;
                  const cellH = previewH / editorGridResH;

                  return (
                    <div
                      style={{
                        width: `${previewW}px`, height: `${previewH}px`, border: '2px solid var(--accent)', borderRadius: '4px',
                        display: 'grid',
                        gridTemplateColumns: `repeat(${editorGridResW}, ${cellW}px)`,
                        gridTemplateRows: `repeat(${editorGridResH}, ${cellH}px)`,
                        background: '#111', overflow: 'hidden'
                      }}
                    >
                      {pixelGrid.map((row, y) =>
                        row.map((color, x) => (
                          <div key={`p-${y}-${x}`} style={{ background: color === 'transparent' ? 'transparent' : color }} />
                        ))
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Save / Cancel buttons */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={handleSavePixelEditor}
                  style={{
                    padding: '8px', background: 'var(--primary)', border: 'none', borderRadius: '6px',
                    color: '#fff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                  }}
                >
                  <Save size={13} /> 💾 도트 반영
                </button>
                <button
                  onClick={() => setEditingTile(null)}
                  style={{
                    padding: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)',
                    borderRadius: '6px', color: '#ccc', fontSize: '10px', cursor: 'pointer'
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2.5 Modal: Interactive Image Crop Modal with Mouse Drag, Keyboard Arrows & Number Inputs */}
      {cropModalImage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onMouseMove={handleCropBoxMouseMove}
        onMouseUp={() => setIsBoxDragging(false)}
        onClick={() => setCropModalImage(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#181825', border: '1px solid var(--accent)',
              borderRadius: '16px', padding: '24px', width: '520px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.95)', color: '#fff',
              display: 'flex', flexDirection: 'column', gap: '16px'
            }}
          >
            {/* Crop Header with Zoom Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Crop size={18} /> ✂️ 이미지 영역 잘라내기 (Crop)
              </div>

              {/* Image Zoom Control Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                <ZoomIn size={13} style={{ color: 'var(--accent)', marginRight: '2px' }} />
                <span style={{ fontSize: '10px', color: '#aaa', marginRight: '4px' }}>보기 확대:</span>
                {([0.5, 1.0, 2.0, 3.0, 4.0] as const).map((z) => (
                  <button
                    key={z}
                    onClick={() => setCropZoom(z)}
                    style={{
                      padding: '3px 6px', fontSize: '10px', borderRadius: '4px', border: 'none',
                      background: cropZoom === z ? 'var(--accent)' : 'transparent',
                      color: cropZoom === z ? '#000' : '#ccc', cursor: 'pointer', fontWeight: 'bold'
                    }}
                  >
                    {z}x
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCropModalImage(null)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '11px', color: '#aaa', lineHeight: '1.4' }}>
              💡 마우스로 **선택 박스를 끌거나** 키보드 **화살표 키(Arrow Keys)**로 미세 조정하세요. (Shift+화살표: 10px 이동)
            </div>

            {/* Scrollable Image Viewport Canvas Container */}
            <div
              ref={cropViewportRef}
              style={{
                width: '100%', height: '300px', overflow: 'auto',
                background: '#0d0d12', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px'
              }}
            >
              {/* Scaled Exact Pixel Image Container */}
              <div
                onClick={handleCropContainerClick}
                style={{
                  position: 'relative',
                  width: `${cropImgWidth * cropZoom}px`,
                  height: `${cropImgHeight * cropZoom}px`,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                  cursor: 'crosshair',
                  margin: 'auto'
                }}
              >
                {/* Source Image */}
                <img
                  src={cropModalImage}
                  alt="Source Crop Preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    imageRendering: 'pixelated',
                    display: 'block'
                  }}
                />

                {/* 100% PERFECT SQUARE Draggable Crop Box Overlay */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsBoxDragging(true);
                    setBoxDragStart({
                      startX: e.clientX,
                      startY: e.clientY,
                      initRectX: cropRect.x,
                      initRectY: cropRect.y
                    });
                  }}
                  style={{
                    position: 'absolute',
                    left: `${cropRect.x * cropZoom}px`,
                    top: `${cropRect.y * cropZoom}px`,
                    width: `${cropRect.w * cropZoom}px`,
                    height: `${cropRect.w * cropZoom}px`, // Always equal width & height -> PERFECT SQUARE!
                    border: '2px solid #ff79c6',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                    boxSizing: 'border-box',
                    cursor: 'grab',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '-22px', left: '0px',
                    fontSize: '10px', background: '#ff79c6', color: '#111',
                    fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px',
                    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
                  }}>
                    <Move size={10} /> {cropRect.w} × {cropRect.w} px
                  </div>
                </div>
              </div>
            </div>

            {/* Micro-Adjustment Controls with Direct Number Keyboard Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                <span style={{ width: '90px', color: '#ccc' }}>↔️ X 위치:</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, cropImgWidth - cropRect.w)}
                  value={cropRect.x}
                  onChange={(e) => setCropRect((prev) => ({ ...prev, x: parseInt(e.target.value, 10) }))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropImgWidth - cropRect.w)}
                  value={cropRect.x}
                  onChange={(e) => {
                    const val = parseInt(e.target.value || '0', 10);
                    setCropRect((prev) => ({ ...prev, x: Math.max(0, Math.min(cropImgWidth - prev.w, isNaN(val) ? 0 : val)) }));
                  }}
                  style={{ width: '56px', background: '#0d0d12', border: '1px solid var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '10px', color: '#aaa' }}>px</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                <span style={{ width: '90px', color: '#ccc' }}>↕️ Y 위치:</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, cropImgHeight - cropRect.h)}
                  value={cropRect.y}
                  onChange={(e) => setCropRect((prev) => ({ ...prev, y: parseInt(e.target.value, 10) }))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropImgHeight - cropRect.h)}
                  value={cropRect.y}
                  onChange={(e) => {
                    const val = parseInt(e.target.value || '0', 10);
                    setCropRect((prev) => ({ ...prev, y: Math.max(0, Math.min(cropImgHeight - prev.h, isNaN(val) ? 0 : val)) }));
                  }}
                  style={{ width: '56px', background: '#0d0d12', border: '1px solid var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '10px', color: '#aaa' }}>px</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                <span style={{ width: '90px', color: '#ccc' }}>📐 잘라내기 크기:</span>
                <input
                  type="range"
                  min={8}
                  max={Math.min(cropImgWidth, cropImgHeight)}
                  value={cropRect.w}
                  onChange={(e) => {
                    const newW = parseInt(e.target.value, 10);
                    setCropRect((prev) => ({
                      x: Math.min(prev.x, cropImgWidth - newW),
                      y: Math.min(prev.y, cropImgHeight - newW),
                      w: newW,
                      h: newW
                    }));
                  }}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={8}
                  max={Math.min(cropImgWidth, cropImgHeight)}
                  value={cropRect.w}
                  onChange={(e) => {
                    const newW = Math.max(8, Math.min(Math.min(cropImgWidth, cropImgHeight), parseInt(e.target.value || '8', 10)));
                    setCropRect((prev) => ({
                      x: Math.min(prev.x, cropImgWidth - newW),
                      y: Math.min(prev.y, cropImgHeight - newW),
                      w: newW,
                      h: newW
                    }));
                  }}
                  style={{ width: '56px', background: '#0d0d12', border: '1px solid var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '10px', color: '#aaa' }}>px</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleConfirmCropImport}
                style={{
                  flex: 1, padding: '10px', background: 'var(--primary)', border: 'none',
                  borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 'bold',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Check size={15} /> ✂️ 선택 영역 픽셀 보드에 불러오기
              </button>
              <button
                onClick={() => setCropModalImage(null)}
                style={{
                  padding: '10px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)',
                  borderRadius: '6px', color: '#ccc', fontSize: '11px', cursor: 'pointer'
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Add Custom Asset Upload / Creation Modal */}
      {showUploadModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onClick={() => {
          if (!isSavingAsset) setShowUploadModal(false);
        }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              background: '#161622', border: '1px solid #3b3b54',
              borderRadius: 0, padding: '14px 18px', width: fileDataUrl ? '500px' : '400px',
              maxWidth: '94vw', maxHeight: '94vh', overflowY: 'auto',
              scrollbarWidth: 'none', msOverflowStyle: 'none',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.95)', color: '#fff'
            }}
          >
            {/* Loading Overlay during Supabase DB / Image processing */}
            {isSavingAsset && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(22, 22, 34, 0.95)', backdropFilter: 'blur(6px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '10px', zIndex: 50, padding: '16px',
                textAlign: 'center'
              }}>
                <Loader2 size={36} style={{ color: '#a78bfa' }} className="animate-spin" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'normal', color: '#fff', marginBottom: '3px' }}>
                    {saveProgressText || '💾 에셋 처리 및 서버 저장 중...'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#aaa' }}>
                    이미지 업로드 및 DB 동기화가 진행 중입니다. 잠시만 기다려 주세요!
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              {/* Renamed Modal Title to "➕ 추가" */}
              <div style={{ fontSize: '14px', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '6px', color: '#a78bfa' }}>
                <Plus size={16} /> 추가
              </div>
              <button
                disabled={isSavingAsset}
                onClick={() => setShowUploadModal(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: isSavingAsset ? 'not-allowed' : 'pointer' }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomAsset} style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {/* Combine Category & Asset Name on 1 Row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ width: '140px', flexShrink: 0 }}>
                  <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '2px' }}>에셋 분류:</label>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    <button
                      type="button"
                      onClick={() => handleCategorySwitch('character')}
                      disabled={isSavingAsset}
                      style={{
                        flex: 1, padding: '4px 2px', fontSize: '11px', borderRadius: 0,
                        background: uploadCategory === 'character' ? '#252538' : '#14141e',
                        color: uploadCategory === 'character' ? '#fff' : '#8a8a9e',
                        border: uploadCategory === 'character' ? '1px solid #a78bfa' : '1px solid #28283a',
                        cursor: isSavingAsset ? 'not-allowed' : 'pointer', fontWeight: 'normal', height: '28px'
                      }}
                    >
                      👤 캐릭터
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCategorySwitch('map')}
                      disabled={isSavingAsset}
                      style={{
                        flex: 1, padding: '4px 2px', fontSize: '11px', borderRadius: 0,
                        background: uploadCategory === 'map' ? '#252538' : '#14141e',
                        color: uploadCategory === 'map' ? '#fff' : '#8a8a9e',
                        border: uploadCategory === 'map' ? '1px solid #a78bfa' : '1px solid #28283a',
                        cursor: isSavingAsset ? 'not-allowed' : 'pointer', fontWeight: 'normal', height: '28px'
                      }}
                    >
                      🗺️ 맵
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '2px' }}>에셋 이름:</label>
                  <input
                    type="text"
                    placeholder={uploadCategory === 'character' ? "예: 🐶 귀여운 강아지" : "예: 🎨 마법 던전 타일"}
                    value={assetNameInput}
                    disabled={isSavingAsset}
                    onChange={(e) => setAssetNameInput(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b',
                      borderRadius: 0, padding: '4px 8px', color: '#fff', fontSize: '11px', outline: 'none',
                      boxSizing: 'border-box', fontWeight: 'normal', height: '28px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap' }}>
                    {uploadCategory === 'character' ? "프레임 크기 (px):" : "타일 크기 (px):"}
                  </label>
                  <select
                    value={isCustomFrameSize ? 'custom' : tileSizeInput}
                    disabled={isSavingAsset}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomFrameSize(true);
                      } else {
                        setIsCustomFrameSize(false);
                        const val = parseInt(e.target.value, 10);
                        handleTileSizeSelect(val);
                        setCustomFrameWidthInput(val);
                        setCustomFrameHeightInput(val);
                      }
                    }}
                    style={{
                      width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b',
                      borderRadius: 0, padding: '4px 6px', color: '#fff', fontSize: '11px', outline: 'none',
                      fontWeight: 'normal', height: '28px', boxSizing: 'border-box'
                    }}
                  >
                    <option value={16}>16 x 16 px (레트로 / 도트 표준)</option>
                    <option value={32}>32 x 32 px (HD 픽셀 타일 규격)</option>
                    <option value={48}>48 x 48 px (RPG Maker 규격)</option>
                    <option value={64}>64 x 64 px (고해상도 HD 규격)</option>
                    <option value="custom">✏️ 사용자 정의 규격 (가로x세로)</option>
                  </select>
                </div>

                <div style={{ flex: 1, display: 'flex', gap: '4px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: '#a78bfa', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap' }}>가로 열 수:</label>
                    <input
                      type="number"
                      min={1}
                      max={256}
                      value={customColsInput}
                      disabled={isSavingAsset}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setCustomColsInput('');
                          return;
                        }
                        const cols = parseInt(valStr, 10);
                        if (!isNaN(cols)) setCustomColsInput(cols);
                      }}
                      onBlur={() => {
                        if (customColsInput === '' || customColsInput <= 0) setCustomColsInput(4);
                      }}
                      style={{ width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b', borderRadius: 0, padding: '4px 6px', color: '#fff', fontSize: '11px', textAlign: 'center', outline: 'none', fontWeight: 'normal', height: '28px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: '#a78bfa', display: 'block', marginBottom: '2px', whiteSpace: 'nowrap' }}>세로 행 수:</label>
                    <input
                      type="number"
                      min={1}
                      max={256}
                      value={customRowsInput}
                      disabled={isSavingAsset}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setCustomRowsInput('');
                          return;
                        }
                        const rows = parseInt(valStr, 10);
                        if (!isNaN(rows)) setCustomRowsInput(rows);
                      }}
                      onBlur={() => {
                        if (customRowsInput === '' || customRowsInput <= 0) setCustomRowsInput(7);
                      }}
                      style={{ width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b', borderRadius: 0, padding: '4px 6px', color: '#fff', fontSize: '11px', textAlign: 'center', outline: 'none', fontWeight: 'normal', height: '28px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* Custom Frame Size & Start Offsets (X, Y 시작점) Controls */}
              {(isCustomFrameSize || (uploadCategory === 'character' && fileDataUrl)) && (
                <div style={{ background: '#101018', padding: '6px 8px', border: '1px solid #3b3b54', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 'normal', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                    <span>📐 프레임 해상도 & 시작 오프셋</span>
                    {imgWidth > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const cols = typeof customColsInput === 'number' && customColsInput > 0 ? customColsInput : 4;
                          const rows = typeof customRowsInput === 'number' && customRowsInput > 0 ? customRowsInput : 7;
                          const offX = typeof customOffsetXInput === 'number' ? customOffsetXInput : 0;
                          const offY = typeof customOffsetYInput === 'number' ? customOffsetYInput : 0;
                          setCustomFrameWidthInput(Math.max(1, Math.round((imgWidth - offX) / cols)));
                          setCustomFrameHeightInput(Math.max(1, Math.round((imgHeight - offY) / rows)));
                        }}
                        style={{
                          fontSize: '9px', color: '#a78bfa', background: '#252538',
                          border: '1px solid #4a4a6b', padding: '1px 5px', cursor: 'pointer',
                          borderRadius: 0
                        }}
                      >
                        ⚡ 자동 맞춤
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '9px', color: '#ccc', display: 'block', marginBottom: '1px' }}>
                        가로(px):
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1024}
                        value={customFrameWidthInput}
                        disabled={isSavingAsset}
                        onChange={(e) => {
                          setIsCustomFrameSize(true);
                          const valStr = e.target.value;
                          if (valStr === '') {
                            setCustomFrameWidthInput('');
                            return;
                          }
                          const w = parseInt(valStr, 10);
                          if (!isNaN(w)) setCustomFrameWidthInput(w);
                        }}
                        onBlur={() => {
                          if (customFrameWidthInput === '' || customFrameWidthInput <= 0) setCustomFrameWidthInput(tileSizeInput || 32);
                        }}
                        style={{ width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b', borderRadius: 0, padding: '3px 4px', color: '#fff', fontSize: '10px', textAlign: 'center', height: '24px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '9px', color: '#ccc', display: 'block', marginBottom: '1px' }}>
                        세로(px):
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1024}
                        value={customFrameHeightInput}
                        disabled={isSavingAsset}
                        onChange={(e) => {
                          setIsCustomFrameSize(true);
                          const valStr = e.target.value;
                          if (valStr === '') {
                            setCustomFrameHeightInput('');
                            return;
                          }
                          const h = parseInt(valStr, 10);
                          if (!isNaN(h)) setCustomFrameHeightInput(h);
                        }}
                        onBlur={() => {
                          if (customFrameHeightInput === '' || customFrameHeightInput <= 0) setCustomFrameHeightInput(tileSizeInput || 32);
                        }}
                        style={{ width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b', borderRadius: 0, padding: '3px 4px', color: '#fff', fontSize: '10px', textAlign: 'center', height: '24px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '9px', color: '#ffd700', display: 'block', marginBottom: '1px' }}>
                        시작 X:
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={1024}
                        value={customOffsetXInput}
                        disabled={isSavingAsset}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          if (valStr === '') {
                            setCustomOffsetXInput('');
                            return;
                          }
                          const offX = parseInt(valStr, 10);
                          if (!isNaN(offX)) setCustomOffsetXInput(Math.max(0, offX));
                        }}
                        onBlur={() => {
                          if (customOffsetXInput === '') setCustomOffsetXInput(0);
                        }}
                        style={{ width: '100%', background: '#0d0d12', border: '1px solid #ffd700', borderRadius: 0, padding: '3px 4px', color: '#fff', fontSize: '10px', textAlign: 'center', height: '24px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '9px', color: '#ffd700', display: 'block', marginBottom: '1px' }}>
                        시작 Y:
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={1024}
                        value={customOffsetYInput}
                        disabled={isSavingAsset}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          if (valStr === '') {
                            setCustomOffsetYInput('');
                            return;
                          }
                          const offY = parseInt(valStr, 10);
                          if (!isNaN(offY)) setCustomOffsetYInput(Math.max(0, offY));
                        }}
                        onBlur={() => {
                          if (customOffsetYInput === '') setCustomOffsetYInput(0);
                        }}
                        style={{ width: '100%', background: '#0d0d12', border: '1px solid #ffd700', borderRadius: 0, padding: '3px 4px', color: '#fff', fontSize: '10px', textAlign: 'center', height: '24px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Spacing & Margin Controls for Map Tilesets */}
              {uploadCategory === 'map' && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>✏️ 타일 간격 (Spacing px):</label>
                    <input
                      type="number"
                      min={0}
                      max={128}
                      value={customSpacingInput}
                      disabled={isSavingAsset}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setCustomSpacingInput('');
                          return;
                        }
                        const space = parseInt(valStr, 10);
                        if (!isNaN(space)) handleSpacingChange(Math.max(0, space));
                      }}
                      onBlur={() => {
                        if (customSpacingInput === '') setCustomSpacingInput(0);
                      }}
                      style={{ width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b', borderRadius: 0, padding: '4px 6px', color: '#fff', fontSize: '11px', textAlign: 'center', outline: 'none', fontWeight: 'normal', height: '28px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: '#a78bfa', display: 'block', marginBottom: '2px' }}>외곽 여백 X (Margin X):</label>
                    <input
                      type="number"
                      min={0}
                      max={128}
                      value={customMarginXInput}
                      disabled={isSavingAsset}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setCustomMarginXInput('');
                          return;
                        }
                        const margin = parseInt(valStr, 10);
                        if (!isNaN(margin)) {
                          const mX = Math.max(0, margin);
                          setCustomMarginXInput(mX);
                          recalculateDimensions(tileSizeInput, mX, typeof customMarginYInput === 'number' ? customMarginYInput : 0, typeof customSpacingInput === 'number' ? customSpacingInput : 0);
                        }
                      }}
                      onBlur={() => {
                        if (customMarginXInput === '') setCustomMarginXInput(0);
                      }}
                      style={{ width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b', borderRadius: 0, padding: '4px 6px', color: '#fff', fontSize: '11px', textAlign: 'center', outline: 'none', fontWeight: 'normal', height: '28px', boxSizing: 'border-box' }}
                    />
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '10px', color: '#a78bfa', display: 'block', marginBottom: '2px' }}>외곽 여백 Y (Margin Y):</label>
                    <input
                      type="number"
                      min={0}
                      max={128}
                      value={customMarginYInput}
                      disabled={isSavingAsset}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setCustomMarginYInput('');
                          return;
                        }
                        const margin = parseInt(valStr, 10);
                        if (!isNaN(margin)) {
                          const mY = Math.max(0, margin);
                          setCustomMarginYInput(mY);
                          recalculateDimensions(tileSizeInput, typeof customMarginXInput === 'number' ? customMarginXInput : 0, mY, typeof customSpacingInput === 'number' ? customSpacingInput : 0);
                        }
                      }}
                      onBlur={() => {
                        if (customMarginYInput === '') setCustomMarginYInput(0);
                      }}
                      style={{ width: '100%', background: '#0d0d12', border: '1px solid #4a4a6b', borderRadius: 0, padding: '4px 6px', color: '#fff', fontSize: '11px', textAlign: 'center', outline: 'none', fontWeight: 'normal', height: '28px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '2px' }}>
                  {uploadCategory === 'character' ? "이미지 파일 선택 (선택 사항):" : "이미지 파일 선택 (필수):"}
                </label>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  disabled={isSavingAsset}
                  onChange={handleFileChange}
                  style={{
                    fontSize: '10px', color: '#ccc', background: '#101018',
                    padding: '4px 6px', borderRadius: 0, width: '100%', boxSizing: 'border-box',
                    border: '1px dashed #4a4a6b'
                  }}
                />
              </div>

              {uploadCategory === 'character' && !fileDataUrl && (
                <div style={{ fontSize: '10px', color: '#888', background: '#101018', padding: '5px 8px', borderRadius: 0, border: '1px solid #28283a' }}>
                  💡 이미지 파일 없이 에셋 이름만 입력하셔도 <strong>새로운 픽셀 캐릭터 에셋</strong>이 즉시 등록되어 에디터로 그리실 수 있습니다!
                </div>
              )}

              {/* Interactive Live Grid Preview Overlay Box with Zoom Controls & Panning Viewport */}
              {fileDataUrl && (
                <div style={{ background: '#101018', padding: '8px', borderRadius: 0, border: '1px solid #3b3b54', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      👁️ 미리보기 격자 분할 확인 ({imgWidth}x{imgHeight}px)
                    </span>

                    {/* Preview Zoom Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#1c1c2b', padding: '1px 3px', border: '1px solid #4a4a6b' }}>
                      <span style={{ fontSize: '9px', color: '#aaa', marginRight: '2px' }}>🔎 확대:</span>
                      {[
                        { label: '맞춤', value: 1.0 },
                        { label: '1.5x', value: 1.5 },
                        { label: '2.0x', value: 2.0 },
                        { label: '3.0x', value: 3.0 },
                        { label: '4.0x', value: 4.0 }
                      ].map((zOpt) => (
                        <button
                          key={zOpt.label}
                          type="button"
                          onClick={() => setPreviewZoom(zOpt.value)}
                          style={{
                            padding: '1px 5px', fontSize: '9px', borderRadius: 0, border: 'none',
                            background: previewZoom === zOpt.value ? '#a78bfa' : 'transparent',
                            color: previewZoom === zOpt.value ? '#000' : '#ccc', cursor: 'pointer',
                            fontWeight: 'normal'
                          }}
                        >
                          {zOpt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chroma Key Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#181824', padding: '4px 8px', border: '1px solid #3b3b54' }}>
                    <button
                      type="button"
                      onClick={() => setIsChromaMode(!isChromaMode)}
                      style={{
                        padding: '4px 8px', fontSize: '10px', background: isChromaMode ? '#ff79c6' : '#282a36',
                        color: isChromaMode ? '#000' : '#fff', border: '1px solid #4a4a6b', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      🪄 {isChromaMode ? '배경색 스포이드 활성화됨' : '배경 투명화 (크로마키)'}
                    </button>
                    {chromaColor && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                          width: '14px', height: '14px', border: '1px solid #fff',
                          background: `rgb(${chromaColor.r}, ${chromaColor.g}, ${chromaColor.b})`
                        }} title="제거된 배경색" />
                        
                        <label style={{ fontSize: '9px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          오차 허용(Tolerance):
                          <input 
                            type="range" min="0" max="150" value={chromaTolerance}
                            onChange={(e) => setChromaTolerance(parseInt(e.target.value))}
                            style={{ width: '60px' }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setChromaColor(null);
                            setIsChromaMode(false);
                            if (originalFileDataUrl) setFileDataUrl(originalFileDataUrl);
                          }}
                          style={{ padding: '2px 6px', fontSize: '9px', background: '#444', color: '#fff', border: 'none', cursor: 'pointer' }}
                        >
                          초기화
                        </button>
                      </div>
                    )}
                  </div>

                  <div 
                    ref={previewContainerRef}
                    onPointerDown={(e) => {
                      if (isSpaceDown && previewZoom > 1.0 && previewContainerRef.current) {
                        setIsPanning(true);
                        panStartRef.current = {
                          x: e.clientX,
                          y: e.clientY,
                          scrollL: previewContainerRef.current.scrollLeft,
                          scrollT: previewContainerRef.current.scrollTop
                        };
                      }
                    }}
                    onPointerMove={(e) => {
                      if (isPanning && previewContainerRef.current) {
                        const dx = e.clientX - panStartRef.current.x;
                        const dy = e.clientY - panStartRef.current.y;
                        previewContainerRef.current.scrollLeft = panStartRef.current.scrollL - dx;
                        previewContainerRef.current.scrollTop = panStartRef.current.scrollT - dy;
                      }
                    }}
                    onPointerUp={() => setIsPanning(false)}
                    onPointerLeave={() => setIsPanning(false)}
                    style={{
                    position: 'relative', width: '100%', height: '180px', background: '#0a0a0f',
                    borderRadius: 0, border: '1px solid #3b3b54',
                    overflow: previewZoom > 1.0 ? 'auto' : 'hidden',
                    scrollbarWidth: 'none', msOverflowStyle: 'none',
                    display: 'block', padding: previewZoom > 1.0 ? '8px' : 0,
                    cursor: isSpaceDown && previewZoom > 1.0 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                    userSelect: 'none'
                  }}>
                    {previewZoom === 1.0 ? (
                      /* Fit Mode (Pixel-Exact Aspect Ratio Container & Scaled Overlay) */
                      (() => {
                        const fitScale = Math.min(460 / (imgWidth || 1), 176 / (imgHeight || 1));
                        const fitW = imgWidth * fitScale;
                        const fitH = imgHeight * fitScale;

                        return (
                          <div style={{
                            position: 'relative',
                            width: `${fitW}px`,
                            height: `${fitH}px`,
                            margin: 'auto',
                            backgroundImage: `url(${fileDataUrl})`,
                            backgroundSize: '100% 100%',
                            backgroundRepeat: 'no-repeat',
                            imageRendering: 'pixelated'
                          }}>
                            {/* Grid Lines Overlay */}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                              <GridOverlayCanvas
                                cols={typeof customColsInput === 'number' ? customColsInput : 4}
                                rows={typeof customRowsInput === 'number' ? customRowsInput : 7}
                                frameW={typeof customFrameWidthInput === 'number' && customFrameWidthInput > 0 ? customFrameWidthInput : (tileSizeInput || 32)}
                                frameH={typeof customFrameHeightInput === 'number' && customFrameHeightInput > 0 ? customFrameHeightInput : (tileSizeInput || 32)}
                                offX={uploadCategory === 'character' ? (typeof customOffsetXInput === 'number' ? customOffsetXInput : 0) : (typeof customMarginXInput === 'number' ? customMarginXInput : 0)}
                                offY={uploadCategory === 'character' ? (typeof customOffsetYInput === 'number' ? customOffsetYInput : 0) : (typeof customMarginYInput === 'number' ? customMarginYInput : 0)}
                                spacing={typeof customSpacingInput === 'number' ? customSpacingInput : 0}
                                zoom={fitScale}
                                actualWidth={fitW}
                                actualHeight={fitH}
                                isChromaMode={isChromaMode}
                                onChromaClick={handleChromaClick}
                              />
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      /* Magnified Zoomed Mode (Exact Pixel Scrollable Canvas) */
                      <div style={{
                        position: 'relative',
                        width: `${imgWidth * previewZoom}px`,
                        height: `${imgHeight * previewZoom}px`,
                        margin: 'auto',
                        backgroundImage: `url(${fileDataUrl})`,
                        backgroundSize: `${imgWidth * previewZoom}px ${imgHeight * previewZoom}px`,
                        backgroundRepeat: 'no-repeat',
                        imageRendering: 'pixelated'
                      }}>
                        {/* Grid Lines Overlay */}
                        <GridOverlayCanvas
                          cols={typeof customColsInput === 'number' ? customColsInput : 4}
                          rows={typeof customRowsInput === 'number' ? customRowsInput : 7}
                          frameW={typeof customFrameWidthInput === 'number' ? customFrameWidthInput : tileSizeInput}
                          frameH={typeof customFrameHeightInput === 'number' ? customFrameHeightInput : tileSizeInput}
                          offX={uploadCategory === 'character' ? (typeof customOffsetXInput === 'number' ? customOffsetXInput : 0) : (typeof customMarginXInput === 'number' ? customMarginXInput : 0)}
                          offY={uploadCategory === 'character' ? (typeof customOffsetYInput === 'number' ? customOffsetYInput : 0) : (typeof customMarginYInput === 'number' ? customMarginYInput : 0)}
                          spacing={typeof customSpacingInput === 'number' ? customSpacingInput : 0}
                          zoom={previewZoom}
                          actualWidth={imgWidth * previewZoom}
                          actualHeight={imgHeight * previewZoom}
                          isChromaMode={isChromaMode}
                          onChromaClick={handleChromaClick}
                        />
                      </div>
                    )}
                  </div>

                  {/* Calculation summary badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#ccc', background: 'rgba(139, 92, 246, 0.12)', padding: '4px 8px', borderRadius: 0, border: '1px solid #4a4a6b' }}>
                    <span>분할 결과: <span style={{ color: '#fff' }}>{customColsInput || 0}열 x {customRowsInput || 0}행</span></span>
                    <span className="pixel-text" style={{ color: '#a78bfa', fontWeight: 'normal' }}>
                      총 {(typeof customColsInput === 'number' ? customColsInput : 0) * (typeof customRowsInput === 'number' ? customRowsInput : 0)}개 프레임 ({typeof customFrameWidthInput === 'number' ? customFrameWidthInput : 0}x{typeof customFrameHeightInput === 'number' ? customFrameHeightInput : 0}px/프레임)
                    </span>
                  </div>
                </div>
              )}

              {/* Submit Button with Loading Indicator */}
              <button
                type="submit"
                disabled={isSavingAsset || (uploadCategory === 'character' ? !assetNameInput.trim() : !fileDataUrl)}
                style={{
                  marginTop: '4px', padding: '8px',
                  background: isSavingAsset ? '#e5c07b' : ((uploadCategory === 'character' ? assetNameInput.trim() : fileDataUrl) ? '#a78bfa' : '#333348'),
                  border: 'none', borderRadius: 0, color: isSavingAsset ? '#000' : '#111', fontSize: '12px',
                  fontWeight: 'normal', cursor: (isSavingAsset || (uploadCategory === 'character' ? !assetNameInput.trim() : !fileDataUrl)) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  transition: 'all 0.2s ease', height: '32px'
                }}
              >
                {isSavingAsset ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> {saveProgressText || '💾 에셋 저장 중...'}
                  </>
                ) : (
                  <>
                    <Save size={14} /> 💾 저장하기
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Open Market Share Modal */}
      {showPublishModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 5, 14, 0.95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px', borderRadius: 0
        }}>
          <form
            onSubmit={handlePublishAssetToMarket}
            style={{
              width: '440px', maxWidth: '92vw', background: '#12121c',
              border: '1px solid #a78bfa', padding: '24px', display: 'flex',
              flexDirection: 'column', gap: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.95)',
              color: '#ffffff'
            }}
          >
            <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🛒 오픈 마켓 상점에 에셋 공유
            </h3>

            <div style={{ fontSize: '11px', color: '#aaa', background: '#191928', padding: '8px 10px', border: '1px solid #2d2d44' }}>
              공유된 에셋은 온하우스의 모든 유저가 내 하우스로 자유롭게 가져가 소장하고 편집할 수 있습니다!
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#ccc', display: 'block', marginBottom: '4px' }}>📌 에셋 제목:</label>
              <input
                type="text"
                value={publishTitle}
                onChange={(e) => setPublishTitle(e.target.value)}
                placeholder="예: 레트로 닌자 캐릭터 32x32"
                required
                style={{ width: '100%', background: '#09090f', border: '1px solid #4a4a6b', padding: '6px 8px', color: '#fff', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#ccc', display: 'block', marginBottom: '4px' }}>📝 간단한 소개 / 설명:</label>
              <textarea
                value={publishDesc}
                onChange={(e) => setPublishDesc(e.target.value)}
                placeholder="에셋에 대한 설명이나 크리에이터 한마디를 적어주세요."
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
  </AssetViewerErrorBoundary>
);
};
