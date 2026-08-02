import { useState, useEffect, useRef } from 'react';
import { CanvasGame } from './game/CanvasGame';
import { type MapDefinition, maps, PRESET_MAP_TEMPLATES, createCustomMap, getCharRowActions, getCharDisplaySize, findValidSpawnPosition, isPlayerCollidingAt } from './game/MapData';
import {
  type PlayerState,
  getOrCreateDeviceId,
  generateNickname,
  getOfflineUsers,
  saveOfflineUser,
  removeOfflineUser,
  getDMs,
  saveDM,
  markDMsAsRead,
  markMySentDMsAsRead,
  type DirectMessage
} from './game/syncManager';
import { Customizer } from './components/Customizer';
import { Messenger } from './components/Messenger';
import { StatusPicker } from './components/StatusPicker';
import { MapSelector } from './components/MapSelector';
import { MapEditorView } from './components/MapEditorView';
import { Mail, Settings, User, Eye, Hammer, Home, Share2, ShoppingCart } from 'lucide-react';
import { AssetViewer } from './components/AssetViewer';
import { MarketModal } from './components/MarketModal';
import { HouseJoinModal } from './components/HouseJoinModal';
import { PlayerInteractionModal } from './components/PlayerInteractionModal';
import { DMRequestModal } from './components/DMRequestModal';
import { getSavedHouseCode, setSavedHouseCode, fetchHouseMaps, saveHouseMapToDB, deleteHouseMapFromDB, fetchHouseAssets, fetchHouseMapOrder, saveHouseMapOrderToDB, type MarketItem } from './services/HouseService';
import { supabase } from './lib/supabase';
import { APP_VERSION } from './config/version';
import type { MapMemo, InventoryItem } from './types/memo';
import { fetchHouseMemos, saveMemoToDB, deleteMemoFromDB, deleteLocalMemo, getLocalMemos, saveLocalMemos, getLocalInventory, saveLocalInventory } from './services/MemoService';
import { CreateMemoModal } from './components/CreateMemoModal';
import { ViewMemoModal } from './components/ViewMemoModal';
import { InventoryModal } from './components/InventoryModal';
import { CustomAlertModal } from './components/CustomAlertModal';
import { YouTubePlayerModal } from './components/YouTubePlayerModal';
import { WebBrowserModal } from './components/WebBrowserModal';
import { Briefcase } from 'lucide-react';

interface ChatLogMessage {
  id: string;
  senderName: string;
  text: string;
  time: number;
  channel?: 'global' | 'map';
  mapName?: string;
}

// Helper function to extract YouTube video ID from various YouTube URL formats
const extractYouTubeId = (text: string): string | null => {
  if (!text) return null;
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(regex);
  return match ? match[1] : null;
};

// Helper function to extract non-YouTube Web URLs
const extractGeneralUrl = (text: string): string | null => {
  if (!text) return null;
  const regex = /(https?:\/\/[^\s]+)/gi;
  const matches = text.match(regex);
  if (!matches) return null;

  const ytRegex = /(?:youtube\.com|youtu\.be)/i;
  for (const url of matches) {
    if (!ytRegex.test(url)) {
      return url;
    }
  }
  return null;
};

