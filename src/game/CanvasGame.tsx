import React, { useRef, useEffect, useState } from 'react';
import { type MapDefinition } from './MapData';
import type { PlayerState } from './syncManager';
import { getDyedSprite } from './spriteDyer';

// Image asset paths (relative to root)
import interiorTilesUrl from '../assets/interior_tiles.png';
import outdoorTilesUrl from '../assets/outdoor_tiles.png';
import villageTilesUrl from '../assets/village_tiles.png';
import wallTilesUrl from '../assets/wall_tiles.png';
import houseTilesUrl from '../assets/house_tiles.png';
import natureTilesUrl from '../assets/nature_tiles.png';
import waterTilesUrl from '../assets/water_tiles.png';
import fieldTilesUrl from '../assets/field_tiles.png';
import ninjaBlueUrl from '../assets/ninja_blue.png';
import samuraiBlueUrl from '../assets/samurai_blue.png';
import samuraiGreenUrl from '../assets/samurai_green.png';
import pigUrl from '../assets/pig.png';

interface CanvasGameProps {
  localPlayer: PlayerState;
  otherPlayers: Record<string, PlayerState>;
  offlinePlayers: Record<string, PlayerState>;
  currentMapId: string;
  chatBubbles: Record<string, { text: string; time: number }>;
  onMove: (x: number, y: number, dir: 'down' | 'up' | 'left' | 'right', isMoving: boolean) => void;
  onPlayerClick: (player: PlayerState) => void;
  
  // Editor Props
  isEditMode: boolean;
  selectedTile: number;
  editLayer: 'base' | 'decor' | 'collision';
  onPaintTile: (tx: number, ty: number, tileIdx: number, layer: 'base' | 'decor' | 'collision') => void;
  mapData: MapDefinition;
  brushSize: number; // 1 = 1x1, 2 = 2x2, 3 = 3x3, etc.
}

export const getTileDrawInfo = (idx: number, defaultTileset: string) => {
  if (idx === -1 || idx === undefined || idx === null) return null;
  let tilesetKey = defaultTileset;
  let localIdx = idx;

  if (idx >= 8000) {
    tilesetKey = 'field';
    localIdx = idx - 8000;
  } else if (idx >= 7000) {
    tilesetKey = 'water';
    localIdx = idx - 7000;
  } else if (idx >= 6000) {
    tilesetKey = 'nature';
    localIdx = idx - 6000;
  } else if (idx >= 5000) {
    tilesetKey = 'house';
    localIdx = idx - 5000;
  } else if (idx >= 4000) {
    tilesetKey = 'wall';
    localIdx = idx - 4000;
  } else if (idx >= 3000) {
    tilesetKey = 'village';
    localIdx = idx - 3000;
  } else if (idx >= 2000) {
    tilesetKey = 'outdoor';
    localIdx = idx - 2000;
  } else if (idx >= 1000) {
    tilesetKey = 'interior';
    localIdx = idx - 1000;
  }

  return { tilesetKey, localIdx };
};

export const getTilesetInfo = (ts: string) => {
  switch (ts) {
    case 'interior':
      return { cols: 22, rows: 17, label: '🏠 실내 인테리어' };
    case 'outdoor':
      return { cols: 22, rows: 26, label: '🏙️ 실외 바닥/도시' };
    case 'village':
      return { cols: 20, rows: 12, label: '🌳 자연/마을 외곽' };
    case 'wall':
      return { cols: 10, rows: 11, label: '🧱 심플 벽' };
    case 'house':
      return { cols: 33, rows: 23, label: '🏡 가옥 외관' };
    case 'nature':
      return { cols: 24, rows: 21, label: '🌳 자연 환경' };
    case 'water':
      return { cols: 28, rows: 17, label: '🪵 강물/다리' };
    case 'field':
      return { cols: 5, rows: 15, label: '🌾 야외 소품/우물' };
    default:
      return { cols: 22, rows: 26, label: '🏙️ 실외 바닥/도시' };
  }
};

