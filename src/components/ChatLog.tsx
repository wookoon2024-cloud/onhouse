import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, ChevronRight, ChevronLeft } from 'lucide-react';

interface ChatMessage {
  id: string;
  senderName: string;
  text: string;
  time: number;
}

interface ChatLogProps {
  logs: ChatMessage[];
}

export const ChatLog: React.FC<ChatLogProps> = ({ logs }) => {
  const [isOpen, setIsOpen] = useState(true);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isOpen]);

  return (
    <div style={{
      position: 'absolute', left: isOpen ? '20px' : '-280px', top: '80px',
      width: '300px', height: 'calc(100vh - 200px)', zIndex: 90,
      display: 'flex', transition: 'left 0.3s ease'
    }}>
      {/* Main chat box */}
      <div className="glass-panel" style={{
        flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
        borderRight: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0,
        height: '100%', border: '1px solid rgba(255, 255, 255, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
          <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
          <h4 className="pixel-text" style={{ fontSize: '13px', margin: 0 }}>전체 대화 로그</h4>
        </div>
        
        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px',
          paddingRight: '4px'
        }}>
          {logs.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
              fontSize: '11px', color: 'var(--text-muted)'
            }}>
              대화가 시작되지 않았습니다.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 'bold', color: 'var(--accent)',
                  fontFamily: 'var(--font-pixel)'
                }}>
                  {log.senderName}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  {log.text}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '28px', height: '56px', background: 'var(--bg-panel)',
          backdropFilter: 'blur(16px)', border: '1px solid var(--border-glass)',
          borderLeft: 'none', borderTopRightRadius: '8px', borderBottomRightRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)', alignSelf: 'center'
        }}
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </div>
  );
};