export default function App() {
  const deviceId = useRef(getOrCreateDeviceId());

  // Custom Global Alert Modal State
  const [customAlertState, setCustomAlertState] = useState<{ message: string; title?: string; icon?: string } | null>(null);

  // Global override for native browser window.alert
  useEffect(() => {
    window.alert = (message: any) => {
      const msgStr = typeof message === 'object' ? JSON.stringify(message) : String(message);
      setCustomAlertState({ message: msgStr, title: '안내', icon: '💡' });
    };
  }, []);

  // House Code (Multi-user sharing room ID)
  const [houseCode, setHouseCodeState] = useState<string>(getSavedHouseCode);
  const [showHouseModal, setShowHouseModal] = useState<boolean>(false);

  // 0. Active Maps (loads house-isolated maps directly from Supabase DB)
  const [activeMaps, setActiveMaps] = useState<Record<string, MapDefinition>>(() => {
    return JSON.parse(JSON.stringify(maps));
  });
  const [isHouseLoaded, setIsHouseLoaded] = useState<boolean>(false);

  // Helper to load initial saved map tab order
  const getInitialAvailableMapIds = (): string[] => {
    try {
      const savedOrder = localStorage.getItem(`on_house_available_maps_${houseCode}`);
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  };

  // 0.5. Available Map IDs displayed in top bar
  const [availableMapIds, setAvailableMapIds] = useState<string[]>(getInitialAvailableMapIds);
  const [dbCustomCharSprites, setDbCustomCharSprites] = useState<any[]>([]);
  const [dbCharOverrides, setDbCharOverrides] = useState<Record<string, any>>({});

  // Helper to update activeMaps while strictly preserving user's custom tab order!
  const applyFetchedMapOrder = (mapsData: Record<string, MapDefinition>, dbOrder?: string[]) => {
    setActiveMaps(mapsData);
    try {
      localStorage.setItem('on_house_custom_maps_cache', JSON.stringify(mapsData));
    } catch (e) {}
    const fetchedMapIds = Object.keys(mapsData);
    let savedOrder: string[] = dbOrder && dbOrder.length > 0 ? dbOrder : [];

    const orderedIds = [
      ...savedOrder.filter(id => fetchedMapIds.includes(id)),
      ...fetchedMapIds.filter(id => !savedOrder.includes(id))
    ];

    const finalOrder = orderedIds.length > 0 ? orderedIds : fetchedMapIds;
    setAvailableMapIds(finalOrder);
    try {
      localStorage.setItem(`on_house_available_maps_${houseCode}`, JSON.stringify(finalOrder));
    } catch (e) {}

    // Guarantee initial entry always lands on the far-left first map (finalOrder[0])!
    if (finalOrder.length > 0) {
      const firstMapId = finalOrder[0];
      const targetMap = mapsData[firstMapId] || maps[firstMapId];
      const spawn = findValidSpawnPosition(targetMap);

      setLocalPlayer((p) => {
        // If player is not already in a valid map within this house, or on initial load, snap to firstMapId
        if (!finalOrder.includes(p.mapId) || p.mapId !== firstMapId) {
          return {
            ...p,
            mapId: firstMapId,
            x: spawn.x * 16,
            y: spawn.y * 16
          };
        }
        return p;
      });
    }
  };

  useEffect(() => {
    const syncDbCharSprites = (evt?: Event) => {
      try {
        const saved = localStorage.getItem('on_house_custom_char_sprites');
        setDbCustomCharSprites(saved ? JSON.parse(saved) : []);
      } catch (e) {}
      // Also refresh the character IMAGE data, not just the metadata list. dbCharOverrides was
      // only ever set from the initial DB fetch and from Realtime broadcasts — and Supabase
      // broadcasts don't echo back to the sender, so this client's own edits never reached it.
      // AssetViewer merges dbCharOverrides on top of its local copy, so a stale entry here
      // silently reverted local edits (e.g. a pasted frame) as soon as the editor was reopened.
      // Prefer the in-memory payload the editor hands us over localStorage, since the localStorage
      // write may have been dropped by the ~5MB quota and would otherwise feed back stale data.
      const detail = (evt as CustomEvent | undefined)?.detail;
      if (detail && detail.charImageOverrides && typeof detail.charImageOverrides === 'object') {
        setDbCharOverrides((prev) => ({ ...prev, ...detail.charImageOverrides }));
        return;
      }
      try {
        const savedOverrides = localStorage.getItem('on_house_char_image_overrides');
        if (savedOverrides) {
          const parsed = JSON.parse(savedOverrides);
          if (parsed && typeof parsed === 'object') {
            setDbCharOverrides((prev) => ({ ...prev, ...parsed }));
          }
        }
      } catch (e) {}
    };

    window.addEventListener('on_house_sprites_updated', syncDbCharSprites);
    window.addEventListener('storage', syncDbCharSprites);
    return () => {
      window.removeEventListener('on_house_sprites_updated', syncDbCharSprites);
      window.removeEventListener('storage', syncDbCharSprites);
    };
  }, []);

  const checkIsMobileDevice = (): boolean => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);
    if (isMobileUA) return true;
    const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const isSmallScreen = window.innerWidth < 768;
    return isCoarsePointer && isSmallScreen;
  };

  const isMobileDevice = checkIsMobileDevice();

  // 1. Local Player State
  const [localPlayer, setLocalPlayer] = useState<PlayerState>(() => {
    const savedName = localStorage.getItem('on_house_nickname') || generateNickname();
    localStorage.setItem('on_house_nickname', savedName);

    const savedSprite = (localStorage.getItem('on_house_sprite') as any) || '';
    const savedHue = parseInt(localStorage.getItem('on_house_hue') || '0');
    const rawStatus = localStorage.getItem('on_house_status');
    const savedStatus = (rawStatus === '반가워요!' || !rawStatus) ? '' : rawStatus;

    // Default to the first map on the far-left of availableMapIds!
    const initialMapIds = getInitialAvailableMapIds();
    const firstMapId = initialMapIds[0] || 'room';
    const firstMapObj = activeMaps[firstMapId] || maps.room || maps[firstMapId];
    const firstSpawn = findValidSpawnPosition(firstMapObj);

    let savedPersonalSize: number | null = null;
    try {
      const pSize = localStorage.getItem('on_house_personal_char_size');
      if (pSize) {
        const parsed = parseInt(pSize, 10);
        if (!isNaN(parsed) && parsed >= 8) savedPersonalSize = parsed;
      }
    } catch (e) {}

    const baseSize = getCharDisplaySize(savedSprite);
    const effectiveCharSize = savedPersonalSize || baseSize;

    return {
      id: deviceId.current,
      nickname: savedName,
      spriteType: savedSprite,
      hue: savedHue,
      mapId: firstMapId,
      x: firstSpawn.x * 16,
      y: firstSpawn.y * 16,
      dir: 'down',
      isMoving: false,
      isOnline: true,
      isMobile: isMobileDevice,
      statusMessage: savedStatus,
      lastActive: Date.now(),
      charSize: effectiveCharSize,
      personalCharSize: savedPersonalSize
    };
  });

  // Keep localPlayer.spriteType pointing at a real custom character whenever one exists and the
  // current value doesn't match any registered character (e.g. right after registering the
  // house's first custom character). A native <select> falls back to visually showing the first
  // <option> when its bound value matches nothing, so the Customizer can *look* like the new
  // character is selected while the actual game state — and therefore in-game rendering — never
  // switches to it, leaving the player as the placeholder marker.
  useEffect(() => {
    if (dbCustomCharSprites.length === 0) {
      if (localPlayer.spriteType !== '') {
        setLocalPlayer((prev) => ({ ...prev, spriteType: '' }));
        localStorage.removeItem('on_house_sprite');
      }
      return;
    }
    if (!dbCustomCharSprites.some((c) => c.id === localPlayer.spriteType)) {
      setLocalPlayer((prev) => ({ ...prev, spriteType: dbCustomCharSprites[0].id }));
    }
  }, [dbCustomCharSprites, localPlayer.spriteType]);

  useEffect(() => {
    localStorage.setItem(`on_house_available_maps_${houseCode}`, JSON.stringify(availableMapIds));
    if (availableMapIds.length > 0 && !availableMapIds.includes(localPlayer.mapId)) {
      setLocalPlayer((prev) => ({ ...prev, mapId: availableMapIds[0] }));
    }
    const currentIsMobile = checkIsMobileDevice();
    if (localPlayer.isMobile !== currentIsMobile) {
      setLocalPlayer(prev => ({ ...prev, isMobile: currentIsMobile }));
    }
  }, [availableMapIds, localPlayer.mapId, localPlayer.isMobile]);

  // 2. Multi-player lists
  const [otherPlayers, setOtherPlayers] = useState<Record<string, PlayerState>>({});
  const otherPlayersRef = useRef<Record<string, PlayerState>>(otherPlayers);
  useEffect(() => {
    otherPlayersRef.current = otherPlayers;
  }, [otherPlayers]);

  const pendingPingCallbacksRef = useRef<Record<string, (online: boolean) => void>>({});

  const [offlinePlayers, setOfflinePlayers] = useState<Record<string, PlayerState>>(() => getOfflineUsers());

  // 3. UI control states
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [activeDMTarget, setActiveDMTarget] = useState<PlayerState | null>(null);
  const [showAssetViewer, setShowAssetViewer] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [interactionTargetPlayer, setInteractionTargetPlayer] = useState<PlayerState | null>(null);
  const [incomingDMRequest, setIncomingDMRequest] = useState<{ requesterId: string; requesterName: string; requesterPlayer: PlayerState } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isChatLogCollapsed, setIsChatLogCollapsed] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [activeYouTubeVideoId, setActiveYouTubeVideoId] = useState<string | null>(null);
  const [activeWebUrl, setActiveWebUrl] = useState<string | null>(null);
  const [partnerViewingState, setPartnerViewingState] = useState<{ videoId?: string; webUrl?: string; syncEnabled?: boolean } | null>(null);
  const [isWebSyncActive, setIsWebSyncActive] = useState<boolean>(false);
  const [closedDMPartners, setClosedDMPartners] = useState<Record<string, boolean>>({});
  const activeDMTargetRef = useRef<PlayerState | null>(null);
  activeDMTargetRef.current = activeDMTarget;

  // Broadcast media viewing updates whenever state changes
  useEffect(() => {
    if (!channelRef.current) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'media_viewing_update',
      payload: {
        deviceId: deviceId.current,
        playerId: localPlayer.id,
        videoId: activeYouTubeVideoId || undefined,
        webUrl: activeWebUrl || undefined,
        syncEnabled: isWebSyncActive
      }
    });
  }, [activeYouTubeVideoId, activeWebUrl, isWebSyncActive]);

  const handleNavigateWebUrl = (newUrl: string) => {
    setActiveWebUrl(newUrl);
    if (channelRef.current && isWebSyncActive) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'media_viewing_update',
        payload: {
          deviceId: deviceId.current,
          playerId: localPlayer.id,
          webUrl: newUrl,
          syncEnabled: true
        }
      });
    }
  };

  const handleToggleWebSync = () => {
    setIsWebSyncActive((prev) => {
      const next = !prev;
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'media_viewing_update',
          payload: {
            deviceId: deviceId.current,
            playerId: localPlayer.id,
            webUrl: activeWebUrl || undefined,
            syncEnabled: next
          }
        });
      }
      return next;
    });
  };

  // Listen for YouTube Watch & Web URL custom events from any component
  useEffect(() => {
    const handleWatchYT = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.videoId) {
        setActiveYouTubeVideoId(detail.videoId);
      }
    };
    const handleOpenWebUrl = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.url) {
        setActiveWebUrl(detail.url);
      }
    };
    window.addEventListener('on_house_watch_youtube', handleWatchYT);
    window.addEventListener('on_house_open_web_url', handleOpenWebUrl);
    return () => {
      window.removeEventListener('on_house_watch_youtube', handleWatchYT);
      window.removeEventListener('on_house_open_web_url', handleOpenWebUrl);
    };
  }, []);

  const handleMarketItemImported = (item: MarketItem, resultId?: string) => {
    fetchHouseMaps(houseCode).then((mapsData) => {
      setActiveMaps(mapsData);
      const fetchedMapIds = Object.keys(mapsData);
      if (fetchedMapIds.length > 0) {
        setAvailableMapIds(fetchedMapIds);
      }
      if (item.type === 'map' && resultId) {
        handleMapChange(resultId);
      }
    });
    setAssetVersion((v) => v + 1);
    window.dispatchEvent(new Event('on_house_sprites_updated'));
    showToast(`🎉 [${item.title}]이(가) 내 하우스 DB로 복사되었습니다! 마음에 들게 자유롭게 편집해보세요.`);
  };

  // Memos & Inventory State
  const [memos, setMemos] = useState<MapMemo[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>(getLocalInventory);
  const [activeCreateMemoPos, setActiveCreateMemoPos] = useState<{ x: number; y: number } | null>(null);
  const [activeViewMemo, setActiveViewMemo] = useState<MapMemo | null>(null);
  const [showInventoryModal, setShowInventoryModal] = useState<boolean>(false);
  const memoChannelRef = useRef<any>(null);

  // Load Memos from DB per map
  useEffect(() => {
    fetchHouseMemos(houseCode, localPlayer.mapId).then(setMemos);
  }, [houseCode, localPlayer.mapId]);

  // Handle Create Memo Submission
  const handleCreateMemoSubmit = (newMemo: MapMemo) => {
    // 1. Instant Optimistic local state update!
    setMemos(prev => [...prev.filter(m => m.id !== newMemo.id), newMemo]);
    setActiveCreateMemoPos(null);

    // 2. Non-blocking async DB save in background
    saveMemoToDB(houseCode, newMemo);

    // 3. Instant Realtime broadcast to online players via connected channel
    safeBroadcastChannel('memo_add', newMemo);
  };

  // Handle Pickup One-Time Memo to Inventory (🎒 장비함)
  const handlePickupMemo = (memo: MapMemo) => {
    // Delete from map DB & state
    deleteMemoFromDB(houseCode, memo.mapId, memo.id);
    setMemos(prev => prev.filter(m => m.id !== memo.id));
    setActiveViewMemo(null);

    // Broadcast deletion to other players via connected channel
    safeBroadcastChannel('memo_delete', { id: memo.id, mapId: memo.mapId });

    // Add to Inventory
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const invItem: InventoryItem = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: memo.content ? memo.content.substring(0, 15) : '메모 아이템',
      itemType: 'memo',
      memoType: memo.memoType,
      content: memo.content,
      imageUrl: memo.imageUrl,
      authorName: memo.authorName,
      createdAt: memo.createdAt,
      receivedAt: formattedDate
    };

    const updatedInv = [invItem, ...inventory];
    setInventory(updatedInv);
    saveLocalInventory(updatedInv);
  };

  // Handle Drop Inventory Item back onto map floor
  const handleDropItemToMap = (item: InventoryItem) => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newMemo: MapMemo = {
      id: `memo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      mapId: localPlayer.mapId,
      x: Math.round(localPlayer.x),
      y: Math.round(localPlayer.y),
      authorId: localPlayer.id,
      authorName: item.authorName || localPlayer.nickname,
      memoType: item.memoType || 'one_time',
      content: item.content || '',
      imageUrl: item.imageUrl,
      createdAt: formattedDate
    };

    // 1. Instant Optimistic local state update!
    setMemos(prev => [...prev.filter(m => m.id !== newMemo.id), newMemo]);

    // 2. Non-blocking async DB save in background
    saveMemoToDB(houseCode, newMemo);

    // Remove from Inventory
    const updatedInv = inventory.filter(i => i.id !== item.id);
    setInventory(updatedInv);
    saveLocalInventory(updatedInv);

    // Broadcast addition to other players via connected channel
    safeBroadcastChannel('memo_add', newMemo);
  };

  // Handle Delete Inventory Item
  const handleDeleteInventoryItem = (itemId: string) => {
    const updatedInv = inventory.filter(i => i.id !== itemId);
    setInventory(updatedInv);
    saveLocalInventory(updatedInv);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 3.5. Map Editor states
  const [showProfessionalEditor, setShowProfessionalEditor] = useState(false);

  // 4. In-game logs & popups
  const [chatLogs, setChatLogs] = useState<ChatLogMessage[]>([]);
  const [chatBubbles, setChatBubbles] = useState<Record<string, { text: string; time: number }>>({});
  const [chatInput, setChatInput] = useState('');
  const [chatChannel, setChatChannel] = useState<'global' | 'map'>('global');
  const [unreadCount, setUnreadCount] = useState(0);

  // 4.5 Quick Counter-Reaction Prompt state (F key interaction)
  const [reactionPrompt, setReactionPrompt] = useState<{
    fromId: string;
    fromName: string;
    emoji: string;
    expiresAt: number;
  } | null>(null);

  const reactionPromptRef = useRef(reactionPrompt);
  reactionPromptRef.current = reactionPrompt;
  const promptTimerRef = useRef<any>(null);

  const showReactionPrompt = (fromId: string, fromName: string, emoji: string) => {
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);

    const newPrompt = {
      fromId,
      fromName: fromName || '친구',
      emoji,
      expiresAt: Date.now() + 3000
    };

    setReactionPrompt(newPrompt);

    promptTimerRef.current = setTimeout(() => {
      setReactionPrompt((curr) => (curr && curr.expiresAt <= Date.now() ? null : curr));
    }, 3050);
  };

  // Broadcast Channel reference
  const bcRef = useRef<BroadcastChannel | null>(null);

  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatLogScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat log inside chat box when new messages arrive
  useEffect(() => {
    if (chatLogScrollRef.current) {
      chatLogScrollRef.current.scrollTop = chatLogScrollRef.current.scrollHeight;
    }
  }, [chatLogs]);

  // Global F key shortcut for counter-reaction
  useEffect(() => {
    const handleFKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName || ''))) return;

      if (e.key === 'f' || e.key === 'F' || e.key === 'ㄹ') {
        if (reactionPromptRef.current && Date.now() < reactionPromptRef.current.expiresAt) {
          e.preventDefault();
          triggerCounterReaction();
        }
      }
    };

    window.addEventListener('keydown', handleFKey);
    return () => window.removeEventListener('keydown', handleFKey);
  }, []);

  // Global Enter key shortcut to focus chat input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if editing map or customizing avatar
      if (showProfessionalEditor || isCustomizing || activeDMTarget) {
        return;
      }

      if (e.key === 'Enter') {
        if (document.activeElement !== chatInputRef.current) {
          e.preventDefault();
          chatInputRef.current?.focus();
        }
      } else if (e.key === 'Escape') {
        if (document.activeElement === chatInputRef.current) {
          e.preventDefault();
          chatInputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showProfessionalEditor, isCustomizing, activeDMTarget]);

  // Mobile responsive detection
  const [isMobile, setIsMobile] = useState(false);
  const [assetVersion, setAssetVersion] = useState<number>(0);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Helper to fetch custom character asset data for player sync
  const getCustomCharData = (spriteType: string) => {
    try {
      const saved = localStorage.getItem('on_house_custom_char_sprites');
      const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
      const list: any[] = saved ? JSON.parse(saved) : [];
      const overrides = overridesSaved ? JSON.parse(overridesSaved) : {};

      const found = list.find((item: any) => item.id === spriteType);
      const override = overrides[spriteType];

      if (override || found) {
        return {
          id: spriteType,
          name: found?.name || spriteType,
          cols: override?.cols || found?.cols || 4,
          rows: override?.rows || found?.rows || 7
        };
      }
    } catch (e) {}
    return null;
  };

  const channelRef = useRef<RealtimeChannel | null>(null);

  const safeBroadcastChannel = (event: string, payload: any) => {
    if (channelRef.current) {
      try {
        channelRef.current.send({
          type: 'broadcast',
          event,
          payload
        });
      } catch (e) {}
    }
  };

  const sendPlayerSync = (playerData: PlayerState) => {
    try {
      const customData = getCustomCharData(playerData.spriteType);

      // 1. Broadcast over active Supabase Realtime channel
      safeBroadcastChannel('player_sync', {
        ...playerData,
        customCharData: customData
      });

      // 2. Broadcast over BroadcastChannel for tabs on same device
      if (bcRef.current) {
        bcRef.current.postMessage({
          type: 'move',
          playerId: playerData.id,
          nickname: playerData.nickname,
          spriteType: playerData.spriteType,
          hue: playerData.hue,
          charSize: playerData.charSize,
          x: playerData.x,
          y: playerData.y,
          dir: playerData.dir,
          isMoving: playerData.isMoving,
          mapId: playerData.mapId
        });
      }
    } catch (e) {}
  };

  // Keep player state ref up-to-date for event handlers
  const localPlayerRef = useRef<PlayerState>(localPlayer);
  useEffect(() => {
    localPlayerRef.current = localPlayer;
    // Save settings immediately
    localStorage.setItem('on_house_nickname', localPlayer.nickname);
    localStorage.setItem('on_house_sprite', localPlayer.spriteType);
    localStorage.setItem('on_house_hue', localPlayer.hue.toString());
    localStorage.setItem('on_house_status', localPlayer.statusMessage);

    // Broadcast player update to Supabase Realtime channel
    sendPlayerSync(localPlayer);
  }, [localPlayer, houseCode]);

  // Supabase House DB fetch & Realtime WebSocket Channel
  useEffect(() => {
    setIsHouseLoaded(false);

    // 1. Load house maps & custom assets from Supabase DB
    Promise.all([
      fetchHouseMaps(houseCode),
      fetchHouseAssets(houseCode),
      fetchHouseMapOrder(houseCode)
    ]).then(([mapsData, assetsData, dbMapOrder]) => {
      if (mapsData && Object.keys(mapsData).length > 0) {
        applyFetchedMapOrder(mapsData, dbMapOrder);
      }

      if (assetsData) {
        const { mapTilesets, charSprites, charOverrides, charRowActions } = assetsData;
        setDbCustomCharSprites(charSprites || []);
        setDbCharOverrides(charOverrides || {});
        
        const safeCacheSet = (key: string, value: string) => {
          try {
            localStorage.setItem(key, value);
          } catch (e) {
            console.warn(`[OnHouse Cache] LocalStorage quota hit writing "${key}", skipping local cache.`);
          }
        };
        if (mapTilesets && mapTilesets.length > 0) {
          safeCacheSet('on_house_custom_map_tilesets', JSON.stringify(mapTilesets));
        }
        if (charSprites) {
          const lightweightChars = charSprites.map(({ url, ...meta }: any) => meta);
          safeCacheSet('on_house_custom_char_sprites', JSON.stringify(lightweightChars));
        }
        if (charOverrides) {
          safeCacheSet('on_house_char_image_overrides', JSON.stringify(charOverrides));
        }
        if (charRowActions && Object.keys(charRowActions).length > 0) {
          safeCacheSet('on_house_char_row_actions', JSON.stringify(charRowActions));
        }
        setAssetVersion((v) => v + 1);
        window.dispatchEvent(new Event('on_house_sprites_updated'));
      }
      setIsHouseLoaded(true);
    }).catch((err) => {
      console.warn('[OnHouse Sync] Error loading house data from DB:', err);
      setIsHouseLoaded(true);
    });

    // 3. Connect Supabase Realtime channel with presence tracking
    const channel = supabase.channel(`house:${houseCode}`, {
      config: {
        presence: {
          key: deviceId.current
        }
      }
    });

    channel
      .on('broadcast', { event: 'map_order_update' }, ({ payload }) => {
        if (payload && Array.isArray(payload.order) && payload.order.length > 0) {
          setAvailableMapIds(payload.order);
          try {
            localStorage.setItem(`on_house_available_maps_${houseCode}`, JSON.stringify(payload.order));
          } catch (e) {}
        }
      })
      .on('broadcast', { event: 'player_join' }, ({ payload }) => {
        if (!payload || !payload.id || payload.id === deviceId.current) return;
        const joinName = payload.nickname || payload.player?.nickname || '플레이어';

        setOtherPlayers((prev) => {
          const isAlreadyPresent = !!prev[payload.id];
          if (!isAlreadyPresent) {
            setChatLogs((logs) => [
              ...logs,
              {
                id: 'sys_join_' + Date.now() + Math.random(),
                senderName: '🚀 시스템',
                text: `${joinName}님이 접속하였습니다.`,
                time: Date.now()
              }
            ]);
          }
          return {
            ...prev,
            [payload.id]: payload.player || { id: payload.id, nickname: joinName }
          };
        });

        // Reply immediately so the joining player receives our presence state
        sendPlayerSync(localPlayerRef.current);
      })
      .on('broadcast', { event: 'player_leave' }, ({ payload }) => {
        if (!payload || !payload.id || payload.id === deviceId.current) return;
        const leaveName = payload.nickname || '플레이어';

        setOtherPlayers((prev) => {
          if (prev[payload.id]) {
            setChatLogs((logs) => [
              ...logs,
              {
                id: 'sys_leave_' + Date.now() + Math.random(),
                senderName: '🚀 시스템',
                text: `${leaveName}님이 퇴장하였습니다.`,
                time: Date.now()
              }
            ]);

            return {
              ...prev,
              [payload.id]: {
                ...prev[payload.id],
                isOnline: false,
                statusMessage: '오프라인',
                lastActive: Date.now()
              }
            };
          }
          return prev;
        });
      })
      .on('broadcast', { event: 'player_sync' }, ({ payload }) => {
        if (!payload) return;
        const data = payload.player || payload;
        const playerId = data.id || payload.id;
        if (!playerId || playerId === deviceId.current) return;

        // If player has custom char data, dynamically update local asset cache & overrides
        const customCharData = data.customCharData || payload.customCharData;
        if (customCharData && customCharData.id && customCharData.url) {
          try {
            const saved = localStorage.getItem('on_house_custom_char_sprites');
            const current: any[] = saved ? JSON.parse(saved) : [];
            const idx = current.findIndex((item: any) => item.id === customCharData.id);
            let next: any[];
            if (idx >= 0) {
              next = [...current];
              next[idx] = { ...next[idx], ...customCharData };
            } else {
              next = [...current, customCharData];
            }
            localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));

            const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
            const overrides = overridesSaved ? JSON.parse(overridesSaved) : {};
            overrides[customCharData.id] = {
              url: customCharData.url,
              cols: customCharData.cols || 4,
              rows: customCharData.rows || 7
            };
            localStorage.setItem('on_house_char_image_overrides', JSON.stringify(overrides));

            window.dispatchEvent(new Event('on_house_sprites_updated'));
            setAssetVersion((v) => v + 1);
          } catch (e) {}
        }

        setOtherPlayers((prev) => {
          const existing = prev[playerId];
          if (!existing) {
            setChatLogs((logs) => [
              ...logs,
              {
                id: 'sys_join_sync_' + Date.now() + Math.random(),
                senderName: '🚀 시스템',
                text: `${data.nickname || '플레이어'}님이 접속하였습니다.`,
                time: Date.now()
              }
            ]);
          }
          return {
            ...prev,
            [playerId]: {
              ...(existing || {}),
              ...data,
              id: playerId,
              isOnline: true,
              lastActive: Date.now()
            }
          };
        });
      })
      .on('broadcast', { event: 'heartbeat' }, ({ payload }) => {
        if (!payload || !payload.id || payload.id === deviceId.current) return;
        setOtherPlayers((prev) => {
          const existing = prev[payload.id];
          const isOfflineMsg = payload.player?.statusMessage === '오프라인';
          if (!existing) {
            return {
              ...prev,
              [payload.id]: {
                ...payload.player,
                isOnline: !isOfflineMsg,
                lastActive: Date.now()
              }
            };
          }
          return {
            ...prev,
            [payload.id]: {
              ...existing,
              ...payload.player,
              isOnline: !isOfflineMsg,
              lastActive: Date.now()
            }
          };
        });
      })
      .on('broadcast', { event: 'request_player_sync' }, ({ payload }) => {
        if (!payload || payload.fromId === deviceId.current) return;
        // Reply with current local player state immediately!
        sendPlayerSync(localPlayerRef.current);
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        if (!payload || payload.id === deviceId.current) return;

        // If chat channel is 'map', ignore if the sender is NOT on the same map as local player!
        if (payload.channel === 'map' && payload.mapId !== localPlayerRef.current.mapId) {
          return;
        }

        if (payload.text && !payload.text.startsWith('/')) {
          if (payload.senderName !== '🚀 시스템' && (!payload.mapId || payload.mapId === localPlayerRef.current.mapId)) {
            setChatBubbles((prev) => ({
              ...prev,
              [payload.id]: { text: payload.text, time: Date.now() }
            }));
          }

          setChatLogs((prev) => [
            ...prev,
            {
              id: 'chat_rec_' + Date.now() + Math.random(),
              senderName: payload.senderName || '다른 플레이어',
              text: payload.text,
              time: Date.now(),
              channel: payload.channel || 'global',
              mapName: payload.mapName
            }
          ]);
        }
      })
      .on('broadcast', { event: 'map_update' }, ({ payload }) => {
        if (!payload || !payload.mapId || !payload.mapData) return;
        setActiveMaps((prev) => ({
          ...prev,
          [payload.mapId]: payload.mapData
        }));
        setAvailableMapIds((prev) => {
          if (!prev.includes(payload.mapId)) {
            const next = [...prev, payload.mapId];
            localStorage.setItem(`on_house_available_maps_${houseCode}`, JSON.stringify(next));
            return next;
          }
          return prev;
        });
      })
      .on('broadcast', { event: 'map_delete' }, ({ payload }) => {
        if (!payload || !payload.mapId) return;
        const targetMapId = payload.mapId;
        
        setAvailableMapIds((prev) => {
          const next = prev.filter((id) => id !== targetMapId);
          localStorage.setItem(`on_house_available_maps_${houseCode}`, JSON.stringify(next));
          return next;
        });

        setActiveMaps((prev) => {
          const copy = { ...prev };
          delete copy[targetMapId];
          return copy;
        });

        localStorage.removeItem('on_house_map_' + targetMapId);
      })
      .on('broadcast', { event: 'asset_update' }, ({ payload }) => {
        if (!payload || !payload.assetType || !payload.assetData) return;
        const { assetType, assetData } = payload;
        if (assetType === 'map_tileset') {
          const saved = localStorage.getItem('on_house_custom_map_tilesets');
          const current: any[] = saved ? JSON.parse(saved) : [];
          const idx = current.findIndex((item: any) => item.id === assetData.id);
          let next: any[];
          if (idx >= 0) {
            next = [...current];
            next[idx] = { ...next[idx], ...assetData };
          } else {
            next = [...current, assetData];
          }
          localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(next));
          window.dispatchEvent(new Event('on_house_sprites_updated'));
          setAssetVersion((v) => v + 1);
        } else if (assetType === 'char_sprite') {
          const saved = localStorage.getItem('on_house_custom_char_sprites');
          const current: any[] = saved ? JSON.parse(saved) : [];
          const idx = current.findIndex((item: any) => item.id === assetData.id);
          let next: any[];
          if (idx >= 0) {
            next = [...current];
            next[idx] = { ...next[idx], ...assetData };
          } else {
            next = [...current, assetData];
          }
          localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));
          setDbCustomCharSprites(next);

          if (assetData.url) {
            try {
              const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
              const overrides = overridesSaved ? JSON.parse(overridesSaved) : {};
              overrides[assetData.id] = {
                url: assetData.url,
                cols: assetData.cols || 4,
                rows: assetData.rows || 7
              };
              localStorage.setItem('on_house_char_image_overrides', JSON.stringify(overrides));
            } catch (e) {}
          }

          window.dispatchEvent(new Event('on_house_sprites_updated'));
          setAssetVersion((v) => v + 1);
        } else if (assetType === 'char_image_override') {
          if (assetData && assetData.id) {
            setDbCharOverrides((prev) => ({
              ...prev,
              [assetData.id]: assetData
            }));
            try {
              const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
              const overrides = overridesSaved ? JSON.parse(overridesSaved) : {};
              overrides[assetData.id] = assetData;
              safeLocalStorageSetItem('on_house_char_image_overrides', JSON.stringify(overrides));
              window.dispatchEvent(new Event('on_house_sprites_updated'));
              setAssetVersion((v) => v + 1);
            } catch (e) {}
          }
        } else if (assetType === 'char_row_actions') {
          if (assetData && assetData.id && assetData.actions) {
            try {
              const savedActions = localStorage.getItem('on_house_char_row_actions');
              const actionsMap = savedActions ? JSON.parse(savedActions) : {};
              actionsMap[assetData.id] = assetData.actions;
              localStorage.setItem('on_house_char_row_actions', JSON.stringify(actionsMap));
              window.dispatchEvent(new Event('on_house_sprites_updated'));
              setAssetVersion((v) => v + 1);
            } catch (e) {}
          }
        }
      })
      .on('broadcast', { event: 'asset_delete' }, ({ payload }) => {
        if (!payload || !payload.assetId) return;
        const { assetType, assetId } = payload;
        if (assetType === 'char_sprite') {
          try {
            const saved = localStorage.getItem('on_house_custom_char_sprites');
            if (saved) {
              const current: any[] = JSON.parse(saved);
              const next = current.filter((item) => item.id !== assetId);
              localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));
              setDbCustomCharSprites(next);
            }
            const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
            if (overridesSaved) {
              const overrides = JSON.parse(overridesSaved);
              delete overrides[assetId];
              localStorage.setItem('on_house_char_image_overrides', JSON.stringify(overrides));
            }
            window.dispatchEvent(new Event('on_house_sprites_updated'));
            setAssetVersion((v) => v + 1);
          } catch (e) {}
        } else if (assetType === 'map_tileset') {
          try {
            const saved = localStorage.getItem('on_house_custom_map_tilesets');
            if (saved) {
              const current: any[] = JSON.parse(saved);
              const next = current.filter((item) => item.id !== assetId);
              localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(next));
            }
            window.dispatchEvent(new Event('on_house_sprites_updated'));
            setAssetVersion((v) => v + 1);
          } catch (e) {}
        }
      })
      .on('broadcast', { event: 'dm_request' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        setIncomingDMRequest({
          requesterId: payload.fromId,
          requesterName: payload.fromName,
          requesterPlayer: payload.fromPlayer
        });
      })
      .on('broadcast', { event: 'dm_accept' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        const partner = payload.accepterPlayer || otherPlayers[payload.fromId] || offlinePlayers[payload.fromId];
        if (partner) {
          setActiveDMTarget(partner);
          showToast(`[${payload.fromName}] 님이 1:1 놀기 요청을 수락했습니다!`);
        }
      })
      .on('broadcast', { event: 'dm_decline' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        showToast(`[${payload.fromName}] 님이 1:1 놀기 요청을 거절했습니다.`);
      })
      .on('broadcast', { event: 'media_viewing_update' }, ({ payload }) => {
        if (!payload || payload.deviceId === deviceId.current) return;

        setPartnerViewingState({
          videoId: payload.videoId,
          webUrl: payload.webUrl,
          syncEnabled: payload.syncEnabled
        });

        // If co-browsing sync is active, automatically navigate to partner's URL
        if (payload.syncEnabled && payload.webUrl) {
          setIsWebSyncActive(true);
          setActiveWebUrl(payload.webUrl);
        }
      })
      .on('broadcast', { event: 'dm_close' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        const partnerName = payload.fromName || '상대방';

        // Mark partner as closed to display single clean red warning banner inside Messenger
        setClosedDMPartners((prev) => ({ ...prev, [payload.fromId]: true }));
        showToast(`🚨 [${partnerName}] 님이 1:1 놀기를 종료했습니다.`);
        updateUnreadCount();
      })
      .on('broadcast', { event: 'memo_add' }, ({ payload }) => {
        if (payload && payload.mapId === localPlayerRef.current.mapId) {
          setMemos((prev) => [...prev.filter((m) => m.id !== payload.id), payload]);
          const currentLocal = getLocalMemos(houseCode, payload.mapId);
          saveLocalMemos(houseCode, payload.mapId, [...currentLocal.filter((m) => m.id !== payload.id), payload]);
        }
      })
      .on('broadcast', { event: 'memo_delete' }, ({ payload }) => {
        if (payload && payload.id) {
          setMemos((prev) => prev.filter((m) => m.id !== payload.id));
          if (payload.mapId) {
            deleteLocalMemo(houseCode, payload.mapId, payload.id);
          }
        }
      })
      .on('broadcast', { event: 'dm_read' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        markMySentDMsAsRead(payload.toId, payload.fromId);
        window.dispatchEvent(new Event('on_house_dm_read'));
      })
      .on('broadcast', { event: 'reaction_anim' }, ({ payload }) => {
        if (!payload) return;
        // Ignore echo broadcast originating from ourselves (already spawned locally)
        if (payload.fromId === deviceId.current) return;

        const adjustedPayload = { ...payload };
        if (adjustedPayload.toId === deviceId.current) {
          // I am the target receiver of this reaction!
          adjustedPayload.toPos = { x: localPlayerRef.current.x, y: localPlayerRef.current.y };
          const sender = otherPlayersRef.current[adjustedPayload.fromId];
          if (sender) {
            adjustedPayload.fromPos = { x: sender.x, y: sender.y };
          }
        }

        window.dispatchEvent(new CustomEvent('on_house_spawn_particle', { detail: adjustedPayload }));

        if (payload.toId === deviceId.current && payload.fromId && payload.fromId !== deviceId.current) {
          const emoji = payload.emoji || (
            payload.type === 'heart' ? '❤️' :
            payload.type === 'greeting' ? '👋' :
            payload.type === 'cheer' ? '👏' :
            payload.type === 'celebrate' ? '🎉' :
            payload.type === 'flame' ? '🔥' :
            payload.type === 'coffee' ? '☕' : '❤️'
          );
          showReactionPrompt(payload.fromId, payload.fromName || '친구', emoji);
        }

        if (payload.type === 'greeting' && payload.fromName) {
          setChatLogs((logs) => [
            ...logs,
            {
              id: 'sys_greet_' + Date.now() + Math.random(),
              senderName: '🚀 시스템',
              text: `${payload.fromName}님이 [${payload.toName || '상대방'}] 님에게 인사를 건넸습니다: "안녕하세요! 👋"`,
              time: Date.now()
            }
          ]);
        } else if (payload.type === 'coffee' && payload.fromName) {
          setChatLogs((logs) => [
            ...logs,
            {
              id: 'sys_coffee_' + Date.now() + Math.random(),
              senderName: '🚀 시스템',
              text: `${payload.fromName}님이 [${payload.toName || '상대방'}] 님에게 다가가 물었습니다: "커피 한 잔 하실래요? ☕"`,
              time: Date.now()
            }
          ]);
        }
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (!payload) return;
        if (payload.toId === deviceId.current || payload.toId) {
          setChatBubbles((prev) => ({
            ...prev,
            [payload.toId]: { text: payload.emoji, time: Date.now() }
          }));
          if (payload.toId === deviceId.current && payload.fromId && payload.fromId !== deviceId.current) {
            showToast(`[${payload.fromName}] 님이 ${payload.emoji} 반응을 보냈습니다!`);
            showReactionPrompt(payload.fromId, payload.fromName || '친구', payload.emoji || '❤️');
          }
        }
      })
      .on('broadcast', { event: 'dm_msg' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        saveDM({
          id: 'dm_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36),
          fromId: payload.fromId,
          fromName: payload.fromName,
          toId: deviceId.current,
          text: payload.text,
          timestamp: payload.timestamp || Date.now(),
          read: false
        });
        markMySentDMsAsRead(deviceId.current, payload.fromId);
        window.dispatchEvent(new Event('on_house_dm_read'));
        updateUnreadCount();
      })
      .on('broadcast', { event: 'ping_check' }, ({ payload }) => {
        if (!payload || payload.targetId !== deviceId.current) return;
        try {
          channel.send({
            type: 'broadcast',
            event: 'pong_reply',
            payload: { fromId: deviceId.current, targetId: payload.fromId }
          });
        } catch (e) {}
      })
      .on('broadcast', { event: 'pong_reply' }, ({ payload }) => {
        if (!payload || payload.targetId !== deviceId.current) return;
        const cb = pendingPingCallbacksRef.current[payload.fromId];
        if (cb) {
          cb(true);
          delete pendingPingCallbacksRef.current[payload.fromId];
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Welcome message for self
          setChatLogs((logs) => [
            ...logs,
            {
              id: 'sys_welcome_' + Date.now(),
              senderName: '🚀 시스템',
              text: `온하우스 [${houseCode}] 에 접속하였습니다.`,
              time: Date.now()
            }
          ]);

          channelRef.current = channel;
          try {
            channel.track({
              id: deviceId.current,
              nickname: localPlayerRef.current.nickname,
              online_at: new Date().toISOString()
            });
          } catch (e) {}

          // Broadcast player_join to all clients
          channel.send({
            type: 'broadcast',
            event: 'player_join',
            payload: {
              id: deviceId.current,
              nickname: localPlayerRef.current.nickname,
              player: localPlayerRef.current
            }
          });

          sendPlayerSync(localPlayerRef.current);
          channel.send({
            type: 'broadcast',
            event: 'request_player_sync',
            payload: { fromId: deviceId.current }
          });
        }
      });

    // Periodic heartbeat sync interval every 8 seconds to ensure position alignment across computers
    const syncInterval = setInterval(() => {
      if (channelRef.current) {
        sendPlayerSync(localPlayerRef.current);
      }
    }, 8000);

    // Window unload / tab close listener to broadcast player_leave & dm_close events
    const handleUnload = () => {
      if (activeDMTargetRef.current) {
        safeBroadcastChannel('dm_close', {
          fromId: localPlayerRef.current.id,
          fromName: localPlayerRef.current.nickname,
          toId: activeDMTargetRef.current.id
        });
      }
      try {
        channel.send({
          type: 'broadcast',
          event: 'player_leave',
          payload: {
            id: deviceId.current,
            nickname: localPlayerRef.current.nickname
          }
        });
      } catch (e) {}

      if (bcRef.current) {
        bcRef.current.postMessage({
          type: 'leave',
          playerId: deviceId.current,
          nickname: localPlayerRef.current.nickname
        });
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(syncInterval);
      handleUnload();
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [houseCode]);

  const handleJoinHouse = (newCode: string) => {
    const formatted = setSavedHouseCode(newCode);
    if (formatted === houseCode) {
      setShowHouseModal(false);
      return;
    }

    // Reset other players list completely when joining a different house room!
    setOtherPlayers({});

    // Reset activeMaps to fresh deep clones while fetching new house maps from DB
    setActiveMaps(JSON.parse(JSON.stringify(maps)));

    // Reset house code state
    setHouseCodeState(formatted);
    setShowHouseModal(false);
    showToast(`온하우스 [${formatted}] 방으로 이동하였습니다.`);
  };

  // Safety check: Teleport player back inside map ONLY if completely out of bounds (e.g. when map size shrinks)
  useEffect(() => {
    const currentMap = activeMaps[localPlayer.mapId];
    if (currentMap) {
      const maxX = (currentMap.width - 1) * 16;
      const maxY = (currentMap.height - 1) * 16;
      if (localPlayer.x < 0 || localPlayer.x > maxX || localPlayer.y < 0 || localPlayer.y > maxY || isPlayerCollidingAt(currentMap, localPlayer.x, localPlayer.y)) {
        const spawn = findValidSpawnPosition(currentMap);
        setLocalPlayer((p) => ({
          ...p,
          x: spawn.x * 16,
          y: spawn.y * 16
        }));
      }
    }
  }, [localPlayer.mapId, activeMaps, localPlayer.x, localPlayer.y]);

  // Read unread DMs
  const updateUnreadCount = () => {
    const allDMs = getDMs();
    const unreads = allDMs.filter(dm => dm.toId === deviceId.current && !dm.read);
    setUnreadCount(unreads.length);
  };

  // Auto-sync charSize when character display size is updated in Pixel Editor
  useEffect(() => {
    const handleSpriteUpdate = () => {
      setLocalPlayer((prev) => {
        // If user has set a personalCharSize in Customizer, personalCharSize ALWAYS TAKES PRIORITY!
        if (prev.personalCharSize) {
          if (prev.charSize === prev.personalCharSize) return prev;
          const updated = { ...prev, charSize: prev.personalCharSize };
          sendPlayerSync(updated);
          return updated;
        }
        // Otherwise, use default base size configured for this character in Pixel Editor
        const nextSize = getCharDisplaySize(prev.spriteType);
        if (prev.charSize === nextSize) return prev;
        const updated = { ...prev, charSize: nextSize };
        sendPlayerSync(updated);
        return updated;
      });
    };

    window.addEventListener('on_house_sprites_updated', handleSpriteUpdate);
    return () => window.removeEventListener('on_house_sprites_updated', handleSpriteUpdate);
  }, []);

  // Initialize sync channel per house code
  useEffect(() => {
    const bc = new BroadcastChannel('on_house_sync_' + houseCode);
    bcRef.current = bc;

    // Wake up: remove our device from offline lists across all tabs
    removeOfflineUser(deviceId.current);
    setOfflinePlayers(getOfflineUsers());

    // Broadcast our arrival
    bc.postMessage({
      type: 'join',
      player: localPlayerRef.current
    });

    // Handle messages
    bc.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.senderId === deviceId.current) return;

      switch (msg.type) {
        case 'join':
          // Another player joined, respond with our state
          setOtherPlayers((prev) => ({
            ...prev,
            [msg.player.id]: msg.player
          }));
          // Remove them from offline list
          removeOfflineUser(msg.player.id);
          setOfflinePlayers(getOfflineUsers());

          bc.postMessage({
            type: 'sync_response',
            player: localPlayerRef.current
          });
          break;

        case 'sync_response':
          // Update player list with existing players
          setOtherPlayers((prev) => ({
            ...prev,
            [msg.player.id]: msg.player
          }));
          // Remove from offline
          removeOfflineUser(msg.player.id);
          setOfflinePlayers(getOfflineUsers());
          break;

        case 'move':
          setOtherPlayers((prev) => {
            const existing = prev[msg.playerId];
            const updatedPlayer = existing
              ? {
                  ...existing,
                  x: msg.x,
                  y: msg.y,
                  dir: msg.dir,
                  isMoving: msg.isMoving,
                  mapId: msg.mapId,
                  isOnline: true,
                  lastActive: Date.now()
                }
              : {
                  id: msg.playerId,
                  nickname: msg.nickname || '다른 플레이어',
                  spriteType: msg.spriteType || 'char_a',
                  x: msg.x,
                  y: msg.y,
                  dir: msg.dir || 'down',
                  isMoving: msg.isMoving || false,
                  statusMessage: '',
                  hue: msg.hue || 0,
                  charSize: msg.charSize || 1,
                  mapId: msg.mapId || 'room',
                  isOnline: true,
                  lastActive: Date.now()
                };
            return {
              ...prev,
              [msg.playerId]: updatedPlayer
            };
          });
          break;

        case 'chat':
          if (msg.channel === 'map' && msg.mapId !== localPlayerRef.current.mapId) {
            break;
          }
          setOtherPlayers((prev) => {
            const p = prev[msg.playerId];
            if (!p) return prev;
            return {
              ...prev,
              [msg.playerId]: {
                ...p,
                isOnline: true
              }
            };
          });
          // Add to speech bubble (Do NOT display slash commands or system messages)
          if (msg.text && !msg.text.startsWith('/') && msg.senderName !== '🚀 시스템') {
            setChatBubbles((prev) => ({
              ...prev,
              [msg.playerId]: { text: msg.text, time: Date.now() }
            }));
          }
          // Add to chat logs
          setChatLogs((prev) => [
            ...prev,
            {
              id: 'chat_' + Math.random().toString(36).substring(2, 11),
              senderName: msg.senderName,
              text: msg.text,
              time: Date.now(),
              channel: msg.channel || 'global',
              mapName: msg.mapName
            }
          ]);
          break;

        case 'status':
          setOtherPlayers((prev) => {
            const p = prev[msg.playerId];
            if (!p) return prev;
            return {
              ...prev,
              [msg.playerId]: {
                ...p,
                statusMessage: msg.statusMessage,
                isOnline: true
              }
            };
          });
          break;

        case 'heartbeat':
          if (msg.playerId && msg.playerId !== deviceId.current) {
            setOtherPlayers((prev) => {
              const existing = prev[msg.playerId];
              if (!existing) return prev;
              const isOfflineMsg = msg.player?.statusMessage === '오프라인';
              return {
                ...prev,
                [msg.playerId]: {
                  ...existing,
                  ...msg.player,
                  isOnline: !isOfflineMsg,
                  lastActive: Date.now()
                }
              };
            });
          }
          break;

        case 'dm_close':
          if (msg.toId === deviceId.current) {
            const partnerName = msg.fromName || '상대방';
            setClosedDMPartners((prev) => ({ ...prev, [msg.fromId]: true }));
            showToast(`🚨 [${partnerName}] 님이 1:1 놀기를 종료했습니다.`);
            updateUnreadCount();
          }
          break;

        case 'leave':
          if (msg.playerId && msg.playerId !== deviceId.current) {
            setOtherPlayers((prev) => {
              if (prev[msg.playerId]) {
                const leaveName = msg.nickname || '플레이어';
                setChatLogs((logs) => [
                  ...logs,
                  {
                    id: 'sys_leave_bc_' + Date.now() + Math.random(),
                    senderName: '🚀 시스템',
                    text: `${leaveName}님이 퇴장하였습니다.`,
                    time: Date.now()
                  }
                ]);
                return {
                  ...prev,
                  [msg.playerId]: {
                    ...prev[msg.playerId],
                    isOnline: false,
                    statusMessage: '오프라인',
                    lastActive: Date.now()
                  }
                };
              }
              return prev;
            });
          }
          // Update offline users list
          setOfflinePlayers(() => getOfflineUsers());
          break;

        case 'dm':
          // If the message is addressed to us
          if (msg.toId === deviceId.current) {
            const newDM: DirectMessage = {
              id: msg.id,
              fromId: msg.fromId,
              fromName: msg.fromName,
              toId: msg.toId,
              text: msg.text,
              timestamp: msg.timestamp,
              read: false
            };
            saveDM(newDM);
            updateUnreadCount();
          }
          break;

        case 'map_update':
          setActiveMaps((prev) => {
            const targetMap = prev[msg.mapId];
            if (!targetMap) return prev;

            const newBase = targetMap.baseLayer.map((r) => [...r]);
            const newDecor = targetMap.decorLayer.map((r) => [...r]);
            const newCollision = targetMap.collision.map((r) => [...r]);

            if (msg.layer === 'base') {
              newBase[msg.ty][msg.tx] = msg.tileIdx;
            } else if (msg.layer === 'decor') {
              newDecor[msg.ty][msg.tx] = msg.tileIdx;
            } else if (msg.layer === 'collision') {
              newCollision[msg.ty][msg.tx] = msg.tileIdx === 1;
            }

            const updatedMap = {
              ...targetMap,
              baseLayer: newBase,
              decorLayer: newDecor,
              collision: newCollision
            };

            localStorage.setItem('on_house_map_' + msg.mapId, JSON.stringify(updatedMap));

            return {
              ...prev,
              [msg.mapId]: updatedMap
            };
          });
          break;

        case 'map_full_update':
          if (msg.mapId && msg.mapData) {
            setActiveMaps((prev) => {
              localStorage.setItem('on_house_map_' + msg.mapId, JSON.stringify(msg.mapData));
              return {
                ...prev,
                [msg.mapId]: msg.mapData
              };
            });
            setAvailableMapIds((prev) => {
              if (!prev.includes(msg.mapId)) {
                const next = [...prev, msg.mapId];
                localStorage.setItem(`on_house_available_maps_${houseCode}`, JSON.stringify(next));
                return next;
              }
              return prev;
            });
          }
          break;

        case 'map_reset':
          if (!maps[msg.mapId]) break;
          setActiveMaps((prev) => {
            const updated = {
              ...prev,
              [msg.mapId]: { ...maps[msg.mapId] }
            };
            localStorage.removeItem('on_house_map_' + msg.mapId);
            return updated;
          });
          break;

        case 'map_fill_base':
          setActiveMaps((prev) => {
            const targetMap = prev[msg.mapId];
            if (!targetMap) return prev;
            const newBase = targetMap.baseLayer.map((r) => [...r]);
            for (let y = 0; y < targetMap.height; y++) {
              newBase[y].fill(msg.tileIdx);
            }
            const updatedMap = {
              ...targetMap,
              baseLayer: newBase
            };
            localStorage.setItem('on_house_map_' + msg.mapId, JSON.stringify(updatedMap));
            return {
              ...prev,
              [msg.mapId]: updatedMap
            };
          });
          break;
      }
    };

    // Heartbeat check (every 3 seconds, ping other players)
    const pingInterval = setInterval(() => {
      safeBroadcastChannel('player_sync', {
        id: deviceId.current,
        ...localPlayerRef.current,
        lastActive: Date.now()
      });
    }, 3000);

    // Read initial DMs and offline users
    updateUnreadCount();

    // Cleanup: save player as offline and notify others before leaving
    const handleLeave = () => {
      saveOfflineUser(localPlayerRef.current);
      bc.postMessage({
        type: 'leave',
        playerId: deviceId.current
      });
    };

    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('unload', handleLeave);

    return () => {
      clearInterval(pingInterval);
      handleLeave();
      bc.close();
    };
  }, [houseCode]);

  const lastSyncTimeRef = useRef<number>(0);

  // 1. Coordinate & movement updater
  const handleMove = (x: number, y: number, dir: 'down' | 'up' | 'left' | 'right', isMoving: boolean) => {
    setLocalPlayer((prev) => ({
      ...prev,
      x,
      y,
      dir,
      isMoving,
      lastActive: Date.now()
    }));

    // Broadcast coordinate shift for tabs on same device
    bcRef.current?.postMessage({
      type: 'move',
      playerId: deviceId.current,
      nickname: localPlayer.nickname,
      spriteType: localPlayer.spriteType,
      hue: localPlayer.hue,
      charSize: localPlayer.charSize,
      x,
      y,
      dir,
      isMoving,
      mapId: localPlayer.mapId
    });

    // Broadcast movement real-time over WebSocket to OTHER computers! (~30 updates/sec when moving, immediately when stopping)
    const now = Date.now();
    if (!isMoving || now - lastSyncTimeRef.current > 30) {
      lastSyncTimeRef.current = now;
      safeBroadcastChannel('player_sync', {
        id: deviceId.current,
        nickname: localPlayer.nickname,
        spriteType: localPlayer.spriteType,
        hue: localPlayer.hue,
        charSize: localPlayer.charSize,
        x,
        y,
        dir,
        isMoving,
        mapId: localPlayer.mapId,
        statusMessage: localPlayer.statusMessage,
        isOnline: true,
        lastActive: now
      });
    }
  };

  // 2. Map transitioner
  // mapDataOverride lets callers pass a map that was just created in this same tick (e.g.
  // handleAddMap), since setActiveMaps hasn't flushed into the `activeMaps` closure yet.
  const handleMapChange = (mapId: string, mapDataOverride?: MapDefinition) => {
    const targetMap = mapDataOverride || activeMaps[mapId] || maps[mapId];
    const spawn = findValidSpawnPosition(targetMap);
    const newX = spawn.x * 16;
    const newY = spawn.y * 16;

    setLocalPlayer((prev) => ({
      ...prev,
      mapId,
      x: newX,
      y: newY,
      dir: 'down',
      isMoving: false
    }));

    // Broadcast coordinate shift and map jump for tabs on same device
    bcRef.current?.postMessage({
      type: 'move',
      playerId: deviceId.current,
      nickname: localPlayer.nickname,
      spriteType: localPlayer.spriteType,
      hue: localPlayer.hue,
      charSize: localPlayer.charSize,
      x: newX,
      y: newY,
      dir: 'down',
      isMoving: false,
      mapId
    });

    const moveMsgText = `${localPlayerRef.current.nickname}님이 [${targetMap?.name || mapId}] 구역으로 이동하였습니다.`;

    // 1. Add to local chat logs for self
    setChatLogs((prev) => [
      ...prev,
      {
        id: 'system_' + Date.now(),
        senderName: '🚀 시스템',
        text: moveMsgText,
        time: Date.now()
      }
    ]);

    // 2. Broadcast system message to all connected players in the House via Supabase Realtime
    safeBroadcastChannel('chat', {
      id: deviceId.current,
      senderName: '🚀 시스템',
      text: moveMsgText
    });

    // 3. Broadcast system message to other local tabs
    bcRef.current?.postMessage({
      type: 'chat',
      playerId: deviceId.current,
      senderName: '🚀 시스템',
      text: moveMsgText
    });
  };

  // 2.5. Add Map and Delete Map Handlers
  const handleAddMap = (presetId?: string, customName?: string): string => {
    if (availableMapIds.length >= 4) {
      alert("맵은 최대 4개까지만 설정할 수 있습니다.");
      return '';
    }

    let newMapId = '';
    let newMapObj: MapDefinition;

    if (presetId && PRESET_MAP_TEMPLATES[presetId]) {
      newMapId = presetId;
      if (activeMaps[presetId]) {
        newMapObj = activeMaps[presetId];
      } else {
        newMapObj = PRESET_MAP_TEMPLATES[presetId].builder();
      }
    } else {
      const timestamp = Date.now();
      newMapId = `custom_${timestamp}`;
      const name = customName || `🎨 새 커스텀 맵 ${availableMapIds.length + 1}`;
      newMapObj = createCustomMap(newMapId, name, 'outdoor');
    }

    setActiveMaps((prev) => ({ ...prev, [newMapId]: newMapObj }));
    setAvailableMapIds((prev) => [...prev, newMapId]);
    saveHouseMapToDB(houseCode, newMapId, newMapObj);

    // Broadcast new map to all players in H-1002!
    safeBroadcastChannel('map_update', { mapId: newMapId, mapData: newMapObj });

    handleMapChange(newMapId, newMapObj);
    return newMapId;
  };

  const handleDeleteMap = async (mapId: string) => {
    if (availableMapIds.length <= 1) {
      alert("최소 1개의 맵은 항상 유지되어야 합니다.");
      return;
    }

    const mapName = activeMaps[mapId]?.name || mapId;
    const nextAvailable = availableMapIds.filter((id) => id !== mapId);

    // Update local states
    setAvailableMapIds(nextAvailable);

    setActiveMaps((prev) => {
      const copy = { ...prev };
      delete copy[mapId];
      return copy;
    });

    // 1. Delete permanently from Supabase Cloud DB!
    await deleteHouseMapFromDB(houseCode, mapId);

    // 2. Broadcast map_delete event to all connected players in the House
    safeBroadcastChannel('map_delete', { mapId });

    if (localPlayer.mapId === mapId) {
      handleMapChange(nextAvailable[0]);
    }

    showToast(`'${mapName}' 맵이 삭제되었으며 서버 DB에 반영되었습니다.`);
  };

  const handleRenameMap = async (mapId: string, newName: string) => {
    if (!newName.trim()) return;

    setActiveMaps((prev) => {
      const target = prev[mapId];
      if (!target) return prev;
      const updatedMap = { ...target, name: newName.trim() };

      // Save updated map name to Supabase Cloud DB
      saveHouseMapToDB(houseCode, mapId, updatedMap);

      // 3. Broadcast map_update to all connected players
      safeBroadcastChannel('map_update', { mapId, mapData: updatedMap });

      return { ...prev, [mapId]: updatedMap };
    });

    showToast(`맵 이름이 '${newName.trim()}'(으)로 변경되었습니다.`);
  };

  // 3. Status picker updater
  const handleStatusChange = (statusMessage: string) => {
    const isOfflineMode = statusMessage === '오프라인';
    setLocalPlayer((prev) => ({
      ...prev,
      statusMessage,
      isOnline: !isOfflineMode
    }));

    bcRef.current?.postMessage({
      type: 'status',
      playerId: deviceId.current,
      statusMessage,
      isOnline: !isOfflineMode
    });

    safeBroadcastChannel('player_sync', {
      id: deviceId.current,
      player: {
        ...localPlayerRef.current,
        statusMessage,
        isOnline: !isOfflineMode
      }
    });

    if (isOfflineMode) {
      showToast('상태가 💤 오프라인(비활성화)으로 변경되었습니다.');
    } else {
      showToast(`상태가 '${statusMessage}'(으)로 변경되었습니다.`);
    }
  };

  // 4. Chat messaging submit
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) {
      chatInputRef.current?.blur();
      return;
    }

    const text = chatInput.trim();

    // Check for Slash Command Emotes (e.g., /환호, /공격, /댄스)
    if (text.startsWith('/')) {
      const commandName = text.slice(1).trim();
      const charId = localPlayer.spriteType;
      const rowActions = getCharRowActions(charId);
      const foundRowIndex = rowActions.findIndex(act => act.toLowerCase() === commandName.toLowerCase());

      if (foundRowIndex >= 0) {
        setLocalPlayer((prev) => ({
          ...prev,
          currentEmote: commandName,
          emoteUntil: Date.now() + 3500
        }));
      }
    }

    // Trigger local speech bubble (Do NOT display slash commands starting with '/')
    if (!text.startsWith('/')) {
      setChatBubbles((prev) => ({
        ...prev,
        [deviceId.current]: { text, time: Date.now() }
      }));
    }

    const currentMapObj = activeMaps[localPlayer.mapId];
    const mapName = currentMapObj ? currentMapObj.name : localPlayer.mapId;
    const formattedSenderName = `${localPlayer.isMobile ? '📱 ' : ''}${localPlayer.nickname}`;

    // Add to logs
    setChatLogs((prev) => [
      ...prev,
      {
        id: 'chat_me_' + Date.now(),
        senderName: formattedSenderName,
        text,
        time: Date.now(),
        channel: chatChannel,
        mapName: mapName
      }
    ]);

    // Broadcast chat via Supabase Realtime channel for cross-device users
    safeBroadcastChannel('chat', {
      id: deviceId.current,
      senderName: formattedSenderName,
      text,
      channel: chatChannel,
      mapId: localPlayer.mapId,
      mapName: mapName,
      timestamp: Date.now()
    });

    // Broadcast chat to other local tabs
    bcRef.current?.postMessage({
      type: 'chat',
      playerId: deviceId.current,
      senderName: localPlayer.nickname,
      text,
      channel: chatChannel,
      mapId: localPlayer.mapId
    });

    setChatInput('');
    chatInputRef.current?.blur();
  };

  // 5. Send DM handler (local tabs + Supabase Realtime across devices)
  const handleSendDM = (toId: string, text: string) => {
    bcRef.current?.postMessage({
      type: 'dm',
      id: 'dm_' + Math.random().toString(36).substring(2, 11),
      fromId: deviceId.current,
      fromName: localPlayer.nickname,
      toId,
      text,
      timestamp: Date.now()
    });

    safeBroadcastChannel('dm_msg', {
      fromId: localPlayer.id,
      fromName: localPlayer.nickname,
      toId,
      text,
      timestamp: Date.now()
    });
  };

  const handleReadDM = (toId: string) => {
    safeBroadcastChannel('dm_read', {
      fromId: localPlayer.id,
      toId
    });
  };

  // 3-Tier AFK/Tab-Safe Online Verification (Instant 0ms for active/presence, 2.5s fallback ping)
  const checkPlayerOnline = (targetPlayer: PlayerState): Promise<boolean> => {
    return new Promise((resolve) => {
      const now = Date.now();

      // Tier 1: Activity window (60 seconds) - if target was active within 60s, they are online!
      if (targetPlayer.lastActive && (now - targetPlayer.lastActive < 60000)) {
        resolve(true);
        return;
      }

      // Tier 2: Supabase Native Realtime Presence State (Server-maintained connection list)
      if (channelRef.current) {
        try {
          const presenceState = channelRef.current.presenceState();
          const isPresent = Object.values(presenceState).some((presences: any) => {
            return Array.isArray(presences) && presences.some((p: any) =>
              p.id === targetPlayer.id || p.nickname === targetPlayer.nickname || p.key === targetPlayer.id
            );
          });
          if (isPresent) {
            resolve(true);
            return;
          }
        } catch (e) {}
      }

      // Tier 3: Ping-Pong Verification with 2.5s Timeout (accommodates background tab throttling & mobile latency)
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          delete pendingPingCallbacksRef.current[targetPlayer.id];
          resolve(false); // Timed out (2.5s) - player has truly closed app/tab!
        }
      }, 2500);

      pendingPingCallbacksRef.current[targetPlayer.id] = (online: boolean) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(online);
        }
      };

      try {
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'ping_check',
            payload: { fromId: deviceId.current, targetId: targetPlayer.id }
          });
        } else {
          clearTimeout(timer);
          resolve(false);
        }
      } catch (e) {
        clearTimeout(timer);
        resolve(false);
      }
    });
  };

  // Handle click on another player (opens Player Interaction Modal with On-Demand Online Check!)
  const handlePlayerClick = async (p: PlayerState) => {
    if (p.id === deviceId.current) {
      // Clicked self: open customizer
      setIsCustomizing(true);
    } else {
      const isOnline = await checkPlayerOnline(p);

      if (isOnline) {
        setInteractionTargetPlayer({
          ...p,
          isOnline: true
        });
      } else {
        // Target player is offline! Prune ghost character from map immediately
        setOtherPlayers((prev) => {
          const next = { ...prev };
          delete next[p.id];
          return next;
        });
        setOfflinePlayers((prev) => ({
          ...prev,
          [p.id]: {
            ...p,
            isOnline: false,
            statusMessage: '오프라인',
            lastActive: Date.now()
          }
        }));
        showToast(`💡 [${p.nickname}] 님은 오프라인 상태입니다. (접속 종료됨)`);
      }
    }
  };

  // Send 1:1 DM Request to target player
  const handleRequestDMChat = (target: PlayerState) => {
    safeBroadcastChannel('dm_request', {
      fromId: localPlayer.id,
      fromName: localPlayer.nickname,
      fromPlayer: localPlayer,
      toId: target.id
    });
    showToast(`[${target.nickname}] 님에게 1:1 놀기를 신청했습니다. 응답 대기 중...`);
  };

  // Accept incoming 1:1 DM Request
  const handleAcceptDMRequest = () => {
    if (!incomingDMRequest) return;
    safeBroadcastChannel('dm_accept', {
      fromId: localPlayer.id,
      fromName: localPlayer.nickname,
      accepterPlayer: localPlayer,
      toId: incomingDMRequest.requesterId
    });

    setActiveDMTarget(incomingDMRequest.requesterPlayer);
    setIncomingDMRequest(null);
  };

  // Decline incoming 1:1 DM Request
  const handleDeclineDMRequest = () => {
    if (!incomingDMRequest) return;
    safeBroadcastChannel('dm_decline', {
      fromId: localPlayer.id,
      fromName: localPlayer.nickname,
      toId: incomingDMRequest.requesterId
    });
    setIncomingDMRequest(null);
  };

  // Close 1:1 DM Chat session and notify partner
  const handleCloseDMChat = () => {
    if (activeDMTarget) {
      safeBroadcastChannel('dm_close', {
        fromId: localPlayer.id,
        fromName: localPlayer.nickname,
        toId: activeDMTarget.id
      });
      if (bcRef.current) {
        bcRef.current.postMessage({
          type: 'dm_close',
          fromId: localPlayer.id,
          fromName: localPlayer.nickname,
          toId: activeDMTarget.id
        });
      }
      setClosedDMPartners((prev) => {
        const copy = { ...prev };
        delete copy[activeDMTarget.id];
        return copy;
      });
    }
    setActiveDMTarget(null);
    updateUnreadCount();
  };

  // Send reaction emoji with custom action animations!
  const handleSendReaction = (targetId: string, emoji: string) => {
    const targetPlayer = otherPlayersRef.current[targetId] || otherPlayers[targetId] || offlinePlayers[targetId] || {
      id: targetId,
      nickname: '친구',
      x: localPlayerRef.current.x + 32,
      y: localPlayerRef.current.y,
      spriteType: 'ninja_blue',
      hue: 0,
      mapId: localPlayerRef.current.mapId,
      dir: 'down',
      isMoving: false,
      isOnline: true,
      statusMessage: '',
      lastActive: Date.now()
    };

    if (emoji === '❤️' || emoji === '좋아요') {
      // 1. Flying Heart Particle from local player to target player!
      const payload = {
        type: 'heart',
        emoji: '❤️',
        fromId: deviceId.current,
        fromName: localPlayerRef.current.nickname,
        fromPos: { x: localPlayerRef.current.x, y: localPlayerRef.current.y },
        toId: targetId,
        toName: targetPlayer.nickname,
        toPos: { x: targetPlayer.x, y: targetPlayer.y }
      };

      window.dispatchEvent(new CustomEvent('on_house_spawn_particle', { detail: payload }));

      bcRef.current?.postMessage({
        type: 'reaction_anim',
        payload
      });

      safeBroadcastChannel('reaction_anim', payload);
      safeBroadcastChannel('reaction', {
        fromId: deviceId.current,
        fromName: localPlayer.nickname,
        toId: targetId,
        emoji: '❤️'
      });

      showToast(`[${targetPlayer.nickname}] 님에게 ❤️ 하트를 날렸습니다!`);
    } else if (emoji === '👋' || emoji === '인사하기') {
      // 2. Greeting: Walk in front of target player smoothly, then say "안녕하세요! 👋"
      if (targetPlayer) {
        const destX = Math.max(16, targetPlayer.x - 28);
        const destY = targetPlayer.y;

        showToast(`[${targetPlayer.nickname}] 님에게 걸어가는 중...`);

        // Dispatch smooth step-by-step walk event to Canvas physics engine
        window.dispatchEvent(new CustomEvent('on_house_walk_to', {
          detail: {
            x: destX,
            y: destY,
            onArrival: () => {
              // Trigger speech bubble upon arrival
              setChatBubbles((prev) => ({
                ...prev,
                [deviceId.current]: { text: '안녕하세요! 👋', time: Date.now() }
              }));

              setChatLogs((logs) => [
                ...logs,
                {
                  id: 'sys_greet_' + Date.now(),
                  senderName: '🚀 시스템',
                  text: `${localPlayer.nickname}님이 [${targetPlayer.nickname}] 님에게 다가가 인사를 건넸습니다: "안녕하세요! 👋"`,
                  time: Date.now()
                }
              ]);

              const payload = {
                type: 'greeting',
                fromId: deviceId.current,
                fromName: localPlayer.nickname,
                fromPos: { x: destX, y: destY },
                toId: targetId,
                toName: targetPlayer.nickname,
                toPos: { x: targetPlayer.x, y: targetPlayer.y }
              };

              safeBroadcastChannel('reaction_anim', payload);
              safeBroadcastChannel('chat', {
                id: deviceId.current,
                senderName: localPlayer.nickname,
                text: '안녕하세요! 👋'
              });

              showToast(`[${targetPlayer.nickname}] 님에게 "안녕하세요! 👋" 하고 인사를 건넸습니다!`);
            }
          }
        }));
      }
    } else if (emoji === '👏' || emoji === '응원하기') {
      // 3. Cheering: Clapping 3 icons burst around character
      const payload = {
        type: 'cheer',
        fromId: deviceId.current,
        fromName: localPlayerRef.current.nickname,
        fromPos: { x: localPlayerRef.current.x, y: localPlayerRef.current.y },
        toId: targetId,
        toName: targetPlayer?.nickname
      };

      window.dispatchEvent(new CustomEvent('on_house_spawn_particle', { detail: payload }));

      safeBroadcastChannel('reaction_anim', payload);

      showToast(`[${targetPlayer?.nickname || '친구'}] 님을 👏 열렬히 응원했습니다!`);
    } else if (emoji === '🎉' || emoji === '축하하기') {
      // 4. Celebrate: Fireworks burst around target friend character!
      const payload = {
        type: 'celebrate',
        fromId: deviceId.current,
        fromName: localPlayerRef.current.nickname,
        fromPos: { x: localPlayerRef.current.x, y: localPlayerRef.current.y },
        toId: targetId,
        toName: targetPlayer?.nickname,
        toPos: targetPlayer ? { x: targetPlayer.x, y: targetPlayer.y } : { x: localPlayerRef.current.x, y: localPlayerRef.current.y }
      };

      window.dispatchEvent(new CustomEvent('on_house_spawn_particle', { detail: payload }));

      safeBroadcastChannel('reaction_anim', payload);

      showToast(`[${targetPlayer?.nickname || '친구'}] 님을 🎉 화려하게 축하해 주었습니다!`);
    } else if (emoji === '🔥' || emoji === '불타오름') {
      // 5. Flame: Character-sized roaring fire sizzles around local player!
      const payload = {
        type: 'flame',
        fromId: deviceId.current,
        fromName: localPlayerRef.current.nickname,
        fromPos: { x: localPlayerRef.current.x, y: localPlayerRef.current.y }
      };

      window.dispatchEvent(new CustomEvent('on_house_spawn_particle', { detail: payload }));

      safeBroadcastChannel('reaction_anim', payload);

      showToast(`🔥 [${localPlayerRef.current.nickname}] 캐릭터 뒤에 이글이글 불꽃이 타오릅니다!`);
    } else if (emoji === '☕' || emoji === '커피한잔') {
      // 6. Coffee: Walk in front of target friend smoothly and ask "커피 한 잔 하실래요? ☕"
      if (targetPlayer) {
        const destX = Math.max(16, targetPlayer.x - 28);
        const destY = targetPlayer.y;

        showToast(`[${targetPlayer.nickname}] 님에게 걸어가는 중... ☕`);

        window.dispatchEvent(new CustomEvent('on_house_walk_to', {
          detail: {
            x: destX,
            y: destY,
            onArrival: () => {
              setChatBubbles((prev) => ({
                ...prev,
                [deviceId.current]: { text: '커피 한 잔 하실래요? ☕', time: Date.now() }
              }));

              const currentMapObj = activeMaps[localPlayer.mapId];
              const mapName = currentMapObj ? currentMapObj.name : localPlayer.mapId;

              setChatLogs((logs) => [
                ...logs,
                {
                  id: 'sys_coffee_' + Date.now(),
                  senderName: '🚀 시스템',
                  text: `${localPlayer.nickname}님이 [${targetPlayer.nickname}] 님에게 다가가 물었습니다: "커피 한 잔 하실래요? ☕"`,
                  time: Date.now(),
                  channel: chatChannel,
                  mapName: mapName
                }
              ]);

              const payload = {
                type: 'coffee',
                fromId: deviceId.current,
                fromName: localPlayer.nickname,
                fromPos: { x: destX, y: destY },
                toId: targetId,
                toName: targetPlayer.nickname,
                toPos: { x: targetPlayer.x, y: targetPlayer.y }
              };

              safeBroadcastChannel('reaction_anim', payload);
              safeBroadcastChannel('chat', {
                id: deviceId.current,
                senderName: localPlayer.nickname,
                text: '커피 한 잔 하실래요? ☕',
                channel: chatChannel,
                mapId: localPlayer.mapId,
                mapName: mapName,
                timestamp: Date.now()
              });

              showToast(`[${targetPlayer.nickname}] 님에게 "커피 한 잔 하실래요? ☕" 라고 물었습니다!`);
            }
          }
        }));
      }
    } else {
      // Standard emote fallback
      safeBroadcastChannel('reaction', {
        fromId: localPlayer.id,
        fromName: localPlayer.nickname,
        toId: targetId,
        emoji
      });
    }
  };

  // Leave offline/online note for target
  const handleLeaveNote = (targetId: string, noteText: string) => {
    handleSendDM(targetId, `[📝 메모] ${noteText}`);
    showToast('메모가 정상적으로 전달되었습니다.');
  };

  // Trigger counter reaction to sender when F key or prompt button is pressed!
  const triggerCounterReaction = () => {
    const prompt = reactionPromptRef.current;
    if (!prompt || Date.now() >= prompt.expiresAt) return;

    setReactionPrompt(null);
    if (promptTimerRef.current) clearTimeout(promptTimerRef.current);

    handleSendReaction(prompt.fromId, prompt.emoji);
    showToast(`⚡ [${prompt.fromName}] 님에게 똑같이 ${prompt.emoji} 반응을 보냈습니다!`);
  };

  // Open Inbox / Mailbox
  const handleOpenMailbox = () => {
    // Find who messaged us recently and open chat with the first one
    const dms = getDMs();
    const lastUnread = dms.filter(dm => dm.toId === deviceId.current && !dm.read).pop();
    
    if (lastUnread) {
      // Check if player details exist in memory
      let targetPlayer = otherPlayers[lastUnread.fromId] || offlinePlayers[lastUnread.fromId];
      if (!targetPlayer) {
        // Fallback mockup player state
        targetPlayer = {
          id: lastUnread.fromId,
          nickname: lastUnread.fromName,
          spriteType: 'ninja_blue',
          hue: 0,
          mapId: 'room',
          x: 0, y: 0, dir: 'down', isMoving: false, isOnline: false,
          statusMessage: '부재중', lastActive: Date.now()
        };
      }
      setActiveDMTarget(targetPlayer);
    } else {
      // No unreads, open chat with anyone if we have history
      const lastDM = dms.filter(dm => dm.fromId === deviceId.current || dm.toId === deviceId.current).pop();
      if (lastDM) {
        const partnerId = lastDM.fromId === deviceId.current ? lastDM.toId : lastDM.fromId;
        const partnerName = lastDM.fromId === deviceId.current ? '상대방' : lastDM.fromName;
        let targetPlayer = otherPlayers[partnerId] || offlinePlayers[partnerId];
        if (!targetPlayer) {
          targetPlayer = {
            id: partnerId,
            nickname: partnerName,
            spriteType: 'ninja_blue',
            hue: 0,
            mapId: 'room',
            x: 0, y: 0, dir: 'down', isMoving: false, isOnline: false,
            statusMessage: '부재중', lastActive: Date.now()
          };
        }
        setActiveDMTarget(targetPlayer);
      } else {
        alert('받은 쪽지나 이전 대화 내역이 없습니다. 다른 캐릭터를 클릭하여 쪽지를 먼저 보내보세요!');
      }
    }
    updateUnreadCount();
  };

  // No built-in default maps ship anymore — a brand new house has none until the player adds one.
  const currentMapData = activeMaps[localPlayer.mapId] || activeMaps[availableMapIds[0]];

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden', background: '#09090f' }}>
      {/* App Version Badge (Bottom Left) */}
      <div style={{
        position: 'absolute', left: '10px', bottom: isMobile ? '4px' : '8px', zIndex: 99,
        fontSize: '10px', fontWeight: 'bold', color: '#fff', background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)',
        pointerEvents: 'none', fontFamily: 'monospace'
      }}>
        {APP_VERSION}
      </div>

      {/* House Loading Overlay: Prevents premature rendering/flashing of old preset maps */}
      {!isHouseLoaded && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: '#09090f', zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '14px', color: '#fff', fontFamily: 'var(--font-pixel)'
        }}>
          <div style={{
            width: '36px', height: '36px', border: '3px solid rgba(167, 139, 250, 0.2)',
            borderTopColor: '#a78bfa', borderRadius: '50%',
            animation: 'on_house_spin 0.8s linear infinite'
          }} />
          <style>{`
            @keyframes on_house_spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <span style={{ fontSize: '13px', color: '#a78bfa', letterSpacing: '0px' }}>
            🏠 온하우스 맵 및 픽셀 에셋 불러오는 중...
          </span>
        </div>
      )}

      {/* 1. Main Canvas Game (Rendered ONLY after house maps & assets finish loading from DB!) */}
      {isHouseLoaded && currentMapData && (
        <CanvasGame
          localPlayer={localPlayer}
          otherPlayers={otherPlayers}
          offlinePlayers={offlinePlayers}
          currentMapId={localPlayer.mapId}
          chatBubbles={chatBubbles}
          onMove={handleMove}
          onPlayerClick={handlePlayerClick}
          memos={memos}
          onInteractMemo={(memo) => setActiveViewMemo(memo)}
          onCreateMemoRequest={(x, y) => setActiveCreateMemoPos({ x, y })}
          isEditMode={false}
          selectedTile={0}
          editLayer="base"
          onPaintTile={() => {}}
          mapData={currentMapData}
          brushSize={1}
          assetVersion={assetVersion}
          isHouseLoaded={isHouseLoaded}
          reactionPrompt={reactionPrompt}
          charImageOverrides={dbCharOverrides}
        />
      )}

      {/* 1.5 Empty State: House has finished loading but has no maps yet (brand new house) */}
      {isHouseLoaded && !currentMapData && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: '#09090f', zIndex: 400,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '16px', color: '#fff', fontFamily: 'var(--font-pixel)', padding: '24px', textAlign: 'center'
        }}>
          <span style={{ fontSize: '15px', color: '#a78bfa' }}>🏠 아직 만든 맵이 없어요</span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '320px' }}>
            첫 맵을 만들어서 시작해보세요.
          </span>
          <button
            onClick={() => handleAddMap()}
            style={{
              padding: '10px 20px', fontSize: '13px', borderRadius: '8px',
              background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary-hover)',
              cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            + 첫 맵 만들기
          </button>
        </div>
      )}

      {/* 2. Map Selector (Top Left - Only rendered after house loading completes!) */}
      {isHouseLoaded && (
        <MapSelector
          currentMapId={localPlayer.mapId}
          availableMapIds={availableMapIds}
          activeMaps={activeMaps}
          onMapChange={handleMapChange}
        />
      )}



      {/* Quick Counter-Reaction Banner (F Key Interaction) */}
      {reactionPrompt && Date.now() < reactionPrompt.expiresAt && (
        <button
          type="button"
          onClick={triggerCounterReaction}
          style={{
            position: 'absolute',
            bottom: isMobile ? '120px' : '150px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 250,
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.95), rgba(245, 194, 231, 0.95))',
            color: '#11111b',
            border: '2px solid #fff',
            borderRadius: '20px',
            padding: '8px 16px',
            fontSize: '12px',
            fontFamily: 'var(--font-pixel)',
            fontWeight: 'bold',
            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.6), 0 0 12px rgba(255,255,255,0.8)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            outline: 'none'
          }}
          title="F 키를 누르거나 클릭하여 똑같이 반응하기"
        >
          <span style={{ background: '#11111b', color: '#fab387', padding: '2px 6px', borderRadius: '10px', fontSize: '10px' }}>
            ⚡ (F) 상호작용
          </span>
          <span>
            [{reactionPrompt.fromName}] 님에게 똑같이 {reactionPrompt.emoji} 보내기
          </span>
        </button>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div style={{
          position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 200, background: 'rgba(20, 20, 30, 0.95)', color: '#fff',
          border: '1px solid var(--accent)', borderRadius: '8px', padding: '10px 18px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', fontFamily: 'var(--font-pixel)',
          fontSize: '12px', fontWeight: 'bold', pointerEvents: 'none'
        }}>
          {toastMessage}
        </div>
      )}

      {/* Player Interaction Modal (Clicked Player Options Popup) */}
      {interactionTargetPlayer && (
        <PlayerInteractionModal
          localPlayer={localPlayer}
          targetPlayer={interactionTargetPlayer}
          onClose={() => setInteractionTargetPlayer(null)}
          onRequestDMChat={handleRequestDMChat}
          onSendReaction={handleSendReaction}
          onLeaveNote={handleLeaveNote}
        />
      )}

      {/* Incoming 1:1 DM Request Modal (10s auto-dismiss timer) */}
      {incomingDMRequest && (
        <DMRequestModal
          requesterName={incomingDMRequest.requesterName}
          onAccept={handleAcceptDMRequest}
          onDecline={handleDeclineDMRequest}
        />
      )}

      {/* 5. Customizer Panel (Right overlay) */}
      {isCustomizing && (
        <Customizer
          player={localPlayer}
          customCharSprites={dbCustomCharSprites}
          onChange={(updates) => {
            setLocalPlayer((prev) => {
              const nextSprite = updates.spriteType || prev.spriteType;
              const hasPersonalSize = updates.personalCharSize !== undefined ? updates.personalCharSize : prev.personalCharSize;
              const nextSize = hasPersonalSize || getCharDisplaySize(nextSprite);
              const updated = {
                ...prev,
                ...updates,
                personalCharSize: hasPersonalSize,
                charSize: nextSize
              };
              sendPlayerSync(updated);
              return updated;
            });
          }}
          onClose={() => setIsCustomizing(false)}
        />
      )}

      {/* 6. DM Messenger overlay */}
      {activeDMTarget && (
        <Messenger
          localPlayer={localPlayer}
          activeTarget={activeDMTarget}
          onClose={handleCloseDMChat}
          onSendDM={handleSendDM}
          onReadDM={handleReadDM}
          onWatchYouTube={(ytId) => setActiveYouTubeVideoId(ytId)}
          onOpenWebUrl={(url) => setActiveWebUrl(url)}
          partnerViewingState={partnerViewingState}
          activeYouTubeVideoId={activeYouTubeVideoId}
          activeWebUrl={activeWebUrl}
          isPartnerClosed={!!closedDMPartners[activeDMTarget.id]}
        />
      )}

      {/* 6.5. Asset Viewer (Dev Tool) */}
      {showAssetViewer && (
        <AssetViewer
          dbCustomCharSprites={dbCustomCharSprites}
          dbCharOverrides={dbCharOverrides}
          onClose={() => setShowAssetViewer(false)}
        />
      )}

      {/* 6.6. Open Marketplace Modal */}
      <MarketModal
        isOpen={isMarketOpen}
        onClose={() => setIsMarketOpen(false)}
        onItemImported={handleMarketItemImported}
      />

      {/* 6.7. Draggable & Resizable YouTube Video Player Modal */}
      {activeYouTubeVideoId && (
        <YouTubePlayerModal
          videoId={activeYouTubeVideoId}
          onClose={() => setActiveYouTubeVideoId(null)}
          isMessengerOpen={!!activeDMTarget}
        />
      )}

      {/* 6.8. Draggable & Resizable In-Game Web View Browser Modal */}
      {activeWebUrl && (
        <WebBrowserModal
          url={activeWebUrl}
          onClose={() => {
            setActiveWebUrl(null);
            setIsWebSyncActive(false);
          }}
          isMessengerOpen={!!activeDMTarget}
          isSyncActive={isWebSyncActive}
          onToggleSync={handleToggleWebSync}
          onNavigateUrl={handleNavigateWebUrl}
        />
      )}

      {/* 7. Classic Flat Translucent Integrated Chat Box */}
      <div style={{
        position: 'absolute',
        bottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 6px)' : '14px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: isMobile ? 'calc(100% - 10px)' : 'calc(100% - 32px)',
        maxWidth: isMobile ? '100%' : '880px',
        zIndex: 100,
        background: 'rgba(15, 15, 25, 0.88)',
        backdropFilter: 'blur(10px)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        padding: isMobile ? '4px 6px' : '8px 12px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        {/* Integrated Scrollable Chat Log History Area */}
        {!isChatLogCollapsed && (
          <div
            ref={chatLogScrollRef}
            style={{
              maxHeight: isMobile ? '60px' : '130px',
              minHeight: '30px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              paddingRight: '4px',
              margin: '1px 0'
            }}
          >
            {chatLogs.length === 0 ? (
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', padding: '2px 0' }}>
                {isMobile ? "대화 내역이 없습니다." : "대화 내역이 없습니다. (Enter 키를 눌러 대화를 나누세요)"}
              </div>
            ) : (
              chatLogs.map((log) => {
                const ytId = extractYouTubeId(log.text);
                const webUrl = extractGeneralUrl(log.text);
                return (
                  <div
                    key={log.id}
                    style={{
                      fontSize: isMobile ? '11px' : '12px',
                      fontFamily: 'var(--font-pixel)',
                      color: '#fff',
                      display: 'flex',
                      gap: '4px',
                      alignItems: 'center',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span style={{
                      color: log.channel === 'map' ? '#a6e3a1' : '#fab387',
                      whiteSpace: 'nowrap', flexShrink: 0
                    }}>
                      [{log.channel === 'map' ? `맵${log.mapName ? '·' + log.mapName : ''}` : '전체'}]
                    </span>
                    <span style={{ color: '#a6e3a1', whiteSpace: 'nowrap', flexShrink: 0 }}>{log.senderName} :</span>
                    <span style={{ wordBreak: 'break-word', color: '#e6e9ef' }}>{log.text}</span>
                    {ytId && (() => {
                      const isPartnerViewing = partnerViewingState?.videoId === ytId;
                      const isMeViewing = activeYouTubeVideoId === ytId;
                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setActiveYouTubeVideoId(ytId)}
                            style={{
                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              color: '#ffffff',
                              border: '1px solid rgba(255, 255, 255, 0.4)',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-pixel)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                              flexShrink: 0,
                              outline: 'none',
                              lineHeight: '1.2'
                            }}
                            title="유튜브 영상 팝업 재생하기"
                          >
                            ▶️ 보기
                          </button>
                          {isPartnerViewing && isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#f5c2e7', fontFamily: 'var(--font-pixel)' }}>
                              👀🔥 함께 보는 중
                            </span>
                          )}
                          {isPartnerViewing && !isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#fab387', fontFamily: 'var(--font-pixel)' }}>
                              👀 상대 보는 중
                            </span>
                          )}
                          {!isPartnerViewing && isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#a6e3a1', fontFamily: 'var(--font-pixel)' }}>
                              👀 보는 중
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {webUrl && !ytId && (() => {
                      const isPartnerViewing = partnerViewingState?.webUrl === webUrl;
                      const isMeViewing = activeWebUrl === webUrl;
                      return (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setActiveWebUrl(webUrl)}
                            style={{
                              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                              color: '#ffffff',
                              border: '1px solid rgba(255, 255, 255, 0.4)',
                              borderRadius: '4px',
                              padding: '2px 8px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-pixel)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
                              flexShrink: 0,
                              outline: 'none',
                              lineHeight: '1.2'
                            }}
                            title="웹사이트 팝업 열기"
                          >
                            🌐 열기
                          </button>
                          {isPartnerViewing && isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#f5c2e7', fontFamily: 'var(--font-pixel)' }}>
                              👀🔥 함께 보는 중
                            </span>
                          )}
                          {isPartnerViewing && !isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#fab387', fontFamily: 'var(--font-pixel)' }}>
                              👀 상대 보는 중
                            </span>
                          )}
                          {!isPartnerViewing && isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#a6e3a1', fontFamily: 'var(--font-pixel)' }}>
                              👀 보는 중
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Integrated Flat Tools & Input Controls Header Area */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? '6px' : '8px',
          borderTop: isChatLogCollapsed ? 'none' : '1px solid rgba(255,255,255,0.1)',
          paddingTop: isChatLogCollapsed ? '0px' : '4px',
          overflowX: 'hidden',
          maxWidth: '100%'
        }}>
          {/* ROW 1: Chat Channel Selector, Toggle History, Chat Input Form */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '4px' : '6px', width: isMobile ? '100%' : 'auto', flex: isMobile ? 'none' : 1 }}>
            {/* Chat Channel Mode Selector ([전체] vs [맵]) */}
            <button
              type="button"
              onClick={() => setChatChannel((mode) => mode === 'global' ? 'map' : 'global')}
              style={{
                fontSize: '10px',
                color: chatChannel === 'global' ? '#fab387' : '#a6e3a1',
                background: chatChannel === 'global' ? 'rgba(250, 179, 135, 0.15)' : 'rgba(166, 227, 161, 0.15)',
                padding: '3px 6px',
                borderRadius: '3px',
                border: chatChannel === 'global' ? '1px solid rgba(250, 179, 135, 0.4)' : '1px solid rgba(166, 227, 161, 0.4)',
                flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer',
                outline: 'none', transition: 'all 0.15s ease'
              }}
              title="채팅 범위 전환 (클릭 시 [전체] / [맵] 대화 전환)"
            >
              {chatChannel === 'global' ? '[전체]' : '[맵]'}
            </button>

            {/* Chat History Single Toggle Button ([▼ 축소] / [▲ 펼치기]) */}
            <button
              type="button"
              onClick={() => setIsChatLogCollapsed((prev) => !prev)}
              style={{
                fontSize: '10px',
                color: isChatLogCollapsed ? '#fab387' : '#a6adc8',
                background: isChatLogCollapsed ? 'rgba(250, 179, 135, 0.15)' : 'rgba(255,255,255,0.06)',
                padding: '3px 6px',
                borderRadius: '3px',
                border: isChatLogCollapsed ? '1px solid rgba(250, 179, 135, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                outline: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease'
              }}
              title="채팅 내역 축소 (숨기기) / 펼치기"
            >
              {isChatLogCollapsed ? '▲ 펼치기' : '▼ 축소'}
            </button>

            {/* Flat Chat Input Form */}
            <form onSubmit={handleChatSubmit} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  isMobile
                    ? `[${chatChannel === 'global' ? '전체' : '맵'}] 입력...`
                    : `[${chatChannel === 'global' ? '전체' : '맵'}] 메시지를 입력하세요 (Enter 키로 전송)...`
                }
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '3px',
                  padding: isMobile ? '4px 6px' : '6px 10px',
                  fontSize: isMobile ? '11px' : '12px',
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </form>
          </div>

          {/* ROW 2: Status, Mail, Editors, Market, Settings, Bag, House Code */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '4px' : '6px',
            justifyContent: isMobile ? 'space-between' : 'flex-end',
            width: isMobile ? '100%' : 'auto',
            flexShrink: 0,
            overflowX: 'hidden'
          }}>
            {/* Status Picker (😊) */}
            <div style={{ flexShrink: 0 }}>
              <StatusPicker
                currentStatus={localPlayer.statusMessage}
                onStatusChange={handleStatusChange}
              />
            </div>

            {/* Mailbox / DM Button */}
            <button
              onClick={handleOpenMailbox}
              style={{
                background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
                position: 'relative', display: 'flex', alignItems: 'center', padding: '3px', flexShrink: 0
              }}
              title="메일함 / DM"
            >
              <Mail size={14} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-2px', right: '-4px', background: 'var(--danger)',
                  color: '#fff', fontSize: '8px', width: '13px', height: '13px', borderRadius: '50%',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold'
                }}>
                  {unreadCount}
                </span>
              )}
            </button>

            {/* 1 & 2. 픽셀 에디터 (Eye) & 전문 지도 편집기 (Hammer) - Hidden on Mobile! */}
            {!isMobile && (
              <>
                <button
                  onClick={() => setShowAssetViewer(!showAssetViewer)}
                  style={{
                    background: showAssetViewer ? 'rgba(139,92,246,0.3)' : 'none',
                    border: showAssetViewer ? '1px solid var(--accent)' : 'none',
                    color: showAssetViewer ? 'var(--accent)' : '#ccc',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '2px'
                  }}
                  title="픽셀 에디터"
                >
                  <Eye size={14} />
                </button>

                <button
                  onClick={() => {
                    if (!showProfessionalEditor && Object.keys(activeMaps).length === 0) {
                      alert('먼저 맵을 1개 이상 만들어주세요.');
                      return;
                    }
                    setShowProfessionalEditor(!showProfessionalEditor);
                    setIsCustomizing(false);
                  }}
                  style={{
                    background: showProfessionalEditor ? 'rgba(139,92,246,0.3)' : 'none',
                    border: showProfessionalEditor ? '1px solid var(--accent)' : 'none',
                    color: showProfessionalEditor ? 'var(--accent)' : '#ccc',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '2px'
                  }}
                  title="전문 지도 편집기"
                >
                  <Hammer size={14} />
                </button>
              </>
            )}

            {/* Open Marketplace Shop Button */}
            <button
              type="button"
              onClick={() => setIsMarketOpen(true)}
              style={{
                background: isMarketOpen ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.12)',
                border: '1px solid #a78bfa',
                color: '#a78bfa',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                padding: '2px 5px', borderRadius: '2px', fontSize: '10px', fontWeight: 'normal'
              }}
              title="오픈 마켓 상점"
            >
              <ShoppingCart size={12} />
              <span>상점</span>
            </button>

            <button
              onClick={() => setIsCustomizing(!isCustomizing)}
              style={{
                background: isCustomizing ? 'rgba(139,92,246,0.3)' : 'none',
                border: isCustomizing ? '1px solid var(--accent)' : 'none',
                color: isCustomizing ? 'var(--accent)' : '#ccc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '2px'
              }}
              title="캐릭터 커스텀 설정"
            >
              <Settings size={14} />
            </button>

            {/* Inventory Equipment Bag Button */}
            <button
              onClick={() => setShowInventoryModal(true)}
              style={{
                background: showInventoryModal ? 'rgba(139,92,246,0.3)' : 'none',
                border: showInventoryModal ? '1px solid var(--accent)' : 'none',
                color: showInventoryModal ? 'var(--accent)' : '#ccc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '2px',
                position: 'relative'
              }}
              title="장비함 (가방)"
            >
              <Briefcase size={14} />
              {inventory.length > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: 'var(--accent)', color: '#111',
                  borderRadius: '50%', width: '12px', height: '12px',
                  fontSize: '8px', fontWeight: 'bold', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  {inventory.length}
                </span>
              )}
            </button>

            {/* House Code Switcher Button */}
            <button
              onClick={() => setShowHouseModal(true)}
              style={{
                background: 'rgba(139, 92, 246, 0.2)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px',
                padding: '2px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold',
                whiteSpace: 'nowrap', flexShrink: 0
              }}
              title="하우스 번호 (클릭하여 변경 및 공유)"
            >
              <Home size={11} />
              <span>{houseCode}</span>
            </button>

            {!isMobile && (
              <>
                <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }} />

                <div style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <User size={12} />
                  <span>{localPlayer.nickname}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 8. Professional Map Editor Panel */}
      {showProfessionalEditor && (
        <MapEditorView
          activeMaps={activeMaps}
          availableMapIds={availableMapIds}
          initialMapId={localPlayer.mapId}
          onAddMap={handleAddMap}
          onDeleteMap={handleDeleteMap}
          onRenameMap={handleRenameMap}
          onReorderMaps={(newOrder) => {
            setAvailableMapIds(newOrder);
            try {
              localStorage.setItem(`on_house_available_maps_${houseCode}`, JSON.stringify(newOrder));
            } catch (e) {}

            // Update sortOrder property on map objects and save to DB
            setActiveMaps((prev) => {
              const updated = { ...prev };
              newOrder.forEach((id, idx) => {
                if (updated[id]) {
                  updated[id] = { ...updated[id], sortOrder: idx };
                  saveHouseMapToDB(houseCode, id, updated[id]);
                }
              });
              return updated;
            });

            saveHouseMapOrderToDB(houseCode, newOrder);

            if (channelRef.current) {
              channelRef.current.send({
                type: 'broadcast',
                event: 'map_order_update',
                payload: { order: newOrder }
              });
            }
          }}
          onSaveMap={(mapId, updatedMap) => {
            setActiveMaps((prev) => {
              const next = { ...prev, [mapId]: updatedMap };
              localStorage.setItem('on_house_map_' + mapId, JSON.stringify(updatedMap));
              
              if (mapId === localPlayer.mapId) {
                setLocalPlayer((p) => ({
                  ...p,
                  x: Math.min(p.x, (updatedMap.width - 2) * 16),
                  y: Math.min(p.y, (updatedMap.height - 2) * 16)
                }));
              }
              return next;
            });

            setAvailableMapIds((prev) => {
              if (!prev.includes(mapId)) {
                return [...prev, mapId];
              }
              return prev;
            });

            // Save directly to Supabase DB for this House!
            saveHouseMapToDB(houseCode, mapId, updatedMap).then((res) => {
              if (res && !res.success) {
                console.warn('Supabase DB save note:', res.error);
              }
            });

            // Broadcast to all devices in real-time via active channel!
            safeBroadcastChannel('map_update', { mapId, mapData: updatedMap });

            // Broadcast full map update to other local tabs!
            if (bcRef.current) {
              bcRef.current.postMessage({
                type: 'map_full_update',
                mapId,
                mapData: updatedMap
              });
            }
          }}
          onClose={() => setShowProfessionalEditor(false)}
        />
      )}

      {/* 9. House Join & Switcher Modal */}
      {showHouseModal && (
        <HouseJoinModal
          currentHouseCode={houseCode}
          onJoinHouse={handleJoinHouse}
          onClose={() => setShowHouseModal(false)}
        />
      )}

      {/* 10. Create Memo Modal */}
      {activeCreateMemoPos && (
        <CreateMemoModal
          mapId={localPlayer.mapId}
          x={activeCreateMemoPos.x}
          y={activeCreateMemoPos.y}
          authorId={localPlayer.id}
          authorName={localPlayer.nickname}
          onSubmit={handleCreateMemoSubmit}
          onClose={() => setActiveCreateMemoPos(null)}
        />
      )}

      {/* 11. View Memo Modal */}
      {activeViewMemo && (
        <ViewMemoModal
          memo={activeViewMemo}
          onPickup={activeViewMemo.memoType === 'one_time' ? () => handlePickupMemo(activeViewMemo) : undefined}
          onClose={() => setActiveViewMemo(null)}
        />
      )}

      {/* 12. Inventory Equipment Bag Modal (RPG Slot Grid Style) */}
      {showInventoryModal && (
        <InventoryModal
          inventory={inventory}
          onDropToMap={handleDropItemToMap}
          onDeleteItem={handleDeleteInventoryItem}
          onClose={() => setShowInventoryModal(false)}
        />
      )}

      {/* 13. Global Custom Alert Modal */}
      <CustomAlertModal
        isOpen={!!customAlertState}
        message={customAlertState?.message || ''}
        title={customAlertState?.title || '안내'}
        icon={customAlertState?.icon || '💡'}
        onClose={() => setCustomAlertState(null)}
      />
    </div>
  );
}
