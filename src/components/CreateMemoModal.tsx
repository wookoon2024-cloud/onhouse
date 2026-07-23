import React, { useState } from 'react';
import { FileText, Image as ImageIcon, X, Sparkles, Send, Bell } from 'lucide-react';
import type { MemoType, MapMemo } from '../types/memo';

interface CreateMemoModalProps {
  mapId: string;
  x: number;
  y: number;
  authorId: string;
  authorName: string;
  onSubmit: (memo: MapMemo) => void;
  onClose: () => void;
}

export const CreateMemoModal: React.FC<CreateMemoModalProps> = ({
  mapId,
  x,
  y,
  authorId,
  authorName,
  onSubmit,
  onClose
}) => {
  const [memoType, setMemoType] = useState<MemoType>('one_time');
  const [content, setContent] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('이미지 크기는 최대 3MB까지 업로드 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !imageUrl) {
      alert('메모 내용이나 사진을 첨부해 주세요!');
      return;
    }

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newMemo: MapMemo = {
      id: `memo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      mapId,
      x,
      y,
      authorId,
      authorName,
      memoType,
      content: content.trim(),
      imageUrl: imageUrl || undefined,
      createdAt: formattedDate
    };

    onSubmit(newMemo);
  };

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
          borderRadius: '16px', padding: '20px', width: '380px', maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.95)', color: '#fff',
          display: 'flex', flexDirection: 'column', gap: '14px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={18} /> 📝 맵에 메모 남기기
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Auto Metadata (Author & Timestamp) */}
        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '11px', color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
          <div>작성자: <strong style={{ color: '#fff' }}>{authorName}</strong></div>
          <div>위치: <strong style={{ color: 'var(--accent)' }}>X:{x}, Y:{y}</strong></div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Memo Type Selector (1회성 vs 공지) */}
          <div>
            <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>메모 종류 선택 (기본: 1회성):</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setMemoType('one_time')}
                style={{
                  padding: '8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                  background: memoType === 'one_time' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                  color: '#fff', border: memoType === 'one_time' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                }}
              >
                <Sparkles size={13} /> 1회성 메모 (주우면 가방 보관)
              </button>
              <button
                type="button"
                onClick={() => setMemoType('notice')}
                style={{
                  padding: '8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                  background: memoType === 'notice' ? 'rgba(245, 194, 231, 0.25)' : 'rgba(255,255,255,0.05)',
                  color: memoType === 'notice' ? '#f5c2e7' : '#ccc',
                  border: memoType === 'notice' ? '1px solid #f5c2e7' : '1px solid var(--border-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                }}
              >
                <Bell size={13} /> 공지 메모 (맵에 영구 유지)
              </button>
            </div>
          </div>

          {/* Content Textarea */}
          <div>
            <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>메모 내용 작성:</label>
            <textarea
              rows={4}
              placeholder="친구들에게 남길 소중한 메모 내용을 입력하세요..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              autoFocus
              style={{
                width: '100%', background: '#0d0d12', border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '12px', outline: 'none',
                resize: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Photo Image Attachment Input */}
          <div>
            <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>사진 첨부 (선택 사항):</label>
            {!imageUrl ? (
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px',
                border: '1px dashed rgba(255,255,255,0.2)', color: '#ccc', fontSize: '11px',
                cursor: 'pointer'
              }}>
                <ImageIcon size={14} /> 📷 이미지 파일 첨부하기
                <input type="file" accept="image/*" onChange={handleImageFileChange} style={{ display: 'none' }} />
              </label>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={imageUrl} alt="Attachment" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--accent)' }} />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  style={{
                    position: 'absolute', top: '-6px', right: '-6px', background: '#ff6b6b',
                    color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer'
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button
              type="submit"
              style={{
                flex: 1, padding: '10px', background: 'var(--primary)', border: 'none',
                borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 'bold',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}
            >
              <Send size={14} /> 📝 맵에 메모 놓기
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)',
                borderRadius: '8px', color: '#ccc', fontSize: '11px', cursor: 'pointer'
              }}
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
