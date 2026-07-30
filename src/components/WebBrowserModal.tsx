import React, { useState, useEffect, useRef, useMemo } from 'react';

interface WebBrowserModalProps {
  url: string;
  onClose: () => void;
  isMessengerOpen?: boolean;
}

export const WebBrowserModal: React.FC<WebBrowserModalProps> = ({
  url,
  onClose,
  isMessengerOpen
}) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Extract domain for title
  const domain = useMemo(() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }, [url]);

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
        border: '2px solid rgba(56, 189, 248, 0.6)',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8), 0 0 24px rgba(56, 189, 248, 0.35)',
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
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(15, 15, 25, 0.9))',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          fontFamily: 'var(--font-pixel)',
          fontSize: '11px',
          color: '#fff',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
          <span style={{ color: '#38bdf8', fontSize: '13px', flexShrink: 0 }}>🌐</span>
          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {domain}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => window.open(url, '_blank')}
            style={{
              background: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              color: '#7dd3fc',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '10px',
              fontFamily: 'var(--font-pixel)',
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
              fontSize: '10px',
              fontFamily: 'var(--font-pixel)',
              cursor: 'pointer'
            }}
          >
            ❌ 닫기
          </button>
        </div>
      </div>

      {/* Web View Iframe Container */}
      <div style={{ flex: 1, width: '100%', background: '#fff', position: 'relative' }}>
        <iframe
          key={url}
          width="100%"
          height="100%"
          src={url}
          title="Web View Browser"
          frameBorder="0"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
          style={{ display: 'block', width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
};
