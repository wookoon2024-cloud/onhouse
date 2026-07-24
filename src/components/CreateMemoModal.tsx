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
        background: 'rgba(0, 0, 0, 0.65)',
        zIndex: 1500, display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#181825', border: '1px solid var(--accent)',
          borderRadius: '10px', padding: '16px', width: '330px', maxWidth: '95vw',
          boxShadow: '0 12px 40px rgba(0,0,0,0.8)', color: '#fff',
          display: 'flex', flexDirection: 'column', gap: '10px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
          <div style={{ fontSize: '13px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={15} /> 메모 남기기
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0 }}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Memo Type Selector (1회성 vs 공지) */}
          <div>
            <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px' }}>메모 종류 선택 (기본: 1회성):</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setMemoType('one_time')}
                style={{
                  padding: '6px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: 'normal', cursor: 'pointer',
                  background: memoType === 'one_time' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                  color: '#fff', border: memoType === 'one_time' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                }}
              >
                <Sparkles size={11} /> 1회성 메모 (주우면 가방 보관)
              </button>
              <button
                type="button"
                onClick={() => setMemoType('notice')}
                style={{
                  padding: '6px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: 'normal', cursor: 'pointer',
                  background: memoType === 'notice' ? 'rgba(245, 194, 231, 0.25)' : 'rgba(255,255,255,0.05)',
                  color: memoType === 'notice' ? '#f5c2e7' : '#ccc',
                  border: memoType === 'notice' ? '1px solid #f5c2e7' : '1px solid var(--border-glass)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                }}
              >
                <Bell size={11} /> 공지 메모 (맵에 영구 유지)
              </button>
            </div>
          </div>

          {/* Content Textarea */}
          <div>
            <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px' }}>메모 내용 작성:</label>
            <textarea
              rows={3}
              placeholder="친구들에게 남길 소중한 메모 내용을 입력하세요..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              autoFocus
              style={{
                width: '100%', background: '#0d0d12', border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '11px', outline: 'none',
                resize: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Photo Image Attachment Input */}
          <div>
            <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '4px' }}>사진 첨부 (선택 사항):</label>
            {!imageUrl ? (
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px',
                border: '1px dashed rgba(255,255,255,0.2)', color: '#ccc', fontSize: '10px',
                cursor: 'pointer'
              }}>
                <ImageIcon size={13} /> 📷 이미지 파일 첨부하기
                <input type="file" accept="image/*" onChange={handleImageFileChange} style={{ display: 'none' }} />
              </label>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={imageUrl} alt="Attachment" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--accent)' }} />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  style={{
                    position: 'absolute', top: '-6px', right: '-6px', background: '#ff6b6b',
                    color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer'
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              type="submit"
              style={{
                flex: 1, padding: '7px', background: 'var(--primary)', border: 'none',
                borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 'normal',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
              }}
            >
              <Send size={12} /> 메모 놓기
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)',
                borderRadius: '6px', color: '#ccc', fontSize: '10px', fontWeight: 'normal', cursor: 'pointer'
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
