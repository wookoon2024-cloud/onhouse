import React, { useState, useEffect, useRef } from 'react';

interface WebBrowserModalProps {
  url: string;
  onClose: () => void;
  isMessengerOpen?: boolean;
}

export const WebBrowserModal: React.FC<WebBrowserModalProps> = ({
  url,
  onClose
}) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Extract domain for title
  const domain = React.useMemo(() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }, [url]);

  // Absolute initial pixel position state
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (isMobile) {
      return {
        x: Math.max(10, Math.round((window.innerWidth - Math.min(540, window.innerWidth - 20)) / 2)),
        y: Math.max(10, Math.round((window.innerHeight - 350) / 2))
      };
    }
    return {
      x: Math.max(10, Math.round(window.innerWidth / 2 + 15)),
      y: Math.max(10, Math.round(window.innerHeight / 2 - 225))
    };
  });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0
  });

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

  return (
    <div
      ref={modalRef}
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: 'none',
        width: isMobile ? 'calc(100vw - 20px)' : '540px',
        height: isMobile ? '350px' : '450px',
        minWidth: '320px',
        minHeight: '220px',
        maxWidth: '92vw',
        maxHeight: '88vh',
        resize: isMobile ? 'none' : 'both',
        overflow: 'hidden',
        background: 'rgba(15, 15, 25, 0.98)',
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
            onClick={() => {
              onClose();
              window.dispatchEvent(new Event('on_house_refocus_messenger'));
            }}
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
