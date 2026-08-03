import React, { useState } from 'react';
import type { PlayerState } from '../game/syncManager';
import { Footprints, MessageSquare, StickyNote, Heart, X } from 'lucide-react';

interface PlayerInteractionModalProps {
  localPlayer: PlayerState;
  targetPlayer: PlayerState;
  onClose: () => void;
  onRequestDMChat: (target: PlayerState) => void;
  onSendReaction: (targetId: string, reactionEmoji: string) => void;
  onLeaveNote: (targetId: string, noteText: string) => void;
  onFollowPlayer: (target: PlayerState) => void;
}

export const PlayerInteractionModal: React.FC<PlayerInteractionModalProps> = ({
  localPlayer,
  targetPlayer,
  onClose,
  onRequestDMChat,
  onSendReaction,
  onLeaveNote,
  onFollowPlayer
}) => {
  const [activeTab, setActiveTab] = useState<'menu' | 'note' | 'reaction'>('menu');

  // Following only makes sense for someone online and standing on the same map as us
  const canFollow = targetPlayer.isOnline !== false && targetPlayer.mapId === localPlayer.mapId;
  const [noteInput, setNoteInput] = useState('');
  const [noteSentToast, setNoteSentToast] = useState(false);

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (noteInput.trim()) {
      onLeaveNote(targetPlayer.id, noteInput.trim());
      setNoteInput('');
      setNoteSentToast(true);
      setTimeout(() => {
        setNoteSentToast(false);
        onClose();
      }, 1500);
    }
  };

  const REACTIONS = [
    { emoji: '❤️', label: '좋아요' },
    { emoji: '👋', label: '인사하기' },
    { emoji: '👏', label: '응원하기' },
    { emoji: '🎉', label: '축하하기' },
    { emoji: '🔥', label: '불타오름' },
    { emoji: '☕', label: '커피한잔' }
  ];

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(4px)',
      zIndex: 150, display: 'flex', justifyContent: 'center', alignItems: 'center'
    }}>
      <div style={{
        width: '320px', background: 'rgba(20, 20, 30, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '10px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7)', color: '#fff',
        fontFamily: 'var(--font-pixel)', fontWeight: 'normal', padding: '16px', display: 'flex',
        flexDirection: 'column', gap: '14px'
      }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: '#a6e3a1',
              boxShadow: '0 0 8px #a6e3a1'
            }} />
            <span style={{ fontSize: '13px', fontWeight: 'normal', color: '#cdd6f4' }}>
              {targetPlayer.nickname}
            </span>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(166, 227, 161, 0.15)',
              color: '#a6e3a1',
              border: '1px solid rgba(166, 227, 161, 0.3)',
              fontWeight: 'normal'
            }}>
              온라인
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#a6adc8',
              cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Target Profile Card Summary */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.35)', padding: '10px 12px', borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.2)',
            border: '1px solid var(--accent)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontSize: '18px'
          }}>
            👤
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 'normal' }}>
              {targetPlayer.statusMessage ? `⚡ ${targetPlayer.statusMessage}` : '상태 메시지 없음'}
            </div>
            <div style={{ fontSize: '10px', color: '#a6adc8', marginTop: '2px', fontWeight: 'normal' }}>
              {targetPlayer.isOnline ? '온하우스 온라인 탐험 중' : '오프라인 부재 중'}
            </div>
          </div>
        </div>

        {/* Tab Views */}
        {activeTab === 'menu' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* 1. Follow this player */}
            <button
              onClick={() => {
                onFollowPlayer(targetPlayer);
                onClose();
              }}
              disabled={!canFollow}
              style={{
                padding: '10px 8px',
                background: canFollow ? 'rgba(137, 180, 250, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                border: canFollow ? '1px solid #89b4fa' : '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '6px', color: canFollow ? '#fff' : '#6c7086',
                fontSize: '11px', fontWeight: 'normal', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '5px', cursor: canFollow ? 'pointer' : 'not-allowed'
              }}
              title={
                canFollow
                  ? '이 사용자를 자동으로 따라다닙니다 (직접 움직이면 해제)'
                  : '같은 맵에 접속한 온라인 사용자만 따라다닐 수 있습니다'
              }
            >
              <Footprints size={18} style={{ color: canFollow ? '#89b4fa' : '#6c7086' }} />
              <span>따라다니기</span>
            </button>

            {/* 2. Request 1:1 Chat */}
            <button
              onClick={() => {
                onRequestDMChat(targetPlayer);
                onClose();
              }}
              disabled={!targetPlayer.isOnline}
              style={{
                padding: '10px 8px', background: targetPlayer.isOnline ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.02)',
                border: targetPlayer.isOnline ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '6px', color: targetPlayer.isOnline ? '#fff' : '#6c7086', fontSize: '11px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                cursor: targetPlayer.isOnline ? 'pointer' : 'not-allowed', fontWeight: 'normal'
              }}
              title={targetPlayer.isOnline ? '1:1 놀기 신청' : '오프라인 사용자에겐 1:1 놀기를 신청할 수 없습니다'}
            >
              <MessageSquare size={18} style={{ color: targetPlayer.isOnline ? 'var(--accent)' : '#6c7086' }} />
              <span>1:1 놀기</span>
            </button>

            {/* 3. Leave Note */}
            <button
              onClick={() => setActiveTab('note')}
              style={{
                padding: '10px 8px', background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px',
                color: '#fff', fontSize: '11px', fontWeight: 'normal', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '5px', cursor: 'pointer'
              }}
            >
              <StickyNote size={18} style={{ color: '#f9e2af' }} />
              <span>메모남기기</span>
            </button>

            {/* 4. Send Reaction */}
            <button
              onClick={() => setActiveTab('reaction')}
              style={{
                padding: '10px 8px', background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px',
                color: '#fff', fontSize: '11px', fontWeight: 'normal', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '5px', cursor: 'pointer'
              }}
            >
              <Heart size={18} style={{ color: '#f38ba8' }} />
              <span>반응하기</span>
            </button>
          </div>
        )}

        {/* Sub-Tab: Leave Note */}
        {activeTab === 'note' && (
          <form onSubmit={handleNoteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: '#f9e2af' }}>
              📝 {targetPlayer.nickname} 님에게 전달할 남김 메모 작성:
            </div>
            <textarea
              rows={3}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="메모 내용을 입력하세요..."
              style={{
                width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '4px', padding: '8px', color: '#fff', fontSize: '11px', outline: 'none', resize: 'none',
                fontWeight: 'normal'
              }}
            />
            {noteSentToast ? (
              <div style={{ color: '#a6e3a1', fontSize: '11px', fontWeight: 'normal', textAlign: 'center', padding: '4px' }}>
                ✓ 메모가 전송되었습니다!
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  style={{
                    flex: 1, padding: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px', color: '#fff', fontSize: '11px', fontWeight: 'normal', cursor: 'pointer'
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!noteInput.trim()}
                  style={{
                    flex: 1, padding: '8px', background: 'var(--primary)', border: 'none',
                    borderRadius: '4px', color: '#fff', fontSize: '11px', fontWeight: 'normal', cursor: 'pointer'
                  }}
                >
                  메모 보내기
                </button>
              </div>
            )}
          </form>
        )}

        {/* Sub-Tab 3: Reactions Grid */}
        {activeTab === 'reaction' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '11px', color: '#f38ba8' }}>
              👏 {targetPlayer.nickname} 님에게 감정 표현 보내기:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {REACTIONS.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => {
                    onSendReaction(targetPlayer.id, r.emoji);
                    onClose();
                  }}
                  style={{
                    padding: '8px 4px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
                    color: '#fff', fontSize: '11px', fontWeight: 'normal', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: '2px', cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{r.emoji}</span>
                  <span style={{ fontSize: '9px', color: '#a6adc8' }}>{r.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setActiveTab('menu')}
              style={{
                padding: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px', color: '#fff', fontSize: '11px', fontWeight: 'normal', cursor: 'pointer', marginTop: '4px'
              }}
            >
              ◀ 메뉴로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
