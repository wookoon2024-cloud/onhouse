import React, { useState, useEffect, useRef, useMemo } from 'react';

interface WebBrowserModalProps {
  url: string;
  onClose: () => void;
  isMessengerOpen?: boolean;
  isSyncActive?: boolean;
  onToggleSync?: () => void;
  onNavigateUrl?: (newUrl: string) => void;
}

export const WebBrowserModal: React.FC<WebBrowserModalProps> = ({
  url,
  onClose,
  isMessengerOpen,
  isSyncActive,
  onToggleSync,
  onNavigateUrl
}) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [inputUrl, setInputUrl] = useState(url);

  // Sync internal input state when prop url changes
  useEffect(() => {
    setInputUrl(url);
  }, [url]);

  // Extract domain for title
  const domain = useMemo(() => {
    try {
      return new URL(inputUrl || url).hostname;
    } catch {
      return inputUrl || url;
    }
  }, [inputUrl, url]);

  // Auto-detect URL changes inside iframe on load or navigation interval
  const checkAndUpdateIframeUrl = () => {
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        const currentHref = iframeRef.current.contentWindow.location.href;
        if (currentHref && currentHref !== 'about:blank' && currentHref !== inputUrl) {
          setInputUrl(currentHref);
          if (isSyncActive && onNavigateUrl) {
            onNavigateUrl(currentHref);
          }
        }
      }
    } catch (e) {
      // Cross-origin restriction may catch here if the iframe domain differs
    }
  };

  // Poll iframe location every 600ms while window is open
  useEffect(() => {
    const interval = setInterval(checkAndUpdateIframeUrl, 600);
    return () => clearInterval(interval);
  }, [inputUrl, isSyncActive]);

  // Custom position state for dragging
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0
  });

  // Calculate default initial position
  const initialStyle = useMemo(() => {
    if (pos) return { left: `${pos.x}px`, top: `${pos.y}px`, transform: 'none' };

    if (isMobile) {
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
    }
    if (isMessengerOpen) {
      // Attached right next to 1:1 Messenger Window!
      return { left: 'calc(50% + 205px)', top: '50%', transform: 'translateY(-50%)' };
    }
    // Default: Bottom right above chat bar
    return { right: '20px', bottom: '140px', transform: 'none' };
  }, [pos, isMobile, isMessengerOpen]);

  // Drag Handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    isDraggingRef.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const modalEl = (e.currentTarget as HTMLElement).parentElement;
    const rect = modalEl?.getBoundingClientRect();

    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initX: rect ? rect.left : window.innerWidth / 2,
      initY: rect ? rect.top : window.innerHeight / 2
    };
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const dx = clientX - dragStartRef.current.startX;
      const dy = clientY - dragStartRef.current.startY;

      const nextX = Math.max(10, Math.min(window.innerWidth - 100, dragStartRef.current.initX + dx));
      const nextY = Math.max(10, Math.min(window.innerHeight - 100, dragStartRef.current.initY + dy));

      setPos({ x: nextX, y: nextY });
    };

    const handleEnd = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, []);

  const handleGo = () => {
    if (!inputUrl.trim()) return;
    let finalUrl = inputUrl.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }
    if (onNavigateUrl) {
      onNavigateUrl(finalUrl);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        ...initialStyle,
        width: isMobile ? 'calc(100vw - 20px)' : '540px',
        height: isMobile ? '350px' : '450px',
        minWidth: '320px',
        minHeight: '220px',
        maxWidth: '92vw',
        maxHeight: '88vh',
        resize: isMobile ? 'none' : 'both',
        overflow: 'hidden',
        background: 'rgba(15, 15, 25, 0.96)',
        backdropFilter: 'blur(16px)',
        borderRadius: '12px',
        border: isSyncActive ? '2px solid #10b981' : '2px solid rgba(56, 189, 248, 0.6)',
        boxShadow: isSyncActive
          ? '0 16px 48px rgba(0, 0, 0, 0.8), 0 0 24px rgba(16, 185, 129, 0.4)'
          : '0 16px 48px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.35)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Draggable Header Bar */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          padding: '8px 12px',
          background: isSyncActive
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.35), rgba(15, 15, 25, 0.9))'
            : 'linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(15, 15, 25, 0.9))',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          fontFamily: 'var(--font-pixel)',
          fontSize: '12px',
          color: '#fff',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
          <span style={{ color: isSyncActive ? '#6ee7b7' : '#38bdf8', fontSize: '14px', flexShrink: 0 }}>
            {isSyncActive ? '📡' : '🌐'}
          </span>
          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {domain}
          </span>
          {isSyncActive && (
            <span style={{ fontSize: '9px', background: '#10b981', color: '#fff', padding: '1px 6px', borderRadius: '4px', marginLeft: '4px' }}>
              공유 중
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => window.open(inputUrl || url, '_blank')}
            style={{
              background: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              color: '#7dd3fc',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            title="새 탭에서 사이트 열기"
          >
            🔗 새 탭 열기
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#fff',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            ❌ 닫기
          </button>
        </div>
      </div>

      {/* Address Bar & Co-Browsing Sync Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 10px',
        background: 'rgba(0, 0, 0, 0.45)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        fontSize: '11px',
        fontFamily: 'var(--font-pixel)'
      }}>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGo()}
          placeholder="https://..."
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            color: '#fff',
            padding: '3px 8px',
            fontSize: '11px',
            outline: 'none'
          }}
        />
        <button
          type="button"
          onClick={handleGo}
          style={{
            background: 'rgba(56, 189, 248, 0.3)',
            border: '1px solid rgba(56, 189, 248, 0.5)',
            color: '#fff',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '10px',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          이동/공유
        </button>

        {onToggleSync && (
          <button
            type="button"
            onClick={onToggleSync}
            style={{
              background: isSyncActive
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'rgba(255, 255, 255, 0.1)',
              border: isSyncActive
                ? '1px solid #6ee7b7'
                : '1px solid rgba(255, 255, 255, 0.25)',
              color: '#fff',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: isSyncActive ? '0 0 10px rgba(16, 185, 129, 0.5)' : 'none'
            }}
            title="상대방과 같은 웹페이지를 실시간으로 함께 보기"
          >
            {isSyncActive ? '📡 화면 동기화 중' : '📡 화면 함께보기'}
          </button>
        )}
      </div>

      {/* Sync Tip Notice Bar */}
      <div style={{
        padding: '3px 8px',
        background: 'rgba(10, 10, 18, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        fontSize: '10px',
        color: '#a6adc8',
        fontFamily: 'var(--font-pixel)'
      }}>
        💡 새 페이지 이동 시 주소창 입력 후 <span style={{ color: '#38bdf8' }}>[이동/공유]</span>를 누르거나 탭 내 링크 탐색 시 주소가 자동 갱신 및 실시간 동기화됩니다.
      </div>

      {/* Web View Iframe Container */}
      <div style={{ flex: 1, width: '100%', background: '#fff', position: 'relative' }}>
        <iframe
          ref={iframeRef}
          key={url}
          width="100%"
          height="100%"
          src={url}
          onLoad={checkAndUpdateIframeUrl}
          title="Web View Browser"
          frameBorder="0"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
          style={{ display: 'block', width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
};
