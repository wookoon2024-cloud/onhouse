import React, { useState, useEffect, useRef, useMemo } from 'react';

interface YouTubePlayerModalProps {
  videoId: string;
  onClose: () => void;
  isMessengerOpen?: boolean;
}

export const YouTubePlayerModal: React.FC<YouTubePlayerModalProps> = ({
  videoId,
  onClose,
  isMessengerOpen
}) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Active experimental embedding method tab (1~5)
  const [activeMethod, setActiveMethod] = useState<1 | 2 | 3 | 4 | 5>(1);

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

  // Get iframe properties per method
  const methodProps = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const href = typeof window !== 'undefined' ? window.location.href : '';

    switch (activeMethod) {
      case 1:
        return {
          src: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`,
          referrerPolicy: 'strict-origin-when-cross-origin' as const,
          label: '방식 1: 표준 Embed + ReferrerPolicy'
        };
      case 2:
        return {
          src: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`,
          referrerPolicy: 'strict-origin-when-cross-origin' as const,
          label: '방식 2: No-Cookie Embed'
        };
      case 3:
        return {
          src: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`,
          referrerPolicy: 'origin-when-cross-origin' as const,
          label: '방식 3: JS API + Origin 전달'
        };
      case 4:
        return {
          src: `https://www.youtube.com/embed/${videoId}`,
          referrerPolicy: undefined,
          label: '방식 4: Plain Embed (자동재생 없음)'
        };
      case 5:
        return {
          src: `https://www.youtube.com/embed/${videoId}?autoplay=1&widget_referrer=${encodeURIComponent(href)}`,
          referrerPolicy: 'no-referrer-when-downgrade' as const,
          label: '방식 5: Widget Referrer'
        };
    }
  }, [activeMethod, videoId]);

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    background: isActive ? '#ef4444' : 'rgba(255, 255, 255, 0.08)',
    color: '#ffffff',
    border: isActive ? '1px solid #fca5a5' : '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '4px',
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: 'bold',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    outline: 'none'
  });

  return (
    <div
      style={{
        position: 'fixed',
        ...initialStyle,
        width: isMobile ? 'calc(100vw - 20px)' : '520px',
        height: isMobile ? '320px' : '360px',
        minWidth: '340px',
        minHeight: '250px',
        maxWidth: '90vw',
        maxHeight: '85vh',
        resize: isMobile ? 'none' : 'both',
        overflow: 'hidden',
        background: 'rgba(15, 15, 25, 0.96)',
        backdropFilter: 'blur(16px)',
        borderRadius: '12px',
        border: '2px solid rgba(239, 68, 68, 0.6)',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8), 0 0 24px rgba(239, 68, 68, 0.35)',
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
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(15, 15, 25, 0.9))',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          fontFamily: 'var(--font-pixel)',
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#fff',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#ef4444', fontSize: '14px' }}>🎥</span>
          <span>유튜브 실험 플레이어</span>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', marginLeft: '2px' }}>
            (드래그 이동 / 크기 조절)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button
            type="button"
            onClick={() => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#a6adc8',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            title="유튜브 본사이트에서 보기"
          >
            🔗 원본 탭
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
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            ❌ 닫기
          </button>
        </div>
      </div>

      {/* Experimental Embed Method Selector Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '5px 8px',
        background: 'rgba(0, 0, 0, 0.5)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        overflowX: 'auto',
        fontFamily: 'var(--font-pixel)',
        fontSize: '10px',
        flexShrink: 0
      }}>
        <span style={{ color: '#a6adc8', flexShrink: 0, fontWeight: 'bold' }}>방식 선택:</span>
        <button type="button" onClick={() => setActiveMethod(1)} style={tabStyle(activeMethod === 1)}>1: ReferrerPolicy</button>
        <button type="button" onClick={() => setActiveMethod(2)} style={tabStyle(activeMethod === 2)}>2: No-Cookie</button>
        <button type="button" onClick={() => setActiveMethod(3)} style={tabStyle(activeMethod === 3)}>3: Origin</button>
        <button type="button" onClick={() => setActiveMethod(4)} style={tabStyle(activeMethod === 4)}>4: Plain</button>
        <button type="button" onClick={() => setActiveMethod(5)} style={tabStyle(activeMethod === 5)}>5: Widget Referrer</button>
      </div>

      {/* Active Method Status Bar */}
      <div style={{
        padding: '3px 8px',
        background: 'rgba(239, 68, 68, 0.15)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
        fontSize: '10px',
        color: '#fca5a5',
        fontFamily: 'var(--font-pixel)',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justify: 'space-between',
        flexShrink: 0
      }}>
        <span>현재 테스트 중: {methodProps.label}</span>
      </div>

      {/* Video Frame Container */}
      <div style={{ flex: 1, width: '100%', background: '#000', position: 'relative' }}>
        <iframe
          key={`yt_frame_${activeMethod}_${videoId}`}
          width="100%"
          height="100%"
          src={methodProps.src}
          referrerPolicy={methodProps.referrerPolicy}
          title="YouTube Video Player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ display: 'block', width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
};