// Helper to compute camera bounds constraint (prevents displaying black void outside of map)
export const getCameraCoords = (
  px: number,
  py: number,
  map: MapDefinition,
  viewW: number,
  viewH: number,
  tileScale: number
) => {
  const vSize = 16 * tileScale;
  let cameraX = px * tileScale - viewW / 2 + vSize / 2;
  let cameraY = py * tileScale - viewH / 2 + vSize / 2;

  const maxCameraX = map.width * vSize - viewW;
  const maxCameraY = map.height * vSize - viewH;

  if (map.width * vSize > viewW) {
    cameraX = Math.max(0, Math.min(cameraX, maxCameraX));
  } else {
    cameraX = (map.width * vSize - viewW) / 2;
  }

  if (map.height * vSize > viewH) {
    cameraY = Math.max(0, Math.min(cameraY, maxCameraY));
  } else {
    cameraY = (map.height * vSize - viewH) / 2;
  }

  return { cameraX, cameraY, vSize };
};

export const CanvasGame: React.FC<CanvasGameProps> = ({
  localPlayer,
  otherPlayers,
  offlinePlayers,
  currentMapId,
  chatBubbles,
  onMove,
  onPlayerClick,
  
  isEditMode,
  selectedTile,
  editLayer,
  onPaintTile,
  mapData,
  brushSize
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Loaded assets state
  const [images, setImages] = useState<Record<string, HTMLImageElement> | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  // Key states
  const keysPressed = useRef<Record<string, boolean>>({});

  // Editor Camera coordinates
  const editCameraX = useRef(0);
  const editCameraY = useRef(0);
  const isEditingInitialized = useRef(false);
  
  // Paint action states
  const isPainting = useRef(false);
  
  // Right-click drag camera panning state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  // Local player ref for physics loop (to avoid stale React closures)
  const localPlayerRef = useRef<PlayerState>(localPlayer);
  useEffect(() => {
    localPlayerRef.current = localPlayer;
  }, [localPlayer]);

  // Mobile / Touch screen detector state
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      const touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      const smallScreen = window.innerWidth < 768;
      setIsMobile(touchCapable || smallScreen);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Dynamic Tile Scale factor based on viewport width (reduced for higher density and sharpness)
  const getTileScale = () => {
    if (dimensions.width < 768) return 1.5; // Mobile: 1.5x zoom
    return 2; // Desktop: 2x zoom (32px tiles - High Density HD map view!)
  };

  const handleVirtualDpadPress = (key: string, pressed: boolean) => {
    keysPressed.current[key] = pressed;
  };

  // Initialize edit camera to center on player when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      const tileScale = getTileScale();
      const p = localPlayerRef.current;
      const vSize = 16 * tileScale;
      editCameraX.current = p.x * tileScale - dimensions.width / 2 + vSize / 2;
      editCameraY.current = p.y * tileScale - dimensions.height / 2 + vSize / 2;
      isEditingInitialized.current = true;
    } else {
      isEditingInitialized.current = false;
    }
  }, [isEditMode]);

  // Load assets once on mount
  useEffect(() => {
    const assets = {
      interior: interiorTilesUrl,
      outdoor: outdoorTilesUrl,
      village: villageTilesUrl,
      wall: wallTilesUrl,
      house: houseTilesUrl,
      nature: natureTilesUrl,
      water: waterTilesUrl,
      field: fieldTilesUrl,
      ninja_blue: ninjaBlueUrl,
      samurai_blue: samuraiBlueUrl,
      samurai_green: samuraiGreenUrl,
      pig: pigUrl
    };

    const loadedImages: Record<string, HTMLImageElement> = {};
    let loadedCount = 0;
    const totalCount = Object.keys(assets).length;

    Object.entries(assets).forEach(([key, url]) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        loadedImages[key] = img;
        loadedCount++;
        if (loadedCount === totalCount) {
          setImages(loadedImages);
          setAssetsLoaded(true);
        }
      };
      img.onerror = () => {
        console.error(`Failed to load asset: ${key} from ${url}`);
      };
    });
  }, []);

  // Keyboard input listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        // Prevent default scrolling for arrow keys/WASD
        e.preventDefault();
        keysPressed.current[key] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (keysPressed.current[key]) {
        keysPressed.current[key] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Window resize handler
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Bounding box collision checker
  const checkCollision = (px: number, py: number, map: MapDefinition): boolean => {
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

    // Map boundaries check
    if (tileLeft < 0 || tileRight >= map.width || tileTop < 0 || tileBottom >= map.height) {
      return true;
    }

    // Check cells inside the bounding box
    for (let ty = tileTop; ty <= tileBottom; ty++) {
      for (let tx = tileLeft; tx <= tileRight; tx++) {
        if (map.collision[ty][tx]) {
          return true;
        }
      }
    }
    return false;
  };

  // Main game logic loop (Physics & Rendering)
  useEffect(() => {
    if (!assetsLoaded || !images || !canvasRef.current) return;

    let animId: number;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const map = mapData;
    const speed = 1.5; // Walk speed in pixels per frame

    // Physics update function
    const updatePhysics = () => {
      const p = localPlayerRef.current;

      // EDIT MODE CAMERA PANNING CONTROL
      if (isEditMode) {
        if (isPanning.current) return; // Right-click panning bypasses keys

        const scrollSpeed = 4;
        let cdx = 0;
        let cdy = 0;
        if (keysPressed.current['w'] || keysPressed.current['arrowup']) cdy = -scrollSpeed;
        else if (keysPressed.current['s'] || keysPressed.current['arrowdown']) cdy = scrollSpeed;

        if (keysPressed.current['a'] || keysPressed.current['arrowleft']) cdx = -scrollSpeed;
        else if (keysPressed.current['d'] || keysPressed.current['arrowright']) cdx = scrollSpeed;

        editCameraX.current += cdx;
        editCameraY.current += cdy;

        // Bounding limits for edit camera
        const tileScale = getTileScale();
        const vSize = 16 * tileScale;
        const maxCameraX = map.width * vSize - dimensions.width;
        const maxCameraY = map.height * vSize - dimensions.height;

        if (map.width * vSize > dimensions.width) {
          editCameraX.current = Math.max(0, Math.min(editCameraX.current, maxCameraX));
        } else {
          editCameraX.current = (map.width * vSize - dimensions.width) / 2;
        }

        if (map.height * vSize > dimensions.height) {
          editCameraY.current = Math.max(0, Math.min(editCameraY.current, maxCameraY));
        } else {
          editCameraY.current = (map.height * vSize - dimensions.height) / 2;
        }
        return; // Skip player movement physics
      }

      // NORMAL PLAYER MOVEMENT PHYSICS
      // Emergency Safety Check: Teleport player back inside map ONLY if completely out of bounds
      const spawnX = (map.spawnPoints[0]?.x ?? Math.floor(map.width / 2)) * 16;
      const spawnY = (map.spawnPoints[0]?.y ?? Math.floor(map.height / 2)) * 16;
      if (p.x < 0 || p.x > (map.width - 1) * 16 || p.y < 0 || p.y > (map.height - 1) * 16) {
        onMove(spawnX, spawnY, 'down', false);
        return;
      }

      let moveUp = keysPressed.current['w'] || keysPressed.current['arrowup'];
      let moveDown = keysPressed.current['s'] || keysPressed.current['arrowdown'];
      let moveLeft = keysPressed.current['a'] || keysPressed.current['arrowleft'];
      let moveRight = keysPressed.current['d'] || keysPressed.current['arrowright'];

      let dx = 0;
      let dy = 0;

      if (moveUp) dy -= speed;
      if (moveDown) dy += speed;
      if (moveLeft) dx -= speed;
      if (moveRight) dx += speed;

      let newDir = p.dir;

      // Smart Direction Selection:
      // If moving along a single axis, set facing direction to that axis.
      // If moving diagonally, keep existing direction if it matches one of the axes.
      if (dx !== 0 || dy !== 0) {
        if (dx === 0 && dy < 0) newDir = 'up';
        else if (dx === 0 && dy > 0) newDir = 'down';
        else if (dy === 0 && dx < 0) newDir = 'left';
        else if (dy === 0 && dx > 0) newDir = 'right';
        else {
          // Diagonal movement: preserve current direction if it matches an active movement axis
          if (dy < 0 && p.dir === 'up') newDir = 'up';
          else if (dy > 0 && p.dir === 'down') newDir = 'down';
          else if (dx < 0 && p.dir === 'left') newDir = 'left';
          else if (dx > 0 && p.dir === 'right') newDir = 'right';
          else if (dy < 0) newDir = 'up';
          else if (dy > 0) newDir = 'down';
        }
      }

      // Normalize diagonal speed so diagonal walking is 100% smooth and not unnaturally fast
      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      const isMoving = dx !== 0 || dy !== 0;
      let newX = p.x + dx;
      let newY = p.y + dy;

      if (isMoving) {
        let finalX = p.x;
        let finalY = p.y;

        if (!checkCollision(newX, p.y, map)) {
          finalX = newX;
        }
        if (!checkCollision(p.x, newY, map)) {
          finalY = newY;
        }

        const moved = finalX !== p.x || finalY !== p.y;
        onMove(finalX, finalY, newDir, moved);
      } else if (p.isMoving) {
        onMove(p.x, p.y, p.dir, false);
      }
    };

    // Constrain camera position helper
    const constrainEditCamera = () => {
      const tileScale = getTileScale();
      const vSize = 16 * tileScale;
      const maxCameraX = map.width * vSize - dimensions.width;
      const maxCameraY = map.height * vSize - dimensions.height;

      if (map.width * vSize > dimensions.width) {
        editCameraX.current = Math.max(0, Math.min(editCameraX.current, maxCameraX));
      } else {
        editCameraX.current = (map.width * vSize - dimensions.width) / 2;
      }

      if (map.height * vSize > dimensions.height) {
        editCameraY.current = Math.max(0, Math.min(editCameraY.current, maxCameraY));
      } else {
        editCameraY.current = (map.height * vSize - dimensions.height) / 2;
      }
    };

    // Render loop
    const render = () => {
      updatePhysics();

      const dpr = window.devicePixelRatio || 1;

      // Setup Camera
      const p = localPlayerRef.current;
      const tileScale = getTileScale();
      
      let cameraX = 0;
      let cameraY = 0;
      let vSize = 16 * tileScale;

      if (isEditMode) {
        if (isPanning.current) {
          constrainEditCamera();
        }
        cameraX = editCameraX.current;
        cameraY = editCameraY.current;
      } else {
        const coords = getCameraCoords(p.x, p.y, map, dimensions.width, dimensions.height, tileScale);
        cameraX = coords.cameraX;
        cameraY = coords.cameraY;
      }

      // Save context for DPR scaling
      ctx.save();
      ctx.scale(dpr, dpr);

      // Draw background
      ctx.fillStyle = '#0f0f15';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Save context for camera translation
      ctx.save();
      ctx.translate(-cameraX, -cameraY);

      // Disable image smoothing for crisp pixel rendering (cross-browser)
      ctx.imageSmoothingEnabled = false;
      (ctx as any).mozImageSmoothingEnabled = false;
      (ctx as any).webkitImageSmoothingEnabled = false;
      (ctx as any).msImageSmoothingEnabled = false;

      // 1. Draw Base Floor Layer
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const tileIdx = map.baseLayer[ty][tx];
          const drawInfo = getTileDrawInfo(tileIdx, map.tileset);
          if (drawInfo) {
            const img = images[drawInfo.tilesetKey];
            if (img) {
              const tsInfo = getTilesetInfo(drawInfo.tilesetKey);
              const srcX = (drawInfo.localIdx % tsInfo.cols) * 16;
              const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * 16;
              ctx.drawImage(
                img,
                srcX, srcY, 16, 16,
                tx * vSize, ty * vSize, vSize, vSize
              );
            }
          }
        }
      }

      // 2. Draw Decoration Layer
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const tileIdx = map.decorLayer[ty][tx];
          const drawInfo = getTileDrawInfo(tileIdx, map.tileset);
          if (drawInfo) {
            const img = images[drawInfo.tilesetKey];
            if (img) {
              const tsInfo = getTilesetInfo(drawInfo.tilesetKey);
              const srcX = (drawInfo.localIdx % tsInfo.cols) * 16;
              const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * 16;
              ctx.drawImage(
                img,
                srcX, srcY, 16, 16,
                tx * vSize, ty * vSize, vSize, vSize
              );
            }
          }
        }
      }

        // 3. Draw Collision Debug Overlay (only in edit mode, red translucent blocks)
        if (isEditMode) {
          ctx.fillStyle = 'rgba(243, 139, 168, 0.2)';
          ctx.strokeStyle = 'rgba(243, 139, 168, 0.5)';
          ctx.lineWidth = 1;
          for (let ty = 0; ty < map.height; ty++) {
            for (let tx = 0; tx < map.width; tx++) {
              if (map.collision[ty][tx]) {
                ctx.fillRect(tx * vSize, ty * vSize, vSize, vSize);
                ctx.strokeRect(tx * vSize, ty * vSize, vSize, vSize);
              }
            }
          }

          // Render Brush preview under the cursor (white dashed frame)
          // We'll compute cursor tile position from mouse coordinates in React state if needed,
          // but right now standard drawing works.
        }

      // 4. Render Characters (Y-Sorted)
      const renderList: PlayerState[] = [p];

      Object.values(otherPlayers).forEach((op) => {
        if (op.mapId === currentMapId && op.id !== p.id && op.nickname !== p.nickname) {
          renderList.push(op);
        }
      });

      Object.values(offlinePlayers).forEach((offp) => {
        if (offp.mapId === currentMapId && offp.id !== p.id && offp.nickname !== p.nickname && !otherPlayers[offp.id]) {
          renderList.push(offp);
        }
      });

      renderList.sort((a, b) => a.y - b.y);

      renderList.forEach((player) => {
        const spriteSheet = images[player.spriteType];
        if (!spriteSheet) return;

        const dyedSpriteSheet = getDyedSprite(spriteSheet, player.hue, player.isOnline);

        // Authentic Ninja Adventure Sprite Matrix Mapping (spec: sprite_character.gd):
        // Col (X) = Direction: 0 = Down, 1 = Up, 2 = Left, 3 = Right
        // Row (Y) = Walk Animation Frames: 0, 1, 2, 3 (Idle = 0)
        let col = 0; // Down
        if (player.dir === 'up') col = 1;
        else if (player.dir === 'left') col = 2;
        else if (player.dir === 'right') col = 3;

        let row = 0; // Idle frame
        if (player.isMoving) {
          row = Math.floor(Date.now() / 120) % 4;
        }

        const charDrawX = player.x * tileScale;
        const charDrawY = player.y * tileScale;

        ctx.drawImage(
          dyedSpriteSheet,
          col * 16, row * 16, 16, 16,
          charDrawX, charDrawY, vSize, vSize
        );

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const headCenterX = charDrawX + vSize / 2;
        let currentY = charDrawY - 8; // Start right above player head sprite

        // 1. Draw Nickname (Bottom-most HUD element right above head)
        ctx.font = '10px "DungGeunMo", monospace';
        const nameText = player.nickname;
        const nameWidth = ctx.measureText(nameText).width + 8;
        
        ctx.fillStyle = 'rgba(15, 15, 25, 0.75)';
        ctx.fillRect(headCenterX - nameWidth / 2, currentY - 7, nameWidth, 14);

        ctx.fillStyle = player.id === localPlayerRef.current.id 
          ? '#f5c2e7'
          : (player.isOnline ? '#ffffff' : '#8c8c9c');
        ctx.fillText(nameText, headCenterX, currentY);

        currentY -= 16; // Move Y up for next layer

        // 2. Draw Status Badge (Middle HUD element above nickname if present)
        const statusText = player.statusMessage;
        if (statusText) {
          ctx.font = '10px "DungGeunMo", monospace';
          const statusDisplay = `${!player.isOnline ? '💤' : '⚡'} ${statusText}`;
          const badgeWidth = ctx.measureText(statusDisplay).width + 8;

          ctx.fillStyle = !player.isOnline ? 'rgba(40, 40, 50, 0.85)' : 'rgba(139, 92, 246, 0.85)';
          ctx.beginPath();
          ctx.roundRect(headCenterX - badgeWidth / 2, currentY - 7, badgeWidth, 14, 4);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.fillText(statusDisplay, headCenterX, currentY);

          currentY -= 16; // Move Y up for speech bubble
        }

        // 3. Draw Chat Bubble (Top-most HUD element above status/name with zero overlap!)
        const chat = chatBubbles[player.id];
        if (chat && Date.now() - chat.time < 4000) {
          ctx.font = '11px Arial';
          const padding = 8;
          const bubbleWidth = ctx.measureText(chat.text).width + padding * 2;
          const bubbleHeight = 22;
          const bubbleY = currentY - 10; // Position bubble safely above

          // White rounded chat bubble box
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = 1;
          
          ctx.beginPath();
          ctx.roundRect(headCenterX - bubbleWidth / 2, bubbleY - bubbleHeight / 2, bubbleWidth, bubbleHeight, 6);
          ctx.fill();
          ctx.stroke();

          // Bubble pointer triangle pointing downwards
          ctx.beginPath();
          ctx.moveTo(headCenterX - 4, bubbleY + bubbleHeight / 2);
          ctx.lineTo(headCenterX, bubbleY + bubbleHeight / 2 + 4);
          ctx.lineTo(headCenterX + 4, bubbleY + bubbleHeight / 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
          ctx.fill();
          ctx.stroke();

          // Message text inside bubble
          ctx.fillStyle = '#11111b';
          ctx.fillText(chat.text, headCenterX, bubbleY);
        }

        ctx.restore();
      });

      ctx.restore(); // Restore camera translation
      ctx.restore(); // Restore DPR scaling

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [assetsLoaded, images, currentMapId, dimensions, otherPlayers, offlinePlayers, chatBubbles, isEditMode, mapData]);

  // Click on Canvas handler to interact with characters
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEditMode) return; // Disable DMs while building!
    if (!canvasRef.current || !localPlayer) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileScale = getTileScale();
    const { cameraX, cameraY, vSize } = getCameraCoords(localPlayer.x, localPlayer.y, mapData, dimensions.width, dimensions.height, tileScale);

    const gameX = clickX + cameraX;
    const gameY = clickY + cameraY;

    const candidates: { player: PlayerState; dist: number }[] = [];

    const checkCandidate = (p: PlayerState) => {
      const px = p.x * tileScale + vSize / 2;
      const py = p.y * tileScale + vSize / 2;
      const dist = Math.sqrt((gameX - px) ** 2 + (gameY - py) ** 2);
      if (dist < 28) {
        candidates.push({ player: p, dist });
      }
    };

    Object.values(otherPlayers).forEach((op) => {
      if (op.mapId === currentMapId && op.id !== localPlayer.id && op.nickname !== localPlayer.nickname) {
        checkCandidate(op);
      }
    });

    Object.values(offlinePlayers).forEach((offp) => {
      if (offp.mapId === currentMapId && offp.id !== localPlayer.id && offp.nickname !== localPlayer.nickname && !otherPlayers[offp.id]) {
        checkCandidate(offp);
      }
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      onPlayerClick(candidates[0].player);
    }
  };

  // Editor: Paint tile trigger with Brush Size support!
  const handlePaintAtCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isEditMode || !canvasRef.current || isPanning.current) return;
    
    // Check if it is a right click (we should ignore painting if panning)
    if ('button' in e && (e.button === 2 || e.button === 1)) {
      return;
    }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const tileScale = getTileScale();
    const vSize = 16 * tileScale;

    // Use current edit camera values
    const cameraX = editCameraX.current;
    const cameraY = editCameraY.current;

    const gameX = clickX + cameraX;
    const gameY = clickY + cameraY;

    const tx = Math.floor(gameX / vSize);
    const ty = Math.floor(gameY / vSize);

    // Brush painting grid block based on brushSize
    const half = Math.floor(brushSize / 2);
    
    // Draw brush box centered around click
    for (let dy = -half; dy <= (brushSize % 2 === 0 ? half - 1 : half); dy++) {
      for (let dx = -half; dx <= (brushSize % 2 === 0 ? half - 1 : half); dx++) {
        const ptx = tx + dx;
        const pty = ty + dy;
        
        if (ptx >= 0 && ptx < mapData.width && pty >= 0 && pty < mapData.height) {
          onPaintTile(ptx, pty, selectedTile, editLayer);
        }
      }
    }
  };

  // Context menu blocker to allow seamless Right Click Drag panning
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEditMode) {
      e.preventDefault();
    }
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {!assetsLoaded && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: '#12121e', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', zIndex: 10
        }}>
          <div className="pixel-text" style={{ fontSize: '20px', marginBottom: '10px' }}>
            픽셀 에셋 불러오는 중...
          </div>
          <div style={{
            width: '200px', height: '10px', background: '#1e1e2e',
            borderRadius: '5px', overflow: 'hidden'
          }}>
            <div style={{
              width: '100%', height: '100%', background: '#8b5cf6',
              animation: 'pulse-glow 1.5s infinite'
            }} />
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={dimensions.width * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)}
        height={dimensions.height * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)}
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => {
          if (isEditMode && (e.button === 2 || e.button === 1)) {
            // Right or middle click: start camera panning!
            e.preventDefault();
            isPanning.current = true;
            panStart.current = {
              x: e.clientX,
              y: e.clientY,
              camX: editCameraX.current,
              camY: editCameraY.current
            };
          } else {
            // Left click: Paint tile
            isPainting.current = true;
            handlePaintAtCoords(e);
          }
        }}
        onMouseMove={(e) => {
          if (isEditMode && isPanning.current) {
            // Panning: scroll camera view
            const dx = e.clientX - panStart.current.x;
            const dy = e.clientY - panStart.current.y;
            editCameraX.current = panStart.current.camX - dx;
            editCameraY.current = panStart.current.camY - dy;
          } else if (isPainting.current) {
            // Drag-painting
            handlePaintAtCoords(e);
          }
        }}
        onMouseUp={(e) => {
          if (e.button === 2 || e.button === 1) {
            isPanning.current = false;
          } else {
            isPainting.current = false;
          }
        }}
        onMouseLeave={() => {
          isPainting.current = false;
          isPanning.current = false;
        }}
        onTouchStart={(e) => {
          // On mobile, simple single touch is painting
          isPainting.current = true;
          handlePaintAtCoords(e);
        }}
        onTouchMove={(e) => {
          if (isPainting.current) handlePaintAtCoords(e);
        }}
        onTouchEnd={() => { isPainting.current = false; }}
        className="pixelated"
        style={{ display: 'block', cursor: isEditMode ? (isPanning.current ? 'grabbing' : 'crosshair') : 'pointer', width: '100%', height: '100%' }}
      />

      {/* Mobile virtual directional key overlay */}
      {isMobile && (
        <div style={{
          position: 'absolute', left: '20px', bottom: '90px', width: '130px', height: '130px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)',
          gap: '4px', zIndex: 105, background: 'rgba(0,0,0,0.15)', padding: '6px', borderRadius: '50%',
          backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
        }}>
          <div />
          <button
            onTouchStart={() => handleVirtualDpadPress('w', true)}
            onTouchEnd={() => handleVirtualDpadPress('w', false)}
            onMouseDown={() => handleVirtualDpadPress('w', true)}
            onMouseUp={() => handleVirtualDpadPress('w', false)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px', fontWeight: 'bold'
            }}
          >
            ▲
          </button>
          <div />
          
          <button
            onTouchStart={() => handleVirtualDpadPress('a', true)}
            onTouchEnd={() => handleVirtualDpadPress('a', false)}
            onMouseDown={() => handleVirtualDpadPress('a', true)}
            onMouseUp={() => handleVirtualDpadPress('a', false)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px', fontWeight: 'bold'
            }}
          >
            ◀
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '9px', fontFamily: 'var(--font-pixel)' }}>
            {isEditMode ? '시점' : '이동'}
          </div>
          <button
            onTouchStart={() => handleVirtualDpadPress('d', true)}
            onTouchEnd={() => handleVirtualDpadPress('d', false)}
            onMouseDown={() => handleVirtualDpadPress('d', true)}
            onMouseUp={() => handleVirtualDpadPress('d', false)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px', fontWeight: 'bold'
            }}
          >
            ▶
          </button>

          <div />
          <button
            onTouchStart={() => handleVirtualDpadPress('s', true)}
            onTouchEnd={() => handleVirtualDpadPress('s', false)}
            onMouseDown={() => handleVirtualDpadPress('s', true)}
            onMouseUp={() => handleVirtualDpadPress('s', false)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px', fontWeight: 'bold'
            }}
          >
            ▼
          </button>
          <div />
        </div>
      )}
    </div>
  );
};
