import React, { useState, useEffect, useRef } from 'react';
import { type DirectMessage, type PlayerState, getDMs, saveDM, markDMsAsRead } from '../game/syncManager';
import { Send, MessageSquare, ShieldAlert, X } from 'lucide-react';

interface MessengerProps {
  localPlayer: PlayerState;
  activeTarget: PlayerState | null; // Selected user to DM
  onClose: () => void;
  onSendDM: (toId: string, text: string) => void;
  onReadDM?: (toId: string) => void;
  onWatchYouTube?: (videoId: string) => void;
  onOpenWebUrl?: (url: string) => void;
  partnerViewingState?: { videoId?: string; webUrl?: string; syncEnabled?: boolean } | null;
  activeYouTubeVideoId?: string | null;
  activeWebUrl?: string | null;
}

const extractYouTubeId = (text: string): string | null => {
  if (!text) return null;
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(regex);
  return match ? match[1] : null;
};

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

const isSameMinute = (t1: number, t2: number): boolean => {
  if (!t1 || !t2) return false;
  const d1 = new Date(t1);
  const d2 = new Date(t2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate() &&
    d1.getHours() === d2.getHours() &&
    d1.getMinutes() === d2.getMinutes()
  );
};

export const Messenger: React.FC<MessengerProps> = ({
  localPlayer,
  activeTarget,
  onClose,
  onSendDM,
  onReadDM,
  onWatchYouTube,
  onOpenWebUrl,
  partnerViewingState,
  activeYouTubeVideoId,
  activeWebUrl
}) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const isUserScrolledUpRef = useRef(false);

  // Absolute initial pixel position state
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (isMobile) {
      return {
        x: Math.max(10, Math.round((window.innerWidth - Math.min(380, window.innerWidth - 30)) / 2)),
        y: Math.max(10, Math.round((window.innerHeight - 440) / 2))
      };
    }
    return {
      x: Math.max(10, Math.round(window.innerWidth / 2 - 200)),
      y: Math.max(10, Math.round(window.innerHeight / 2 - 220))
    };
  });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0
  });

  // Track user scroll position
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 50;
  };

  // Direct Hardware-Accelerated DOM Drag Engine (0ms Latency, Zero React Re-render Lag)
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDraggingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    if (modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      dragStartRef.current = {
        startX: clientX,
        startY: clientY,
        initX: rect.left,
        initY: rect.top
      };
      modalRef.current.style.willChange = 'left, top, width, height';
    }
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current || !modalRef.current) return;
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const dx = clientX - dragStartRef.current.startX;
      const dy = clientY - dragStartRef.current.startY;

      const nextX = Math.max(10, Math.min(window.innerWidth - 100, dragStartRef.current.initX + dx));
      const nextY = Math.max(10, Math.min(window.innerHeight - 100, dragStartRef.current.initY + dy));

      // Direct DOM update bypasses React state lag during mouse drag!
      modalRef.current.style.left = `${nextX}px`;
      modalRef.current.style.top = `${nextY}px`;
    };

    const handleEnd = () => {
      if (isDraggingRef.current && modalRef.current) {
        isDraggingRef.current = false;
        modalRef.current.style.willChange = 'auto';
        const rect = modalRef.current.getBoundingClientRect();
        setPos({ x: rect.left, y: rect.top });
      }
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, []);

  // Load message history from localStorage
  const loadHistory = () => {
    const allDMs = getDMs();
    if (activeTarget) {
      // Filter DMs involving local player and activeTarget
      const chatDMs = allDMs.filter(
        (dm) =>
          (dm.fromId === localPlayer.id && dm.toId === activeTarget.id) ||
          (dm.fromId === activeTarget.id && dm.toId === localPlayer.id)
      );

      setMessages((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(chatDMs)) {
          return prev;
        }
        return chatDMs;
      });
      
      // Mark as read
      markDMsAsRead(activeTarget.id, localPlayer.id);
      if (onReadDM) {
        onReadDM(activeTarget.id);
      }
    }
  };

  useEffect(() => {
    isUserScrolledUpRef.current = false;
    loadHistory();
    const interval = setInterval(loadHistory, 500);
    return () => clearInterval(interval);
  }, [activeTarget, localPlayer.id]);

  // Listen for realtime DM read events
  useEffect(() => {
    const handleReadEvent = () => loadHistory();
    window.addEventListener('on_house_dm_read', handleReadEvent);
    return () => window.removeEventListener('on_house_dm_read', handleReadEvent);
  }, []);

  // Scroll to bottom ONLY if user is not actively scrolling up to read history
  useEffect(() => {
    if (!isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || !activeTarget) return;

    const newDM: DirectMessage = {
      id: 'dm_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36),
      fromId: localPlayer.id,
      fromName: localPlayer.nickname,
      toId: activeTarget.id,
      text: inputText.trim(),
      timestamp: Date.now(),
      read: false
    };

    saveDM(newDM);
    onSendDM(activeTarget.id, inputText.trim());
    setInputText('');
    
    isUserScrolledUpRef.current = false;
    loadHistory();
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  if (!activeTarget) return null;

  return (
    <div
      ref={modalRef}
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: 'none',
        width: isMobile ? 'calc(100vw - 30px)' : '380px',
        height: isMobile ? '75vh' : '440px',
        minWidth: '300px',
        minHeight: '260px',
        maxWidth: '92vw',
        maxHeight: '90vh',
        resize: isMobile ? 'none' : 'both',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 110,
        background: 'rgba(20, 20, 32, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '14px',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.65)',
        fontFamily: 'var(--font-pixel)',
        fontWeight: 'normal',
        letterSpacing: '0px'
      }}
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-glass)',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.35)',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <MessageSquare size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: '#fff', fontFamily: 'var(--font-pixel)', letterSpacing: '0px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {activeTarget.nickname}
          </span>
          <span style={{ fontSize: '10px', color: activeTarget.isOnline ? 'var(--success)' : 'var(--text-muted)', fontFamily: 'var(--font-pixel)', letterSpacing: '0px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {activeTarget.isOnline ? '● 온라인' : `● 오프라인 (${activeTarget.statusMessage || '부재중'})`}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#a6adc8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
            marginLeft: '8px',
            flexShrink: 0
          }}
          title="닫기"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages List */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1, padding: '16px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '2px',
          background: 'rgba(0, 0, 0, 0.15)'
        }}
      >
        {messages.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--text-muted)',
            textAlign: 'center', gap: '8px', fontFamily: 'var(--font-pixel)', fontSize: '12px', letterSpacing: '0px'
          }}>
            <MessageSquare size={24} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: '12px', margin: 0 }}>대화 내역이 없습니다.<br />첫 메시지를 보내보세요!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.fromId === localPlayer.id;
            const ytId = extractYouTubeId(msg.text);
            const webUrl = extractGeneralUrl(msg.text);

            const prevMsg = messages[index - 1];
            const nextMsg = messages[index + 1];

            const isPrevSameGroup = prevMsg && prevMsg.fromId === msg.fromId && isSameMinute(msg.timestamp, prevMsg.timestamp);
            const isNextSameGroup = nextMsg && nextMsg.fromId === msg.fromId && isSameMinute(msg.timestamp, nextMsg.timestamp);

            const isFirstInGroup = !isPrevSameGroup;
            const isLastInGroup = !isNextSameGroup;

            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  display: 'flex',
                  flexDirection: isMe ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                  gap: '6px',
                  marginTop: isFirstInGroup ? '10px' : '3px'
                }}
              >
                {/* Message Bubble */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start'
                }}>
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-pixel)',
                    fontWeight: 'normal',
                    letterSpacing: '0px',
                    lineHeight: '1.5',
                    background: isMe ? 'var(--primary)' : 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    boxShadow: isMe ? '0 2px 8px var(--primary-glow)' : 'none',
                    border: isMe ? 'none' : '1px solid var(--border-glass)',
                    wordBreak: 'break-word',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div>{msg.text}</div>
                    {ytId && (() => {
                      const isPartnerViewing = partnerViewingState?.videoId === ytId;
                      const isMeViewing = activeYouTubeVideoId === ytId;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: isMe ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (onWatchYouTube) {
                                onWatchYouTube(ytId);
                              } else {
                                window.dispatchEvent(new CustomEvent('on_house_watch_youtube', { detail: { videoId: ytId } }));
                              }
                            }}
                            style={{
                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              color: '#ffffff',
                              border: '1px solid rgba(255, 255, 255, 0.4)',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-pixel)',
                              fontWeight: 'normal',
                              letterSpacing: '0px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                              outline: 'none'
                            }}
                            title="유튜브 영상 팝업 재생하기"
                          >
                            ▶️ 보기
                          </button>
                          {isPartnerViewing && isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#f5c2e7', fontFamily: 'var(--font-pixel)', letterSpacing: '0px', textShadow: '0 0 6px rgba(245, 194, 231, 0.8)' }}>
                              👀🔥 함께 보는 중
                            </span>
                          )}
                          {isPartnerViewing && !isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#fab387', fontFamily: 'var(--font-pixel)', letterSpacing: '0px' }}>
                              👀 상대 보는 중
                            </span>
                          )}
                          {!isPartnerViewing && isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#a6e3a1', fontFamily: 'var(--font-pixel)', letterSpacing: '0px' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: isMe ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenWebUrl) {
                                onOpenWebUrl(webUrl);
                              } else {
                                window.dispatchEvent(new CustomEvent('on_house_open_web_url', { detail: { url: webUrl } }));
                              }
                            }}
                            style={{
                              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                              color: '#ffffff',
                              border: '1px solid rgba(255, 255, 255, 0.4)',
                              borderRadius: '4px',
                              padding: '3px 8px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-pixel)',
                              fontWeight: 'normal',
                              letterSpacing: '0px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
                              outline: 'none'
                            }}
                            title="웹사이트 팝업 열기"
                          >
                            🌐 열기
                          </button>
                          {isPartnerViewing && isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#f5c2e7', fontFamily: 'var(--font-pixel)', letterSpacing: '0px', textShadow: '0 0 6px rgba(245, 194, 231, 0.8)' }}>
                              👀🔥 함께 보는 중
                            </span>
                          )}
                          {isPartnerViewing && !isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#fab387', fontFamily: 'var(--font-pixel)', letterSpacing: '0px' }}>
                              👀 상대 보는 중
                            </span>
                          )}
                          {!isPartnerViewing && isMeViewing && (
                            <span style={{ fontSize: '10px', color: '#a6e3a1', fontFamily: 'var(--font-pixel)', letterSpacing: '0px' }}>
                              👀 보는 중
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* KakaoTalk Side Meta: Unread '1' & Group Time */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                  lineHeight: '1.2',
                  flexShrink: 0,
                  marginBottom: '2px',
                  fontFamily: 'var(--font-pixel)',
                  letterSpacing: '0px'
                }}>
                  {/* Unread '1' Badge for My Sent Messages */}
                  {isMe && !msg.read && (
                    <span style={{
                      color: '#f6c177',
                      fontSize: '10px',
                      fontFamily: 'var(--font-pixel)',
                      letterSpacing: '0px',
                      marginBottom: isLastInGroup ? '2px' : '0px'
                    }}>
                      1
                    </span>
                  )}

                  {/* Time Badge (Displayed ONLY on the LAST message of the consecutive minute group) */}
                  {isLastInGroup && (
                    <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.45)', whiteSpace: 'nowrap', fontFamily: 'var(--font-pixel)', letterSpacing: '0px' }}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        {!activeTarget.isOnline && (
          <div style={{
            display: 'flex', gap: '8px', background: 'rgba(243, 139, 168, 0.1)',
            padding: '10px', borderRadius: '8px', border: '1px solid rgba(243, 139, 168, 0.2)',
            marginTop: 'auto', marginBottom: '8px', fontFamily: 'var(--font-pixel)', letterSpacing: '0px'
          }}>
            <ShieldAlert size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '11px', color: 'var(--danger)', lineHeight: '1.4', margin: 0, fontFamily: 'var(--font-pixel)', letterSpacing: '0px' }}>
              상대방이 오프라인 상태입니다. 쪽지를 전송하면 보관함에 저장되어, 상대방이 재접속 시 확인 가능합니다.
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border-glass)',
        display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(0,0,0,0.1)'
      }}>
        <input
          type="text"
          placeholder="메시지를 입력하세요..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyPress}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-glass)',
            color: '#fff', fontSize: '12px', fontFamily: 'var(--font-pixel)', letterSpacing: '0px', outline: 'none'
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          style={{
            background: 'var(--primary)', color: '#fff',
            width: '38px', height: '38px', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px var(--primary-glow)',
            cursor: 'pointer'
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};
