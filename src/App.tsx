import { useState, useEffect, useRef } from 'react';
import { CanvasGame } from './game/CanvasGame';
import { type MapDefinition, maps } from './game/MapData';
import {
  type PlayerState,
  getOrCreateDeviceId,
  generateNickname,
  getOfflineUsers,
  saveOfflineUser,
  removeOfflineUser,
  getDMs,
  saveDM,
  type DirectMessage
} from './game/syncManager';
import { Customizer } from './components/Customizer';
import { Messenger } from './components/Messenger';
import { StatusPicker } from './components/StatusPicker';
import { MapSelector } from './components/MapSelector';
import { MapEditorView } from './components/MapEditorView';
import { Mail, Settings, User, Eye, Hammer } from 'lucide-react';
import { AssetViewer } from './components/AssetViewer';

interface ChatLogMessage {
  id: string;
  senderName: string;
  text: string;
  time: number;
}

export default function App() {
  const deviceId = useRef(getOrCreateDeviceId());

  // 0. Active Maps (loads custom layouts from localStorage)
  const [activeMaps, setActiveMaps] = useState<Record<string, MapDefinition>>(() => {
    const loadedMaps = { ...maps };
    Object.keys(maps).forEach((mapId) => {
      const saved = localStorage.getItem('on_house_map_' + mapId);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.width && parsed.height && Array.isArray(parsed.baseLayer)) {
            loadedMaps[mapId] = parsed;
          }
        } catch (e) {
          console.error(`Failed to load custom map: ${mapId}`, e);
        }
      }
    });
    return loadedMaps;
  });

  // 1. Local Player State
  const [localPlayer, setLocalPlayer] = useState<PlayerState>(() => {
    const savedName = localStorage.getItem('on_house_nickname') || generateNickname();
    localStorage.setItem('on_house_nickname', savedName);

    const savedSprite = (localStorage.getItem('on_house_sprite') as any) || 'ninja_blue';
    const savedHue = parseInt(localStorage.getItem('on_house_hue') || '0');
    const rawStatus = localStorage.getItem('on_house_status');
    const savedStatus = (rawStatus === '반가워요!' || !rawStatus) ? '' : rawStatus;

    // Default to My Room spawn point
    const spawn = maps.room.spawnPoints[0];
    return {
      id: deviceId.current,
      nickname: savedName,
      spriteType: savedSprite,
      hue: savedHue,
      mapId: 'room',
      x: spawn.x * 16,
      y: spawn.y * 16,
      dir: 'down',
      isMoving: false,
      isOnline: true,
      statusMessage: savedStatus,
      lastActive: Date.now()
    };
  });

  // 2. Multi-player lists
  const [otherPlayers, setOtherPlayers] = useState<Record<string, PlayerState>>({});
  const [offlinePlayers, setOfflinePlayers] = useState<Record<string, PlayerState>>(() => getOfflineUsers());

  // 3. UI control states
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [activeDMTarget, setActiveDMTarget] = useState<PlayerState | null>(null);
  const [showAssetViewer, setShowAssetViewer] = useState(false);

  // 3.5. Map Editor states
  const [showProfessionalEditor, setShowProfessionalEditor] = useState(false);

  // 4. In-game logs & popups
  const [chatLogs, setChatLogs] = useState<ChatLogMessage[]>([]);
  const [chatBubbles, setChatBubbles] = useState<Record<string, { text: string; time: number }>>({});
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

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
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep player state ref up-to-date for event handlers
  const localPlayerRef = useRef<PlayerState>(localPlayer);
  useEffect(() => {
    localPlayerRef.current = localPlayer;
    // Save settings immediately
    localStorage.setItem('on_house_nickname', localPlayer.nickname);
    localStorage.setItem('on_house_sprite', localPlayer.spriteType);
    localStorage.setItem('on_house_hue', localPlayer.hue.toString());
    localStorage.setItem('on_house_status', localPlayer.statusMessage);
  }, [localPlayer]);

  // Safety check: Teleport player back inside map ONLY if completely out of bounds (e.g. when map size shrinks)
  useEffect(() => {
    const currentMap = activeMaps[localPlayer.mapId];
    if (currentMap) {
      const maxX = (currentMap.width - 1) * 16;
      const maxY = (currentMap.height - 1) * 16;
      if (localPlayer.x < 0 || localPlayer.x > maxX || localPlayer.y < 0 || localPlayer.y > maxY) {
        const spawn = currentMap.spawnPoints[0] || { x: Math.floor(currentMap.width / 2), y: Math.floor(currentMap.height / 2) };
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

  // Initialize sync channel
  useEffect(() => {
    const bc = new BroadcastChannel('on_house_sync');
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
            if (!existing) return prev;
            return {
              ...prev,
              [msg.playerId]: {
                ...existing,
                x: msg.x,
                y: msg.y,
                dir: msg.dir,
                isMoving: msg.isMoving,
                mapId: msg.mapId,
                isOnline: true,
                lastActive: Date.now()
              }
            };
          });
          break;

        case 'chat':
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
          // Add to speech bubble
          setChatBubbles((prev) => ({
            ...prev,
            [msg.playerId]: { text: msg.text, time: Date.now() }
          }));
          // Add to chat logs
          setChatLogs((prev) => [
            ...prev,
            {
              id: 'chat_' + Math.random().toString(36).substring(2, 11),
              senderName: msg.senderName,
              text: msg.text,
              time: Date.now()
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

        case 'leave':
          // Mark as offline immediately
          setOtherPlayers((prev) => {
            const copy = { ...prev };
            delete copy[msg.playerId];
            return copy;
          });
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

        case 'map_reset':
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
      bc.postMessage({
        type: 'sync_response',
        player: localPlayerRef.current
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
  }, []);

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

    // Broadcast coordinate shift
    bcRef.current?.postMessage({
      type: 'move',
      playerId: deviceId.current,
      x,
      y,
      dir,
      isMoving,
      mapId: localPlayer.mapId
    });
  };

  // 2. Map transitioner
  const handleMapChange = (mapId: string) => {
    const spawn = maps[mapId].spawnPoints[0];
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

    // Broadcast coordinate shift and map jump
    bcRef.current?.postMessage({
      type: 'move',
      playerId: deviceId.current,
      x: newX,
      y: newY,
      dir: 'down',
      isMoving: false,
      mapId
    });

    // Notify logs
    setChatLogs((prev) => [
      ...prev,
      {
        id: 'system_' + Date.now(),
        senderName: '🚀 시스템',
        text: `[${maps[mapId].name}] 구역으로 이동하였습니다.`,
        time: Date.now()
      }
    ]);
  };

  // 3. Status picker updater
  const handleStatusChange = (statusMessage: string) => {
    setLocalPlayer((prev) => ({ ...prev, statusMessage }));

    bcRef.current?.postMessage({
      type: 'status',
      playerId: deviceId.current,
      statusMessage
    });
  };

  // 4. Chat messaging submit
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) {
      chatInputRef.current?.blur();
      return;
    }

    const text = chatInput.trim();

    // Trigger local speech bubble
    setChatBubbles((prev) => ({
      ...prev,
      [deviceId.current]: { text, time: Date.now() }
    }));

    // Add to logs
    setChatLogs((prev) => [
      ...prev,
      {
        id: 'chat_me_' + Date.now(),
        senderName: localPlayer.nickname,
        text,
        time: Date.now()
      }
    ]);

    // Broadcast chat
    bcRef.current?.postMessage({
      type: 'chat',
      playerId: deviceId.current,
      senderName: localPlayer.nickname,
      text
    });

    setChatInput('');
    chatInputRef.current?.blur();
  };

  // 5. Send DM handler
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
  };

  // Handle click on another player (opens DM)
  const handlePlayerClick = (p: PlayerState) => {
    if (p.id === deviceId.current) {
      // Clicked self: open customizer
      setIsCustomizing(true);
    } else {
      // Clicked another player: open messenger
      setActiveDMTarget(p);
    }
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


  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* 1. Main Canvas Game */}
      <CanvasGame
        localPlayer={localPlayer}
        otherPlayers={otherPlayers}
        offlinePlayers={offlinePlayers}
        currentMapId={localPlayer.mapId}
        chatBubbles={chatBubbles}
        onMove={handleMove}
        onPlayerClick={handlePlayerClick}
        isEditMode={false}
        selectedTile={0}
        editLayer="base"
        onPaintTile={() => {}}
        mapData={activeMaps[localPlayer.mapId]}
        brushSize={1}
      />

      {/* 2. Map Selector (Top Left) */}
      <MapSelector
        currentMapId={localPlayer.mapId}
        onMapChange={handleMapChange}
      />



      {/* 5. Customizer Panel (Right overlay) */}
      {isCustomizing && (
        <Customizer
          player={localPlayer}
          onChange={(updates) => setLocalPlayer((prev) => ({ ...prev, ...updates }))}
          onClose={() => setIsCustomizing(false)}
        />
      )}

      {/* 6. DM Messenger overlay */}
      {activeDMTarget && (
        <Messenger
          localPlayer={localPlayer}
          activeTarget={activeDMTarget}
          onClose={() => {
            setActiveDMTarget(null);
            updateUnreadCount();
          }}
          onSendDM={handleSendDM}
        />
      )}

      {/* 6.5. Asset Viewer (Dev Tool) */}
      {showAssetViewer && (
        <AssetViewer onClose={() => setShowAssetViewer(false)} />
      )}

      {/* 7. Classic Flat Translucent Integrated Chat Box */}
      <div style={{
        position: 'absolute',
        bottom: isMobile ? '10px' : '14px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: isMobile ? 'calc(100% - 24px)' : 'calc(100% - 40px)',
        maxWidth: '680px',
        zIndex: 100,
        background: 'rgba(15, 15, 25, 0.55)',
        backdropFilter: 'blur(8px)',
        borderRadius: '4px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        {/* Integrated Scrollable Chat Log History Area */}
        <div
          ref={chatLogScrollRef}
          style={{
            maxHeight: '130px',
            minHeight: '40px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingRight: '6px',
            margin: '2px 0'
          }}
        >
          {chatLogs.length === 0 ? (
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', padding: '2px 0' }}>
              대화 내역이 없습니다. (Enter 키를 눌러 대화를 나누세요)
            </div>
          ) : (
            chatLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-pixel)',
                  color: '#fff',
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'baseline'
                }}
              >
                <span style={{ color: '#fab387', fontWeight: 'bold' }}>[전체]</span>
                <span style={{ color: '#a6e3a1', fontWeight: 'bold' }}>{log.senderName} :</span>
                <span style={{ wordBreak: 'break-word', color: '#e6e9ef' }}>{log.text}</span>
              </div>
            ))
          )}
        </div>

        {/* Integrated Flat Tools & Input Controls Header Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: '6px'
        }}>
          <span style={{
            fontSize: '11px', fontWeight: 'bold', color: '#fab387',
            background: 'rgba(250, 179, 135, 0.15)', padding: '2px 6px',
            borderRadius: '2px', border: '1px solid rgba(250, 179, 135, 0.3)',
            flexShrink: 0
          }}>
            [전체]
          </span>

          {/* Status Picker (😊) */}
          <StatusPicker
            currentStatus={localPlayer.statusMessage}
            onStatusChange={handleStatusChange}
          />

          {/* Mailbox / DM Button */}
          <button
            onClick={handleOpenMailbox}
            style={{
              background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
              position: 'relative', display: 'flex', alignItems: 'center', padding: '4px', flexShrink: 0
            }}
            title="메일함 / DM"
          >
            <Mail size={15} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-2px', right: '-4px', background: 'var(--danger)',
                color: '#fff', fontSize: '9px', width: '14px', height: '14px', borderRadius: '50%',
                display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold'
              }}>
                {unreadCount}
              </span>
            )}
          </button>

          {/* Flat Chat Input Form */}
          <form onSubmit={handleChatSubmit} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <input
              ref={chatInputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={isMobile ? "메시지 보내기 (Enter)..." : "메시지를 입력하세요 (Enter 키로 전송)..."}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '3px',
                padding: '6px 10px',
                fontSize: '12px',
                color: '#fff',
                outline: 'none'
              }}
            />
          </form>

          {/* Right Action Icons */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => {
                setShowProfessionalEditor(!showProfessionalEditor);
                setIsCustomizing(false);
              }}
              style={{
                background: showProfessionalEditor ? 'rgba(139,92,246,0.3)' : 'none',
                border: showProfessionalEditor ? '1px solid var(--accent)' : 'none',
                color: showProfessionalEditor ? 'var(--accent)' : '#ccc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '2px'
              }}
              title="전문 지도 편집기"
            >
              <Hammer size={14} />
            </button>

            <button
              onClick={() => setShowAssetViewer(!showAssetViewer)}
              style={{
                background: showAssetViewer ? 'rgba(139,92,246,0.3)' : 'none',
                border: showAssetViewer ? '1px solid var(--accent)' : 'none',
                color: showAssetViewer ? 'var(--accent)' : '#ccc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '2px'
              }}
              title="타일 에셋 뷰어"
            >
              <Eye size={14} />
            </button>

            <button
              onClick={() => setIsCustomizing(!isCustomizing)}
              style={{
                background: isCustomizing ? 'rgba(139,92,246,0.3)' : 'none',
                border: isCustomizing ? '1px solid var(--accent)' : 'none',
                color: isCustomizing ? 'var(--accent)' : '#ccc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '2px'
              }}
              title="캐릭터 커스텀 설정"
            >
              <Settings size={14} />
            </button>

            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={12} />
              <span>{localPlayer.nickname}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 8. Professional Map Editor Panel */}
      {showProfessionalEditor && (
        <MapEditorView
          activeMaps={activeMaps}
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

            // Broadcast full map update to other tabs!
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
    </div>
  );
}
