import React, { useState, useEffect, useRef } from 'react';
import { type DirectMessage, type PlayerState, getDMs, saveDM, markDMsAsRead } from '../game/syncManager';
import { Send, MessageSquare, ShieldAlert } from 'lucide-react';

interface MessengerProps {
  localPlayer: PlayerState;
  activeTarget: PlayerState | null; // Selected user to DM
  onClose: () => void;
  onSendDM: (toId: string, text: string) => void;
}

export const Messenger: React.FC<MessengerProps> = ({
  localPlayer,
  activeTarget,
  onClose,
  onSendDM
}) => {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
      setMessages(chatDMs);
      
      // Mark as read
      markDMsAsRead(activeTarget.id, localPlayer.id);
    }
  };

  useEffect(() => {
    loadHistory();
    // Poll history every 500ms to instantly catch updates from other tabs
    const interval = setInterval(loadHistory, 500);
    return () => clearInterval(interval);
  }, [activeTarget, localPlayer.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

    // Save locally
    saveDM(newDM);
    
    // Broadcast via BroadcastChannel (implemented in App.tsx)
    onSendDM(activeTarget.id, inputText.trim());

    setInputText('');
    loadHistory();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  if (!activeTarget) return null;

  return (
    <div className="glass-panel" style={{
      position: 'absolute', 
      left: window.innerWidth < 768 ? '15px' : '50%',
      right: window.innerWidth < 768 ? '15px' : 'auto',
      top: '50%',
      transform: window.innerWidth < 768 ? 'translateY(-50%)' : 'translate(-50%, -50%)',
      width: window.innerWidth < 768 ? 'auto' : '380px',
      height: window.innerWidth < 768 ? '80%' : '420px',
      maxHeight: '90%',
      display: 'flex', flexDirection: 'column', zIndex: 110,
      border: '1px solid rgba(255, 255, 255, 0.15)', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px', borderBottom: '1px solid var(--border-glass)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageSquare size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h4 className="pixel-text" style={{ fontSize: '13px', margin: 0 }}>
              {activeTarget.nickname}
            </h4>
            <span style={{ fontSize: '10px', color: activeTarget.isOnline ? 'var(--success)' : 'var(--text-muted)' }}>
              {activeTarget.isOnline ? '● 온라인' : `● 오프라인 (${activeTarget.statusMessage || '부재중'})`}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px'
          }}
        >
          닫기
        </button>
      </div>

      {/* Messages List */}
      <div style={{
        flex: 1, padding: '16px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: '12px',
        background: 'rgba(0, 0, 0, 0.15)'
      }}>
        {messages.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: 'var(--text-muted)',
            textAlign: 'center', gap: '8px'
          }}>
            <MessageSquare size={24} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: '12px' }}>대화 내역이 없습니다.<br />첫 메시지를 보내보세요!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.fromId === localPlayer.id;
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start'
                }}
              >
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  lineHeight: '1.4',
                  background: isMe ? 'var(--primary)' : 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  boxShadow: isMe ? '0 2px 8px var(--primary-glow)' : 'none',
                  border: isMe ? 'none' : '1px solid var(--border-glass)'
                }}>
                  {msg.text}
                </div>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        {!activeTarget.isOnline && (
          <div style={{
            display: 'flex', gap: '8px', background: 'rgba(243, 139, 168, 0.1)',
            padding: '10px', borderRadius: '8px', border: '1px solid rgba(243, 139, 168, 0.2)',
            marginTop: 'auto', marginBottom: '8px'
          }}>
            <ShieldAlert size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '11px', color: 'var(--danger)', lineHeight: '1.4', margin: 0 }}>
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
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="메시지를 입력하세요..."
          style={{ flex: 1, padding: '10px 14px', fontSize: '12px' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          style={{
            background: inputText.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
            color: inputText.trim() ? '#fff' : 'var(--text-muted)',
            width: '36px', height: '36px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: inputText.trim() ? '0 0 10px var(--primary-glow)' : 'none'
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
};
