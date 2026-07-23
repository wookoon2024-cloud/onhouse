import React from 'react';
import { FileText, X, Sparkles, Bell, Briefcase } from 'lucide-react';
import type { MapMemo } from '../types/memo';

interface ViewMemoModalProps {
  memo: MapMemo;
  onPickup?: () => void;
  onClose: () => void;
}

export const ViewMemoModal: React.FC<ViewMemoModalProps> = ({
  memo,
  onPickup,
  onClose
}) => {
  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(6px)',
        zIndex: 1500, display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#181825', border: '1px solid var(--accent)',
          borderRadius: '16px', padding: '22px', width: '400px', maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.95)', color: '#fff',
          display: 'flex', flexDirection: 'column', gap: '14px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={18} /> 📜 남겨진 메모 확인
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Memo Type & Metadata Badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{
            fontSize: '11px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '6px',
            background: memo.memoType === 'one_time' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(245, 194, 231, 0.2)',
            color: memo.memoType === 'one_time' ? 'var(--accent)' : '#f5c2e7',
            border: memo.memoType === 'one_time' ? '1px solid var(--accent)' : '1px solid #f5c2e7',
            display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            {memo.memoType === 'one_time' ? <Sparkles size={13} /> : <Bell size={13} />}
            {memo.memoType === 'one_time' ? '1회성 메모 (주우면 가방 보관)' : '공지 메모 (영구 안내)'}
          </div>

          <div style={{ fontSize: '11px', color: '#888' }}>
            {memo.createdAt}
          </div>
        </div>

        {/* Author info */}
        <div style={{ fontSize: '12px', color: '#ccc', background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: '6px' }}>
          ✍️ 작성자: <strong style={{ color: '#fff' }}>{memo.authorName}</strong>
        </div>

        {/* Text Content */}
        {memo.content && (
          <div style={{
            background: '#0d0d12', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '13px',
            lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: '180px', overflowY: 'auto'
          }}>
            {memo.content}
          </div>
        )}

        {/* Attached Photo */}
        {memo.imageUrl && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={memo.imageUrl}
              alt="Memo Attachment"
              style={{
                maxWidth: '100%', maxHeight: '200px', objectFit: 'contain',
                borderRadius: '8px', border: '1px solid var(--border-glass)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
              }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          {memo.memoType === 'one_time' && onPickup && (
            <button
              onClick={onPickup}
              style={{
                flex: 1, padding: '10px', background: 'var(--primary)', border: 'none',
                borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 'bold',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <Briefcase size={14} /> 🎒 주워서 장비함에 넣기
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: memo.memoType === 'one_time' && onPickup ? 0.4 : 1,
              padding: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)',
              borderRadius: '8px', color: '#ccc', fontSize: '12px', cursor: 'pointer'
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
